import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { Run } from "../api/client";

function StatusPill({ run }: { run: Run }) {
  if (run.has_critical)
    return (
      <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 20,
        background: "rgba(239,68,68,0.15)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.3)" }}>
        CRITICAL
      </span>
    );
  if (run.has_error)
    return (
      <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 20,
        background: "rgba(249,115,22,0.15)", color: "#f97316", border: "1px solid rgba(249,115,22,0.3)" }}>
        ERROR
      </span>
    );
  if (run.has_warning)
    return (
      <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 20,
        background: "rgba(245,158,11,0.15)", color: "var(--amber)", border: "1px solid rgba(245,158,11,0.3)" }}>
        WARN
      </span>
    );
  return (
    <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 20,
      background: "rgba(16,185,129,0.12)", color: "var(--emerald)", border: "1px solid rgba(16,185,129,0.25)" }}>
      OK
    </span>
  );
}

const fmtTime = (ms: number | null) => {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
};

const timingColor = (ms: number | null) => {
  if (ms === null) return "var(--text-3)";
  if (ms < 30_000) return "var(--emerald)";
  if (ms < 60_000) return "var(--amber)";
  return "var(--red)";
};

const fmtDate = (ts: string) =>
  new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

interface Props {
  runs: Run[];
  projectId: string;
}

const TH: React.CSSProperties = {
  paddingBottom: 10,
  paddingRight: 16,
  textAlign: "left",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

const TD: React.CSSProperties = {
  paddingTop: 11,
  paddingBottom: 11,
  paddingRight: 16,
  borderBottom: "1px solid var(--border)",
};

export function RunsTable({ runs, projectId }: Props) {
  const navigate = useNavigate();

  if (!runs.length) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", fontSize: 13, color: "var(--text-3)" }}>
        No runs yet — sync to load data.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {["Status", "Run ID", "Started", "Duration", "Funnel", "Logs", ""].map((h) => (
              <th key={h} style={TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.run_id}
              onClick={() => navigate(`/${projectId}/runs/${run.run_id}`)}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <td style={TD}><StatusPill run={run} /></td>
              <td style={TD}>
                <span className="mono" style={{ color: "var(--text-2)", fontSize: 12 }}>
                  {run.run_id.slice(0, 8)}
                </span>
              </td>
              <td style={{ ...TD, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                {fmtDate(run.started_at)}
              </td>
              <td style={TD}>
                <span className="mono" style={{ color: timingColor(run.total_elapsed_ms) }}>
                  {fmtTime(run.total_elapsed_ms)}
                </span>
              </td>
              <td style={TD}>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>
                  {run.listed ?? "—"}
                  <span style={{ color: "var(--text-3)", margin: "0 4px" }}>→</span>
                  {run.scraped ?? "—"}
                  <span style={{ color: "var(--text-3)", margin: "0 4px" }}>→</span>
                  <span style={{ color: "var(--emerald)" }}>{run.valid ?? "—"}</span>
                  <span style={{ color: "var(--text-3)", margin: "0 4px" }}>→</span>
                  <span style={{ color: "var(--amber)" }}>{run.notified ?? "—"}</span>
                </span>
              </td>
              <td style={{ ...TD, color: "var(--text-3)" }}>{run.log_count}</td>
              <td style={{ ...TD, paddingRight: 0, color: "var(--text-3)" }}>
                <ChevronRight size={15} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
