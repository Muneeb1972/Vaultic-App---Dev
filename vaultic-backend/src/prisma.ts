/**
 * PrismaClient singleton — prevents connection exhaustion in dev by
 * reusing a global instance across ts-node-dev hot reloads.
 *
 * Task 16.1 scaffold uses a placeholder `schema.prisma` (a single empty
 * `_Placeholder` model) so that `prisma generate` produces a compilable
 * client. Task 17 replaces the schema with the full Treasury / Employee
 * / PayrollRun / Claim / AuditLog models.
 */
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __vaulticPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__vaulticPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__vaulticPrisma = prisma;
}
