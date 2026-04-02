import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { LogEntry } from "../api/client";
import { JsonTree } from "./JsonTree";

const LEVELS = ["ALL", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] as const;
type Level = typeof LEVELS[number];

const LEVEL_BADGE: Record<string, { bg: string; color: string; short: string }> = {
  DEBUG:    { bg: "rgba(100,116,139,0.2)", color: "#94a3b8", short: "DG" },
  INFO:     { bg: "rgba(59,130,246,0.15)", color: "#60a5fa", short: "IN" },
  WARNING:  { bg: "rgba(245,158,11,0.15)", color: "var(--amber)", short: "WA" },
  ERROR:    { bg: "rgba(249,115,22,0.15)", color: "#f97316", short: "ER" },
  CRITICAL: { bg: "rgba(239,68,68,0.18)", color: "var(--red)", short: "CR" },
};

function LogRow({ log }: { log: LogEntry }) {
  const [open, setOpen] = useState(false);
  let parsed: Record<string, unknown> | null = null;
  try {
    const d = JSON.parse(log.details || "{}");
    if (Object.keys(d).length > 0) parsed = d;
  } catch { /* */ }

  const badge = LEVEL_BADGE[log.level] ?? LEVEL_BADGE.DEBUG;

  return (
    <>
      <tr
        style={{ borderBottom: "1px solid var(--border)", cursor: parsed ? "pointer" : "default" }}
        onClick={() => parsed && setOpen((o) => !o)}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <td className="mono" style={{ padding: "8px 12px 8px 0", fontSize: 11, color: "var(--text-3)",
          whiteSpace: "nowrap", verticalAlign: "top" }}>
          {new Date(log.timestamp).toLocaleTimeString()}
        </td>
        <td style={{ padding: "8px 12px 8px 0", verticalAlign: "top" }}>
          <span className="mono" style={{ padding: "1px 6px", fontSize: 10, fontWeight: 600,
            borderRadius: 4, background: badge.bg, color: badge.color }}>
            {badge.short}
          </span>
        </td>
        <td className="mono" style={{ padding: "8px 12px 8px 0", fontSize: 11, color: "var(--text-3)",
          maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "top" }}>
          {log.module}.{log.function}
        </td>
        <td style={{ padding: "8px 12px 8px 0", fontSize: 13, color: "var(--text-1)", verticalAlign: "top" }}>
          {log.message}
        </td>
        <td style={{ padding: "8px 0 8px 4px", color: "var(--text-3)", verticalAlign: "top" }}>
          {parsed ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </td>
      </tr>
      {open && parsed && (
        <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-deep)" }}>
          <td colSpan={5} style={{ padding: "12px 16px" }}>
            <JsonTree value={parsed} />
          </td>
        </tr>
      )}
    </>
  );
}

interface Props {
  logs: LogEntry[];
}

export function LogStream({ logs }: Props) {
  const [activeLevel, setActiveLevel] = useState<Level>("ALL");

  const filtered =
    activeLevel === "ALL" ? logs : logs.filter((l) => l.level === activeLevel);

  const counts: Record<string, number> = {};
  for (const log of logs) {
    counts[log.level] = (counts[log.level] ?? 0) + 1;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Segmented pill toolbar */}
      <div style={{ display: "inline-flex", background: "var(--bg-deep)", border: "1px solid var(--border)",
        borderRadius: 24, padding: 3, alignSelf: "flex-start" }}>
        {LEVELS.map((lvl) => {
          const isActive = activeLevel === lvl;
          const count = lvl === "ALL" ? logs.length : counts[lvl];
          return (
            <button
              key={lvl}
              onClick={() => setActiveLevel(lvl)}
              style={{
                padding: "4px 12px", fontSize: 11, fontWeight: 500, borderRadius: 20,
                border: "none", cursor: "pointer", fontFamily: "inherit",
                background: isActive ? "var(--indigo)" : "transparent",
                color: isActive ? "#fff" : "var(--text-2)",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {lvl}
              {count !== undefined && (
                <span style={{ marginLeft: 5, opacity: 0.7 }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Log table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "var(--text-3)" }}>
          No logs at this level.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Time", "", "Location", "Message", ""].map((h, i) => (
                  <th key={i} style={{ paddingBottom: 8, paddingRight: 12, textAlign: "left",
                    fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                    textTransform: "uppercase", color: "var(--text-3)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
