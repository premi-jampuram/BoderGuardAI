"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  LabelList,
  Cell,
} from "recharts";

interface StatsResponse {
  totalScreened: number;
  byDecision: Record<string, number>;
  byRiskLevel: Record<string, number>;
  averageRiskScore: number;
  timeline: { createdAt: string; riskScore: number; riskLevel: string }[];
  personCount: number;
  blacklistCount: number;
}

const RISK_COLORS: Record<string, string> = {
  LOW: "#d4d4d4",
  MEDIUM: "#a3a3a3",
  HIGH: "#525252",
  CRITICAL: "#0a0a0a",
};

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  if (!stats) {
    return (
      <div className="p-10 max-w-6xl mx-auto">
        <p className="text-muted text-sm">Loading dashboard...</p>
      </div>
    );
  }

  const riskData = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((level) => ({
    level,
    count: stats.byRiskLevel[level] ?? 0,
  }));

  const timelineData = stats.timeline.map((t, i) => ({
    index: i + 1,
    riskScore: t.riskScore,
  }));

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Risk Dashboard</h1>
      <p className="text-muted text-sm mb-6">Aggregate view of every document screened by the platform.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatTile label="Documents Screened" value={stats.totalScreened} />
        <StatTile label="Average Risk Score" value={`${stats.averageRiskScore}/100`} />
        <StatTile label="Reference Persons" value={stats.personCount} />
        <StatTile label="Blacklist Entries" value={stats.blacklistCount} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="font-medium mb-4 text-sm">Screenings by Risk Level</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={riskData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="level" stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "var(--foreground)" }}
                cursor={{ fill: "var(--surface-alt)" }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
                <LabelList dataKey="count" position="top" style={{ fill: "var(--foreground)", fontSize: 12 }} />
                {riskData.map((entry) => (
                  <Cell key={entry.level} fill={RISK_COLORS[entry.level]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="font-medium mb-4 text-sm">Risk Score Over Recent Screenings</h3>
          {timelineData.length === 0 ? (
            <div className="flex items-center justify-center h-[240px] text-sm text-muted">
              No screenings yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={timelineData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="index" stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "var(--foreground)" }}
                  cursor={{ stroke: "var(--border)" }}
                />
                <Line type="monotone" dataKey="riskScore" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
