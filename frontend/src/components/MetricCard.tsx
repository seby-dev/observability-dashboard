interface MetricCardProps {
  label: string;
  value: string | number | null;
  sub?: string;
  accent?: string;
}

export function MetricCard({ label, value, sub, accent }: MetricCardProps) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        padding: "20px 24px",
        borderTop: `2px solid ${accent ?? "var(--border)"}`,
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-2)",
          margin: 0,
        }}
      >
        {label}
      </p>
      <p
        className="mono"
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: "var(--text-1)",
          margin: "6px 0 0",
          lineHeight: 1.2,
        }}
      >
        {value === null || value === undefined ? "—" : value}
      </p>
      {sub && (
        <p style={{ fontSize: 11, color: "var(--text-3)", margin: "5px 0 0" }}>{sub}</p>
      )}
    </div>
  );
}
