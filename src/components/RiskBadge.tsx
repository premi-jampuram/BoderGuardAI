const styles: Record<string, { bg: string; fg: string; border: string }> = {
  LOW: { bg: "var(--risk-low)", fg: "var(--risk-low-fg)", border: "var(--border)" },
  MEDIUM: { bg: "var(--risk-medium)", fg: "var(--risk-medium-fg)", border: "var(--risk-medium)" },
  HIGH: { bg: "var(--risk-high)", fg: "var(--risk-high-fg)", border: "var(--risk-high)" },
  CRITICAL: { bg: "var(--risk-critical)", fg: "var(--risk-critical-fg)", border: "var(--risk-critical)" },
};

export default function RiskBadge({ level }: { level: string }) {
  const s = styles[level] ?? styles.MEDIUM;
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border tracking-wide"
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}
    >
      {level}
    </span>
  );
}
