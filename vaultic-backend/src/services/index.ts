/**
 * Service-layer barrel (Task 19).
 *
 * Re-exports the five services so downstream consumers can
 * `import { SseHub, VaulticEventListener } from '@/services'` rather than
 * chasing individual files. Keeping the barrel narrow — class + factory
 * exports only, no implementation detail — avoids bloating every caller's
 * type-graph with helper types they don't need.
 */
export {
  getAnchorProgram,
  getConnection,
  __resetAnchorClientCacheForTests,
  type AnchorClientConfig,
} from './anchorClient';

export {
  VaulticEventListener,
  type EventListenerConfig,
} from './eventListener';

export {
  SseHub,
  SSE_HEARTBEAT_MS,
  SSE_CONNECTION_TTL_MS,
  SSE_MAX_CONNECTIONS_PER_IP,
  type SseEvent,
  type SseHubOptions,
} from './sse';

export {
  IkaPoller,
  IKA_POLL_INTERVAL_MS,
  type IkaPollerConfig,
  type IkaPollerOptions,
} from './ikaPoller';

export {
  AUDIT_ACTION,
  recordAuditEntry,
  type AuditActionType,
  type RecordAuditEntryInput,
} from './auditLog';
