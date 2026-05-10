"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { formatUnixTimestamp } from "@/lib/format";
import type { PayrollRun } from "@/hooks/usePayrollRuns";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

export interface PayrollRunsListProps {
  runs: PayrollRun[] | undefined;
  isLoading: boolean;
  limit?: number;
}

type StatusKey = "pending" | "processing" | "completed" | "failed";

function extractStatus(status: unknown): StatusKey {
  if (typeof status !== "object" || status === null) return "pending";
  const key = Object.keys(status)[0]?.toLowerCase();
  if (key === "pending" || key === "processing" || key === "completed" || key === "failed") return key;
  return "pending";
}

const STATUS_CONFIG: Record<StatusKey, { label: string; dot: string; bg: string; border: string; text: string }> = {
  pending:    { label: "Pending",    dot: "#fbbf24", bg: "rgba(251,191,36,0.08)",   border: "rgba(251,191,36,0.25)",   text: "#fcd34d" },
  processing: { label: "Processing", dot: "#60a5fa", bg: "rgba(96,165,250,0.08)",   border: "rgba(96,165,250,0.25)",   text: "#93c5fd" },
  completed:  { label: "Completed",  dot: "#34d399", bg: "rgba(52,211,153,0.08)",   border: "rgba(52,211,153,0.25)",   text: "#6ee7b7" },
  failed:     { label: "Failed",     dot: "#f87171", bg: "rgba(248,113,113,0.08)",  border: "rgba(248,113,113,0.25)",  text: "#fca5a5" },
};

function StatusBadge({ status }: { status: StatusKey }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

export function PayrollRunsList({ runs, isLoading, limit = 10 }: PayrollRunsListProps) {
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        background: "rgba(10,10,20,0.7)",
        border: "1px solid rgba(255,255,255,0.18)",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{ background: "rgba(99,102,241,0.15)" }}
          >
            <Activity className="h-4 w-4" style={{ color: "#818cf8" }} />
          </div>
          <h3 className="text-sm font-semibold text-white">Recent Payroll Runs</h3>
        </div>
        {runs && runs.length > 0 && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.25)",
              color: "#a5b4fc",
            }}
          >
            {runs.length} run{runs.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-2">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : !runs || runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}
            >
              <Activity className="h-5 w-5" style={{ color: "rgba(99,102,241,0.5)" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "rgba(203,213,225,0.75)" }}>
              No payroll runs yet
            </p>
            <p className="mt-1 text-xs" style={{ color: "rgba(148,163,184,0.65)" }}>
              Payroll executions will appear here
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Table header */}
            <div
              className="mb-1 grid grid-cols-4 px-3 py-2 text-xs font-medium uppercase tracking-widest"
              style={{ color: "rgba(203,213,225,0.7)" }}
            >
              <span>Status</span>
              <span>Execution ID</span>
              <span>Started</span>
              <span className="text-right">Employees</span>
            </div>
            {/* Rows */}
            <div className="space-y-1">
              {runs.slice(0, limit).map((run) => {
                const status = extractStatus(run.account.status);
                return (
                  <div
                    key={run.publicKey.toBase58()}
                    className="group grid grid-cols-4 items-center rounded-xl px-3 py-3 transition-all duration-200"
                    style={{ background: "transparent" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.06)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    }}
                  >
                    <div><StatusBadge status={status} /></div>
                    <div
                      className="font-mono text-xs"
                      style={{ color: "rgba(165,180,252,0.8)" }}
                    >
                      {run.account.executionId.toString()}
                    </div>
                    <div className="text-xs" style={{ color: "rgba(203,213,225,0.8)" }}>
                      {formatUnixTimestamp(run.account.startedAt)}
                    </div>
                    <div
                      className="text-right text-sm font-semibold"
                      style={{ color: "rgba(224,231,255,0.9)" }}
                    >
                      {run.account.employeesProcessed}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
