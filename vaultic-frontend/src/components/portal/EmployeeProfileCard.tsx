"use client";

/**
 * EmployeeProfileCard — at-a-glance summary of the connected employee
 * (Task 27.1, Req 18.1).
 *
 * Shows role tier (Junior..Executive), chain preference (Solana/Ethereum/
 * Bitcoin), active status badge, and shortened identifiers for the
 * employee wallet (base58) and the target payout address (hex). The
 * target address is stored on-chain as a fixed `[u8; 64]` — we strip the
 * trailing zeros before shortening so callers see the meaningful prefix
 * rather than 64 bytes of `00`s.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { chainLabel, roleLabel, shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EmployeeRecordAccount } from "@/hooks/useMyEmployee";

export interface EmployeeProfileCardProps {
  employee: EmployeeRecordAccount;
}

/**
 * Convert a `[u8; 64]` target address (IDL-decoded as `number[]`) to a
 * `0x`-prefixed hex string, trimmed to the non-zero prefix. If every
 * byte is zero we return `0x00` so the UI doesn't collapse to the
 * empty string.
 */
function formatTargetAddress(bytes: number[] | Uint8Array): string {
  const arr = Array.from(bytes as number[]);
  // Find the last non-zero byte; default to 1 (a single `00`) if all zero.
  let last = -1;
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (arr[i] !== 0) {
      last = i;
      break;
    }
  }
  const slice = last === -1 ? [0] : arr.slice(0, last + 1);
  const hex = slice
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

export function EmployeeProfileCard({ employee }: EmployeeProfileCardProps) {
  const targetHex = formatTargetAddress(
    employee.targetAddress as unknown as number[],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <CardTitle>Profile</CardTitle>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-xs font-medium",
            employee.isActive
              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
              : "border-red-500/30 bg-red-500/15 text-red-400",
          )}
        >
          {employee.isActive ? "Active" : "Terminated"}
        </span>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ProfileField label="Role" value={roleLabel(employee.roleId)} />
        <ProfileField
          label="Chain Preference"
          value={chainLabel(employee.chainPreference)}
        />
        <ProfileField
          label="Employee Wallet"
          value={shortenAddress(employee.employeeWallet, 6)}
          mono
          title={employee.employeeWallet.toBase58()}
        />
        <ProfileField
          label="Target Address"
          value={
            targetHex.length <= 18
              ? targetHex
              : `${targetHex.slice(0, 10)}...${targetHex.slice(-6)}`
          }
          mono
          title={targetHex}
        />
      </CardContent>
    </Card>
  );
}

function ProfileField({
  label,
  value,
  mono,
  title,
}: {
  label: string;
  value: string;
  mono?: boolean;
  title?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-medium text-foreground",
          mono && "font-mono",
        )}
        title={title}
      >
        {value}
      </p>
    </div>
  );
}
