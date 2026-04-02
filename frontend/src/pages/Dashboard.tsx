import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { api } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { SpeedChart } from "../components/SpeedChart";
import { FilterBreakdown } from "../components/FilterBreakdown";
import { HealthChart } from "../components/HealthChart";
import { ListingsChart } from "../components/ListingsChart";
import { RunsTable } from "../components/RunsTable";

const fmtMs = (ms: number | null | undefined) => {
  if (ms === null || ms === undefined) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
};

const fmtSyncTime = (ts: string | null) => {
  if (!ts) return "Never";
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} mins ago`;
  return d.toLocaleTimeString();
};

interface Props {
  projectId: string;
}

export function Dashboard({ projectId }: Props) {
  const qc = useQueryClient();
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [runFilter, setRunFilter] = useState<"all" | "ok" | "warn" | "error" | "critical">("all");

  const overview = useQuery({
    queryKey: ["overview", projectId],
    queryFn: () => api.overview(projectId),
    refetchInterval: 60_000,
  });

  const runs = useQuery({
    queryKey: ["runs", projectId],
    queryFn: () => api.runs(projectId, 50),
    refetchInterval: 60_000,
  });

  const syncMut = useMutation({
    mutationFn: () => api.sync(projectId),
    onSuccess: (data) => {
      // Invalidate each query key explicitly — [projectId] alone won't match ["overview", projectId]
      qc.invalidateQueries({ queryKey: ["overview", projectId] });
      qc.invalidateQueries({ queryKey: ["runs", projectId] });
      qc.invalidateQueries({ queryKey: ["speed", projectId] });
      qc.invalidateQueries({ queryKey: ["health", projectId] });
      qc.invalidateQueries({ queryKey: ["listings", projectId] });
      qc.invalidateQueries({ queryKey: ["funnel", projectId] });
      qc.invalidateQueries({ queryKey: ["filters_series", projectId] });
      const msg = data.inserted > 0 ? `↓ ${data.inserted} new rows` : "Already up to date";
      setSyncResult(msg);
      setTimeout(() => setSyncResult(null), 4000);
    },
  });

  const o = overview.data;

  const cardStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 20,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-1)", margin: 0 }}>
            Overview
          </h2>
          <p style={{ fontSize: 11, color: "var(--text-3)", margin: "4px 0 0" }}>
            Last synced: {fmtSyncTime(o?.last_synced_at ?? null)}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {syncResult && (
            <span style={{ fontSize: 11, color: "var(--emerald)", fontWeight: 500 }}>
              {syncResult}
            </span>
          )}
          <button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              background: "var(--indigo)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: syncMut.isPending ? "not-allowed" : "pointer",
              opacity: syncMut.isPending ? 0.5 : 1,
              fontFamily: "inherit",
            }}
          >
            <RefreshCw
              size={14}
              className={syncMut.isPending ? "animate-spin" : ""}
            />
            {syncMut.isPending ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </div>

      {/* KPI row 1 — Run Volume */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p className="oh-section-label">Run Volume</p>
        <div className="oh-grid oh-grid-4">
          <MetricCard label="Total runs" value={o?.total_runs ?? "—"} accent="var(--indigo)" />
          <MetricCard
            label="Runs today"
            value={o?.runs_today ?? "—"}
            sub={o?.total_runs ? `of ${o.total_runs} all time` : undefined}
            accent="var(--cyan)"
          />
          <MetricCard
            label="Avg run time"
            value={fmtMs(o?.avg_ms)}
            sub={`med ${fmtMs(o?.median_ms)} · max ${fmtMs(o?.max_ms)}`}
            accent="var(--amber)"
          />
          <MetricCard
            label="Avg gigs listed"
            value={o?.avg_listed ?? "—"}
            sub="per run, from scrape"
            accent="var(--text-3)"
          />
        </div>
      </div>

      {/* KPI row 2 — Health & Performance */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p className="oh-section-label">Health &amp; Performance</p>
        <div className="oh-grid oh-grid-4">
          <MetricCard
            label="Total notified"
            value={o?.total_notified ?? "—"}
            sub="gigs applied to"
            accent="var(--emerald)"
          />
          <MetricCard
            label="Avg HTTP fetch"
            value={fmtMs(o?.avg_fetch_ms)}
            sub={o?.avg_retries_per_run ? `${o.avg_retries_per_run} retries/run avg` : "fetch latency"}
            accent="var(--sky)"
          />
          <MetricCard
            label="Warning rate"
            value={
              o?.warning_rate_pct !== null && o?.warning_rate_pct !== undefined
                ? `${o.warning_rate_pct}%`
                : "—"
            }
            sub="runs with ≥1 warning"
            accent="var(--amber)"
          />
          <MetricCard
            label="Error rate"
            value={
              o?.error_rate_pct !== null && o?.error_rate_pct !== undefined
                ? `${o.error_rate_pct}%`
                : "—"
            }
            sub="runs with ≥1 error"
            accent="var(--red)"
          />
        </div>
      </div>

      {/* Charts row */}
      <SpeedChart projectId={projectId} />

      {/* Charts row 2 — Health Rate + Listings */}
      <div className="oh-chart-grid">
        <HealthChart projectId={projectId} />
        <ListingsChart projectId={projectId} />
      </div>

      <FilterBreakdown projectId={projectId} />

      {/* Runs table */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--text-3)", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>Recent Runs</span>
          </div>
          {runs.data && (
            <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
              {(
                [
                  { key: "all",      label: "All",      color: "var(--text-2)", count: runs.data.length },
                  { key: "ok",       label: "OK",       color: "var(--emerald)", count: runs.data.filter((r) => !r.has_warning && !r.has_error && !r.has_critical).length },
                  { key: "warn",     label: "Warn",     color: "var(--amber)",   count: runs.data.filter((r) => r.has_warning && !r.has_error && !r.has_critical).length },
                  { key: "error",    label: "Error",    color: "#f97316",        count: runs.data.filter((r) => r.has_error && !r.has_critical).length },
                  { key: "critical", label: "Critical", color: "var(--red)",     count: runs.data.filter((r) => r.has_critical).length },
                ] as const
              ).map(({ key, label, color, count }) => {
                const active = runFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setRunFilter(key)}
                    style={{
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: active ? 600 : 400,
                      background: active ? "var(--bg-hover)" : "transparent",
                      color: active ? color : "var(--text-3)",
                      border: "none",
                      borderLeft: key === "all" ? "none" : "1px solid var(--border)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {label}
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: active ? color : "var(--text-3)",
                      background: active ? `color-mix(in srgb, ${color} 15%, transparent)` : "transparent",
                      borderRadius: 20,
                      padding: "0 5px",
                      minWidth: 16,
                      textAlign: "center",
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {runs.data ? (() => {
          const filtered = runs.data.filter((r) => {
            if (runFilter === "ok")       return !r.has_warning && !r.has_error && !r.has_critical;
            if (runFilter === "warn")     return r.has_warning && !r.has_error && !r.has_critical;
            if (runFilter === "error")    return r.has_error && !r.has_critical;
            if (runFilter === "critical") return !!r.has_critical;
            return true;
          });
          return filtered.length > 0
            ? <RunsTable runs={filtered} projectId={projectId} />
            : <div style={{ textAlign: "center", padding: "40px 0", fontSize: 13, color: "var(--text-3)" }}>No {runFilter} runs.</div>;
        })() : (
          <Skeleton h={160} />
        )}
      </div>
    </div>
  );
}

function Skeleton({ h }: { h: number }) {
  return <div className="oh-skeleton" style={{ height: h }} />;
}
