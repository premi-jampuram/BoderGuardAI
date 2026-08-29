import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const config: Record<string, { icon: typeof CheckCircle2; label: string; border: string; bg: string; fg: string }> = {
  CLEAR: { icon: CheckCircle2, label: "Clear — Low Risk", border: "var(--border)", bg: "var(--surface)", fg: "var(--foreground)" },
  SECONDARY_REVIEW: {
    icon: AlertTriangle,
    label: "Secondary Review Recommended",
    border: "var(--foreground)",
    bg: "var(--surface-alt)",
    fg: "var(--foreground)",
  },
  DENY: {
    icon: XCircle,
    label: "High Risk — Deny / Escalate",
    border: "var(--foreground)",
    bg: "var(--foreground)",
    fg: "var(--background)",
  },
};

export default function DecisionBanner({ decision, riskScore }: { decision: string; riskScore: number }) {
  const c = config[decision] ?? config.SECONDARY_REVIEW;
  const Icon = c.icon;
  return (
    <div
      className="flex items-center gap-4 border-2 rounded-xl px-5 py-4"
      style={{ borderColor: c.border, background: c.bg, color: c.fg }}
    >
      <Icon size={28} />
      <div>
        <div className="font-semibold">{c.label}</div>
        <div className="text-sm opacity-70">Composite risk score: {riskScore}/100</div>
      </div>
    </div>
  );
}
