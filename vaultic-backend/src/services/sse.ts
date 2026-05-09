/**
 * SSE broadcast hub (Task 19.3, Req 12.1).
 *
 * Keyed by treasury address: the frontend subscribes to a single
 * `/api/events/treasury/:address` stream and receives every event projected
 * for that treasury — PayrollRun updates, Claim status changes, DKG
 * transitions. We fan events out from the event listener and Ika poller
 * through this hub so those services stay decoupled from the HTTP layer.
 *
 * Policy (design §3.2.4, SSE rate limiter block):
 *   • cap: 5 concurrent connections per IP → reject the 6th with 429
 *   • TTL: 1 hour per connection → server closes, client reconnects
 *   • heartbeat: SSE comment frame (`:\n\n`) every 30 s to keep proxies
 *     from idling the socket and to surface half-open connections to the
 *     client. Comment frames are ignored by the EventSource API so they
 *     don't pollute consumer state.
 *
 * The hub holds no persistent state; if the process restarts, clients
 * reconnect and get the current snapshot from the REST endpoints. There is
 * intentionally no buffering of missed events in-memory — the authoritative
 * source is on-chain, and the event listener's backfill (Task 19.2,
 * `getSignaturesForAddress`) closes the gap.
 */
import type { Request, Response } from 'express';

import { logger } from '../utils/logger';

/** Heartbeat interval per design §3.2.4 — 30 s. */
export const SSE_HEARTBEAT_MS = 30_000;
/** Per-connection TTL per design §3.2.4 — 1 hour. */
export const SSE_CONNECTION_TTL_MS = 60 * 60 * 1000;
/** Per-IP concurrent-connection cap per design §3.2.4 — 5 streams. */
export const SSE_MAX_CONNECTIONS_PER_IP = 5;

/** Shape of an outbound SSE event. `type` becomes the SSE `event:` field. */
export interface SseEvent {
  /**
   * SSE `event:` field. Frontend listeners dispatch on this value
   * (`source.addEventListener('PayrollExecutionStarted', …)`).
   */
  type: string;
  /** Arbitrary payload, serialised via `JSON.stringify` into the `data:` field. */
  data: unknown;
}

/**
 * One live connection tracked by the hub. Held in two indices
 * simultaneously — `byTreasury` for fan-out and `byIp` for the per-IP cap —
 * so `unregister` must remove from both.
 */
interface SseConnection {
  readonly treasuryAddress: string;
  readonly ip: string;
  readonly res: Response;
  readonly createdAt: number;
  readonly heartbeat: NodeJS.Timeout;
  readonly ttl: NodeJS.Timeout;
}

/**
 * Extract the best-effort client IP. Behind a trusted proxy Express
 * populates `req.ip` from `X-Forwarded-For` already (`trust proxy` is set
 * in `src/index.ts`), so this helper just normalises undefined cases.
 * `req.ip` is typed `string` in Express 5 but older middleware stacks can
 * unset it; fall back to the socket address.
 */
function extractIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/** Configuration overrides — exposed for tests so they can shrink timers. */
export interface SseHubOptions {
  heartbeatMs?: number;
  connectionTtlMs?: number;
  maxConnectionsPerIp?: number;
}

export class SseHub {
  private readonly heartbeatMs: number;
  private readonly connectionTtlMs: number;
  private readonly maxConnectionsPerIp: number;

  /** Fan-out index: treasury address → live connections for that treasury. */
  private readonly byTreasury: Map<string, Set<SseConnection>> = new Map();
  /** Rate-limit index: client IP → live connections from that IP. */
  private readonly byIp: Map<string, Set<SseConnection>> = new Map();

  /** Set to true after `close()` — prevents new `register()` calls. */
  private closed = false;

  constructor(options: SseHubOptions = {}) {
    this.heartbeatMs = options.heartbeatMs ?? SSE_HEARTBEAT_MS;
    this.connectionTtlMs =
      options.connectionTtlMs ?? SSE_CONNECTION_TTL_MS;
    this.maxConnectionsPerIp =
      options.maxConnectionsPerIp ?? SSE_MAX_CONNECTIONS_PER_IP;
  }

  /**
   * Attach a new SSE client. Sets SSE-compatible headers, enforces the
   * per-IP cap, wires heartbeat + TTL timers, and registers the connection
   * in both indices. If the IP is already at capacity, responds 429 and
   * returns without registering.
   *
   * Callers (routers) should pass the request through their rate limiter
   * FIRST so the cheap per-request limit runs before we allocate an
   * EventSource connection here.
   */
  register(treasuryAddress: string, req: Request, res: Response): void {
    if (this.closed) {
      res.status(503).json({ error: 'SSE hub shutting down', code: 'SHUTDOWN' });
      return;
    }

    const ip = extractIp(req);
    const existingForIp = this.byIp.get(ip);
    if (existingForIp && existingForIp.size >= this.maxConnectionsPerIp) {
      // 429 keeps the policy consistent with the HTTP rate limiter so the
      // frontend sees the same status code for any "slow down" outcome.
      res.status(429).json({
        error: `Too many SSE connections from this IP (max ${this.maxConnectionsPerIp})`,
        code: 'SSE_CONNECTION_LIMIT',
      });
      return;
    }

    // SSE framing headers. `X-Accel-Buffering: no` disables nginx's default
    // response buffering so events flush to the client immediately.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Send a one-time comment frame so the client sees "open" immediately
    // even if no real events fire for a while.
    res.write(': connected\n\n');

    const connection: SseConnection = {
      treasuryAddress,
      ip,
      res,
      createdAt: Date.now(),
      heartbeat: setInterval(() => {
        // SSE-spec comment frame — ignored by EventSource but keeps the
        // TCP connection and intermediate proxies awake.
        try {
          res.write(':\n\n');
        } catch (err) {
          logger.warn(
            { err, treasuryAddress, ip },
            'SSE heartbeat write failed; closing connection',
          );
          this.unregister(connection);
        }
      }, this.heartbeatMs),
      ttl: setTimeout(() => {
        logger.info(
          { treasuryAddress, ip, ageMs: this.connectionTtlMs },
          'SSE connection TTL reached; closing',
        );
        this.unregister(connection);
      }, this.connectionTtlMs),
    };

    this.addConnection(connection);

    // Client disconnect (browser navigated away, tab closed) — release
    // timers and index entries.
    req.on('close', () => this.unregister(connection));
  }

  /**
   * Send an event to every connection subscribed to `treasuryAddress`.
   * Dead connections (write throws) are removed from the indices so
   * future broadcasts don't keep tripping on them.
   */
  broadcast(treasuryAddress: string, event: SseEvent): void {
    const subscribers = this.byTreasury.get(treasuryAddress);
    if (!subscribers || subscribers.size === 0) return;

    const payload = this.formatEvent(event);

    // Iterate over a copy so `unregister` calls during the loop (on
    // write errors) don't mutate the set we're walking.
    for (const connection of [...subscribers]) {
      try {
        connection.res.write(payload);
      } catch (err) {
        logger.warn(
          { err, treasuryAddress, ip: connection.ip },
          'SSE broadcast write failed; dropping connection',
        );
        this.unregister(connection);
      }
    }
  }

  /**
   * Shut down the hub — stop accepting new registrations, close every
   * live connection, and clear all timers. Call this from the Express
   * graceful-shutdown hook (Task 20/21).
   */
  close(): void {
    this.closed = true;
    for (const subscribers of this.byTreasury.values()) {
      for (const connection of [...subscribers]) {
        this.unregister(connection);
      }
    }
    // Defensive — the unregister loop above empties the IP index too,
    // but clear it here as well so `close()` is idempotent.
    this.byTreasury.clear();
    this.byIp.clear();
  }

  /** Number of live connections, optionally filtered by treasury. Test helper. */
  connectionCount(treasuryAddress?: string): number {
    if (treasuryAddress === undefined) {
      let total = 0;
      for (const set of this.byTreasury.values()) total += set.size;
      return total;
    }
    return this.byTreasury.get(treasuryAddress)?.size ?? 0;
  }

  /** Number of live connections from a specific IP. Test helper. */
  connectionCountByIp(ip: string): number {
    return this.byIp.get(ip)?.size ?? 0;
  }

  /**
   * Serialise an {@link SseEvent} into the wire format:
   *
   *     event: <type>
   *     data: <JSON>
   *
   *     (blank line)
   *
   * Each frame ends with `\n\n`; a missing blank line leaves the client
   * waiting for more data and nothing dispatches.
   */
  private formatEvent(event: SseEvent): string {
    const dataJson = JSON.stringify(event.data ?? null);
    return `event: ${event.type}\ndata: ${dataJson}\n\n`;
  }

  /** Insert a connection into both indices. */
  private addConnection(connection: SseConnection): void {
    let treasurySet = this.byTreasury.get(connection.treasuryAddress);
    if (!treasurySet) {
      treasurySet = new Set();
      this.byTreasury.set(connection.treasuryAddress, treasurySet);
    }
    treasurySet.add(connection);

    let ipSet = this.byIp.get(connection.ip);
    if (!ipSet) {
      ipSet = new Set();
      this.byIp.set(connection.ip, ipSet);
    }
    ipSet.add(connection);
  }

  /**
   * Remove a connection from both indices, stop its timers, and attempt
   * to end the underlying HTTP response. Safe to call multiple times on
   * the same connection — subsequent calls are no-ops.
   */
  private unregister(connection: SseConnection): void {
    const treasurySet = this.byTreasury.get(connection.treasuryAddress);
    const removedFromTreasury = treasurySet?.delete(connection) ?? false;
    if (treasurySet && treasurySet.size === 0) {
      this.byTreasury.delete(connection.treasuryAddress);
    }

    const ipSet = this.byIp.get(connection.ip);
    ipSet?.delete(connection);
    if (ipSet && ipSet.size === 0) {
      this.byIp.delete(connection.ip);
    }

    // Idempotency: if the connection was already unregistered, skip the
    // timer + response cleanup so second-call unrefs don't double-clear.
    if (!removedFromTreasury) return;

    clearInterval(connection.heartbeat);
    clearTimeout(connection.ttl);

    // Best-effort response close; may throw if the socket already died.
    try {
      connection.res.end();
    } catch {
      // socket already closed — nothing to do
    }
  }
}
