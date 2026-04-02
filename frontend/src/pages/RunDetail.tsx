import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle, X } from "lucide-react";
import { api } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { LogStream } from "../components/LogStream";
import { PhaseBreakdown } from "../components/PhaseBreakdown";

const fmtMs = (ms: number | null) => {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
};

const CARD: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
};

export function RunDetail() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();
  const navigate = useNavigate();

  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);

  const run = useQuery({
    queryKey: ["run", projectId, runId],
    queryFn: () => api.run(projectId!, runId!),
    enabled: !!(projectId && runId),
  });

  const logs = useQuery({
    queryKey: ["runLogs", projectId, runId],
    queryFn: () => api.runLogs(projectId!, runId!),
    enabled: !!(projectId && runId),
  });

  const r = run.data;

  const rejectedGigs = useMemo(() => {
    if (!selectedFilter || !logs.data) return [];

    const parseFee = (fee: string | undefined): number => {
      if (!fee) return -Infinity;
      // Strip currency symbols, commas, spaces — keep digits and decimal point
      const n = parseFloat(fee.replace(/[^0-9.]/g, ""));
      return isNaN(n) ? -Infinity : n;
    };

    return logs.data
      .filter((l) => l.message === "Gig rejected")
      .map((l) => {
        try { return JSON.parse(l.details) as Record<string, string>; }
        catch { return null; }
      })
      .filter(
        (d): d is Record<string, string> =>
          d !== null && typeof d.filter === "string" && d.filter.split("(")[0] === selectedFilter,
      )
      .sort((a, b) => parseFee(b.fee) - parseFee(a.fee));
  }, [selectedFilter, logs.data]);

  const statusColor = r?.has_critical
    ? "var(--red)"
    : r?.has_error
    ? "#f97316"
    : r?.has_warning
    ? "var(--amber)"
    : "var(--emerald)";

  const StatusIcon = r?.has_critical || r?.has_error
    ? XCircle
    : r?.has_warning
    ? AlertTriangle
    : CheckCircle;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13,
          color: "var(--text-2)", background: "none", border: "none", cursor: "pointer",
          padding: 0, width: "fit-content", fontFamily: "inherit" }}
      >
        <ArrowLeft size={14} />
        Back to runs
      </button>

      {/* Run header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Status box */}
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: `color-mix(in srgb, ${statusColor} 15%, transparent)`,
          border: `1px solid color-mix(in srgb, ${statusColor} 35%, transparent)`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <StatusIcon size={22} style={{ color: statusColor }} />
        </div>
        <div>
          <h2 className="mono" style={{ fontSize: 18, fontWeight: 600, color: "var(--text-1)", margin: 0 }}>
            {runId?.slice(0, 8) ?? "Loading…"}
          </h2>
          {r && (
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "4px 0 0", display: "flex", alignItems: "center", gap: 8 }}>
              {new Date(r.started_at).toLocaleString()} · {r.log_count} entries
              {r.total_elapsed_ms && (
                <span className="mono" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 20, padding: "1px 8px", fontSize: 11 }}>
                  {fmtMs(r.total_elapsed_ms)}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* KPI rows */}
      {r ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p className="oh-section-label">Timing</p>
            <div className="oh-grid oh-grid-4">
              <MetricCard label="Total time" value={fmtMs(r.total_elapsed_ms)} accent="var(--indigo)" />
              <MetricCard label="Scrape" value={fmtMs(r.scrape_elapsed_ms)} accent="var(--cyan)" />
              <MetricCard label="Filter" value={fmtMs(r.filter_elapsed_ms)} accent="var(--amber)" />
              <MetricCard label="Notify" value={fmtMs(r.notify_elapsed_ms)} accent="var(--emerald)" />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p className="oh-section-label">Pipeline Counts</p>
            <div className="oh-grid oh-grid-4">
              <MetricCard label="Listed" value={r.listed ?? "—"} accent="var(--text-3)" />
              <MetricCard label="Scraped" value={r.scraped ?? "—"} accent="var(--sky)" />
              <MetricCard label="Passed filters" value={r.valid ?? "—"} accent="var(--emerald)" />
              <MetricCard label="Notified" value={r.notified ?? "—"} accent="var(--amber)" />
            </div>
          </div>
        </>
      ) : (
        <div className="oh-skeleton" style={{ height: 144 }} />
      )}

      {/* Phase Breakdown */}
      {r && (r.scrape_elapsed_ms || r.filter_elapsed_ms || r.notify_elapsed_ms) && (
        <div style={CARD}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", margin: "0 0 16px" }}>
            Phase Breakdown
          </p>
          <PhaseBreakdown
            scrapeMs={r.scrape_elapsed_ms}
            filterMs={r.filter_elapsed_ms}
            notifyMs={r.notify_elapsed_ms}
            totalMs={r.total_elapsed_ms}
          />
        </div>
      )}

      {/* Filter breakdown for this run */}
      {r?.filter_breakdown && (
        <div style={CARD}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", margin: "0 0 4px" }}>
            Filters (this run)
          </p>
          <p style={{ fontSize: 11, color: "var(--text-3)", margin: "0 0 16px" }}>
            Click a filter to see which gigs were rejected.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(JSON.parse(r.filter_breakdown) as Record<string, number>).map(
              ([filter, count]) => {
                const raw = filter.split("(")[0];
                const modeMatch = filter.match(/mode='(\w+)'/);
                const shortName = raw === "BookedDateFilter"
                  ? "AvailabilityFilter (block)"
                  : raw === "AvailabilityFilter" && modeMatch
                  ? `AvailabilityFilter (${modeMatch[1]})`
                  : raw;
                const isSelected = selectedFilter === shortName;
                const countColor = count >= 10
                  ? "var(--red)"
                  : count >= 1
                  ? "var(--amber)"
                  : "var(--emerald)";
                return (
                  <button
                    key={filter}
                    onClick={() => setSelectedFilter(isSelected ? null : shortName)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                      background: isSelected ? "rgba(99,102,241,0.2)" : "var(--bg-hover)",
                      border: `1px solid ${isSelected ? "rgba(99,102,241,0.55)" : "var(--border)"}`,
                      outline: isSelected ? "1px solid rgba(99,102,241,0.35)" : "none",
                      outlineOffset: 1, fontFamily: "inherit",
                    }}
                  >
                    <span className="mono" style={{ fontSize: 12, color: "var(--text-1)" }}>
                      {shortName}
                    </span>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: countColor }}>
                      {count}
                    </span>
                  </button>
                );
              }
            )}
          </div>

          {selectedFilter && (
            <div style={{ marginTop: 16, borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--bg-deep)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>
                  Gigs rejected by{" "}
                  <span className="mono" style={{ color: "var(--indigo)" }}>{selectedFilter}</span>
                  {logs.data && (
                    <span style={{ marginLeft: 8, color: "var(--text-3)" }}>
                      ({rejectedGigs.length})
                    </span>
                  )}
                </span>
                <button
                  onClick={() => setSelectedFilter(null)}
                  style={{ color: "var(--text-3)", background: "none", border: "none",
                    cursor: "pointer", padding: 0 }}
                >
                  <X size={14} />
                </button>
              </div>

              {!logs.data ? (
                <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-3)" }}>
                  Loading logs…
                </div>
              ) : rejectedGigs.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-3)" }}>
                  No "Gig rejected" debug logs found for this filter in this run.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        {["Header", "Date", "Fee", "Organisation"].map((h) => (
                          <th key={h} style={{ padding: "8px 16px", textAlign: "left",
                            fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                            textTransform: "uppercase", color: "var(--text-3)" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rejectedGigs.map((gig, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <td style={{ padding: "8px 16px", color: "var(--text-1)" }}>{gig.header ?? "—"}</td>
                          <td className="mono" style={{ padding: "8px 16px", color: "var(--text-2)", whiteSpace: "nowrap" }}>{gig.date ?? "—"}</td>
                          <td style={{ padding: "8px 16px", color: "var(--text-2)", whiteSpace: "nowrap" }}>{gig.fee ?? "—"}</td>
                          <td style={{ padding: "8px 16px", color: "var(--text-2)" }}>{gig.org ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Log stream */}
      <div style={CARD}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", margin: "0 0 16px" }}>
          Log Stream
        </p>
        {logs.data ? (
          <LogStream logs={logs.data} />
        ) : (
          <div className="oh-skeleton" style={{ height: 192 }} />
        )}
      </div>
    </div>
  );
}
