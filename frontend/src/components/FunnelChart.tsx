import { useEffect, useState } from "react";
import type { FunnelPoint } from "../api/client";

interface Props {
  data: FunnelPoint[];
}

export function FunnelChart({ data }: Props) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!data.length) {
    return (
      <div style={{ height: 208, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, color: "var(--text-3)" }}>
        No funnel data yet
      </div>
    );
  }

  const avg = (key: keyof FunnelPoint) => {
    const vals = data.map((d) => (d[key] as number | null) ?? 0);
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };

  const stages = [
    { name: "Listed",       value: avg("listed"),            color: "#10b981" },
    { name: "Pre-filtered", value: avg("pre_filter_passed"), color: "#a5b4fc" },
    { name: "Scraped",      value: avg("scraped"),           color: "#c4b5fd" },
    { name: "Passed",       value: avg("valid"),             color: "#f59e0b" },
    { name: "Notified",     value: avg("notified"),          color: "#fb7185" },
  ];

  const maxVal = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {stages.map((s) => {
        const pct = (s.value / maxVal) * 100;
        return (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "var(--text-2)", width: 96, flexShrink: 0 }}>
              {s.name}
            </span>
            <div style={{ flex: 1, height: 38, background: "var(--border)", borderRadius: 6, overflow: "hidden" }}>
              <div
                className="oh-bar"
                style={{
                  width: animated ? `${pct}%` : "0%",
                  height: "100%",
                  background: s.color,
                  borderRadius: 6,
                  opacity: 0.9,
                }}
              />
            </div>
            <span className="mono" style={{ fontSize: 12, color: "var(--text-1)", width: 36,
              textAlign: "right", flexShrink: 0 }}>
              {s.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
