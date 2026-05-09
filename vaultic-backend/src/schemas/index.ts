/**
 * Schema barrel (Task 20).
 *
 * Re-exports every Zod schema + inferred type produced by the
 * per-route schema files so handlers and tests can
 * `import { TreasuryCreate } from '@/schemas'` without chasing
 * individual files.
 */
export { TreasuryCreate, TreasuryIdParams } from './treasury';
export { EmployeeCreate, EmployeesListQuery } from './employees';
export { PayrollRunParams, PayrollListQuery } from './payroll';
export { ClaimCreate, ClaimsWalletParams } from './claims';
