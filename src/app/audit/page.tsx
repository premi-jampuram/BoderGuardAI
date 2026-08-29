"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RiskBadge from "@/components/RiskBadge";

interface LogEntry {
  id: string;
  documentType: string;
  extractedData: { fullName: string | null; documentNumber: string | null };
  riskScore: number;
  riskLevel: string;
  decision: string;
  createdAt: string;
}

const DECISION_OPTIONS = ["ALL", "CLEAR", "SECONDARY_REVIEW", "DENY"];

export default function AuditPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("ALL");

  useEffect(() => {
    fetch("/api/logs")
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.logs);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (decisionFilter !== "ALL" && log.decision !== decisionFilter) return false;
      if (!q) return true;
      return (
        (log.extractedData.fullName ?? "").toLowerCase().includes(q) ||
        (log.extractedData.documentNumber ?? "").toLowerCase().includes(q) ||
        log.documentType.toLowerCase().includes(q)
      );
    });
  }, [logs, search, decisionFilter]);

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Audit Trail</h1>
      <p className="text-muted text-sm mb-6">
        Every screening decision is logged for investigation and intelligence analysis. Click a row to see the
        full breakdown behind that decision.
      </p>

      {!loading && logs.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, document number, or document type..."
            className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-foreground"
          />
          <select
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm"
          >
            {DECISION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d === "ALL" ? "All decisions" : d.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <p className="text-muted text-sm">Loading logs...</p>
      ) : logs.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-muted text-sm">
          No verifications have been run yet. Screen a document to populate the audit trail.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="px-5 py-2 font-normal">Timestamp</th>
                  <th className="px-5 py-2 font-normal">Name</th>
                  <th className="px-5 py-2 font-normal">Document</th>
                  <th className="px-5 py-2 font-normal">Doc Type</th>
                  <th className="px-5 py-2 font-normal">Risk Score</th>
                  <th className="px-5 py-2 font-normal">Risk Level</th>
                  <th className="px-5 py-2 font-normal">Decision</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => router.push(`/audit/${log.id}`)}
                    className="border-b border-border last:border-b-0 hover:bg-surface-alt transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-2.5 text-muted">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-5 py-2.5">{log.extractedData.fullName ?? "—"}</td>
                    <td className="px-5 py-2.5 font-mono">{log.extractedData.documentNumber ?? "—"}</td>
                    <td className="px-5 py-2.5">{log.documentType}</td>
                    <td className="px-5 py-2.5">{log.riskScore}</td>
                    <td className="px-5 py-2.5">
                      <RiskBadge level={log.riskLevel} />
                    </td>
                    <td className="px-5 py-2.5">{log.decision.replace("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="p-6 text-center text-muted text-sm">No screenings match this search.</div>}
        </div>
      )}
    </div>
  );
}
