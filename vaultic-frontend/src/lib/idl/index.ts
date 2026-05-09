/**
 * Vaultic IDL bundle — vendored from the backend (Task 23.3).
 *
 * Source of truth:
 *   - JSON: `vaultic-backend/src/idl/vaultic.json` (which itself was copied
 *     from `vaultic-contracts/target/idl/vaultic.json` by `anchor build`)
 *   - TS types: `vaultic-backend/src/idl/vaultic-types.ts`
 *
 * Both files are duplicated into `vaultic-frontend/src/lib/idl/` rather than
 * imported from the backend workspace. Cross-package TypeScript imports
 * break Next.js's SWC bundler without custom webpack config, and the
 * duplication is cheap (two files, regenerated together whenever
 * `anchor build` runs and the scripts/sync-ids pipeline re-vendors the
 * backend copy).
 *
 * Re-vendoring workflow:
 *   1. Run `anchor build` in `vaultic-contracts/`
 *   2. Copy `target/idl/vaultic.json` to `vaultic-backend/src/idl/`
 *   3. Copy `target/types/vaultic.ts` to
 *      `vaultic-backend/src/idl/vaultic-types.ts`
 *   4. Copy the same two files into `vaultic-frontend/src/lib/idl/`
 *   5. `pnpm --filter vaultic-frontend build` to confirm the generated
 *      types still match call sites.
 */
import rawIdl from "./vaultic.json";
import type { Vaultic } from "./vaultic-types";

export type { Vaultic } from "./vaultic-types";

export const IDL = rawIdl as unknown as Vaultic;

/** Program id declared by `vaultic-contracts/programs/vaultic/src/lib.rs`. */
export const VAULTIC_PROGRAM_ADDRESS =
  "5igWLTbdAjGfAZKsK9G3Buhe7mkrgC3GEYkQaD4PrTnZ";
