import { useEffect, useState } from "react";

interface Props {
  scrapeMs: number | null;
  filterMs: number | null;
  notifyMs: number | null;
  totalMs: number | null;
}

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

export function PhaseBreakdown({ scrapeMs, filterMs, notifyMs, totalMs }: Props) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const phases = [
    { label: "Scrape", ms: scrapeMs ?? 0, color: "var(--indigo)" },
    { label: "Filter", ms: filterMs ?? 0, color: "var(--cyan)" },
    { label: "Notify", ms: notifyMs ?? 0, color: "var(--emerald)" },
  ];

  const total = totalMs ?? phases.reduce((a, p) => a + p.ms, 0);
  if (!total) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Stacked bar */}
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", gap: 2 }}>
        {phases.map((p) => {
          const pct = total > 0 ? (p.ms / total) * 100 : 0;
          return (
            <div
              key={p.label}
              className="oh-bar"
              style={{
                width: animated ? `${pct}%` : "0%",
                background: p.color,
                borderRadius: 4,
                minWidth: p.ms > 0 && animated ? 4 : 0,
              }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {phases.map((p) => {
          const pct = total > 0 ? Math.round((p.ms / total) * 100) : 0;
          return (
            <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color,
                display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "var(--text-2)" }}>{p.label}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-1)" }}>
                {fmtMs(p.ms)}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
