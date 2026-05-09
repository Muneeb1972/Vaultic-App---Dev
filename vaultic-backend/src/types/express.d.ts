/**
 * Express Request augmentation for wallet-signature auth (Task 18.3).
 *
 * The auth middleware attaches the verified wallet to req.user so
 * downstream route handlers can authorise actions without re-parsing
 * headers. Keep this file free of value exports: it is a pure type
 * declaration picked up by the tsconfig include glob.
 */
export {};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface UserIdentity {
      /** Base58-encoded Solana wallet public key (32 bytes). */
      walletAddress: string;
    }

    interface Request {
      /**
       * Verified wallet identity. Populated by authMiddleware on
       * mutating routes; undefined on public GETs.
       */
      user?: UserIdentity;
    }
  }
}
