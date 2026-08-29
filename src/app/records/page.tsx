"use client";

import { useEffect, useState } from "react";

interface PersonRecord {
  id: string;
  fullName: string;
  documentType: string;
  documentNumber: string;
  nationality: string;
  dateOfBirth: string;
  dateOfExpiry: string;
  gender: string;
  status: string;
  aliasOf: string | null;
}

interface BlacklistEntry {
  id: string;
  documentNumber: string;
  fullName: string;
  reason: string;
  severity: string;
  source: string;
}

const STATUS_OPTIONS = ["ACTIVE", "EXPIRED", "FLAGGED"];

const statusColor: Record<string, string> = {
  ACTIVE: "text-muted",
  EXPIRED: "text-foreground font-semibold",
  FLAGGED: "text-foreground font-bold",
};

export default function RecordsPage() {
  const [persons, setPersons] = useState<PersonRecord[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/records")
      .then((r) => r.json())
      .then((data) => {
        setPersons(data.persons);
        setBlacklist(data.blacklist);
        setLoading(false);
      });
  }, []);

  async function handleStatusChange(id: string, status: string) {
    setUpdatingId(id);
    const previous = persons;
    setPersons((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));

    try {
      const res = await fetch("/api/records", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPersons(previous);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Reference Records</h1>
      <p className="text-muted text-sm mb-6">
        Dummy database of issued documents and blacklist entries, used only for demonstration and cross-checking
        during screening.
      </p>

      {loading ? (
        <p className="text-muted text-sm">Loading records...</p>
      ) : (
        <>
          <div className="bg-surface border border-border rounded-xl overflow-hidden mb-8">
            <div className="px-5 py-3 border-b border-border font-medium text-sm">
              Person Records ({persons.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="px-5 py-2 font-normal">Name</th>
                    <th className="px-5 py-2 font-normal">Doc Type</th>
                    <th className="px-5 py-2 font-normal">Doc Number</th>
                    <th className="px-5 py-2 font-normal">Nationality</th>
                    <th className="px-5 py-2 font-normal">DOB</th>
                    <th className="px-5 py-2 font-normal">Expiry</th>
                    <th className="px-5 py-2 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {persons.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-b-0">
                      <td className="px-5 py-2.5">{p.fullName}</td>
                      <td className="px-5 py-2.5">{p.documentType}</td>
                      <td className="px-5 py-2.5 font-mono">{p.documentNumber}</td>
                      <td className="px-5 py-2.5">{p.nationality}</td>
                      <td className="px-5 py-2.5">{new Date(p.dateOfBirth).toISOString().slice(0, 10)}</td>
                      <td className="px-5 py-2.5">{new Date(p.dateOfExpiry).toISOString().slice(0, 10)}</td>
                      <td className="px-5 py-2.5">
                        <select
                          value={p.status}
                          disabled={updatingId === p.id}
                          onChange={(e) => handleStatusChange(p.id, e.target.value)}
                          className={`bg-transparent border border-border rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50 ${statusColor[p.status] ?? ""}`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border font-medium text-sm">
              Blacklist Entries ({blacklist.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="px-5 py-2 font-normal">Name</th>
                    <th className="px-5 py-2 font-normal">Doc Number</th>
                    <th className="px-5 py-2 font-normal">Reason</th>
                    <th className="px-5 py-2 font-normal">Source</th>
                    <th className="px-5 py-2 font-normal">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {blacklist.map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-b-0">
                      <td className="px-5 py-2.5">{b.fullName}</td>
                      <td className="px-5 py-2.5 font-mono">{b.documentNumber}</td>
                      <td className="px-5 py-2.5 text-muted">{b.reason}</td>
                      <td className="px-5 py-2.5 text-muted">{b.source}</td>
                      <td className="px-5 py-2.5 text-foreground font-bold">{b.severity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
