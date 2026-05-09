/**
 * Environment configuration loader.
 *
 * Task 16.1 scaffold: reads and surfaces every env var listed in design
 * §10.5 and `.env.example`. Strict Zod validation with refined messages
 * lands in Task 18.4 — this stub only asserts presence of required vars
 * so downstream modules can type-safely consume `AppConfig`.
 */
export interface AppConfig {
  /** Postgres connection string consumed by Prisma. */
  databaseUrl: string;
  /** Solana RPC endpoint (devnet) consumed by anchorClient. */
  solanaRpcUrl: string;
  /** Deployed Vaultic program id. */
  vaulticProgramId: string;
  /** Pinned Encrypt program id. */
  encryptProgramId: string;
  /** Pinned Ika program id. */
  ikaProgramId: string;
  /** CORS allowlist origin. */
  frontendOrigin: string;
  /** HTTP listen port. */
  port: number;
  /** pino log level. */
  logLevel: string;
  /** Ika network gRPC endpoint. */
  ikaGrpcUrl: string;
  /** Encrypt network gRPC endpoint. */
  encryptGrpcUrl: string;
}

export function loadConfig(): AppConfig {
  return {
    databaseUrl: requireEnv('DATABASE_URL'),
    solanaRpcUrl: requireEnv('SOLANA_RPC_URL'),
    vaulticProgramId: requireEnv('VAULTIC_PROGRAM_ID'),
    encryptProgramId: requireEnv('ENCRYPT_PROGRAM_ID'),
    ikaProgramId: requireEnv('IKA_PROGRAM_ID'),
    frontendOrigin: requireEnv('FRONTEND_ORIGIN'),
    port: parseInt(process.env.PORT ?? '3000', 10),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    ikaGrpcUrl: requireEnv('IKA_GRPC_URL'),
    encryptGrpcUrl: requireEnv('ENCRYPT_GRPC_URL'),
  };
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
