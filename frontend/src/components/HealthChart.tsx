import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "./DatePicker";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { api } from "../api/client";

interface Props {
  projectId: string;
}

const RANGES = [
  { label: "3H",  ms: 3  * 3_600_000 },
  { label: "6H",  ms: 6  * 3_600_000 },
  { label: "12H", ms: 12 * 3_600_000 },
  { label: "24H", ms: 24 * 3_600_000 },
  { label: "3D",  ms: 3  * 86_400_000 },
  { label: "7D",  ms: 7  * 86_400_000 },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgoStr(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function toISODate(dateStr: string, endOfDay = false): string {
  return dateStr + (endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z");
}

function fmtTick(ts: string, range: string): string {
  const d = new Date(ts);
  if (range === "3D") {
    return d.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
  if (range === "7D") {
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
  }
  if (range === "Custom") {
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function HealthChart({ projectId }: Props) {
  const [range, setRange] = useState("24H");
  const [customFrom, setCustomFrom] = useState(() => nDaysAgoStr(1));
  const [customTo, setCustomTo] = useState(() => todayStr());

  const { since, until } = useMemo(() => {
    if (range === "Custom") {
      return {
        since: customFrom ? toISODate(customFrom) : undefined,
        until: customTo ? toISODate(customTo, true) : undefined,
      };
    }
    const ms = RANGES.find((r) => r.label === range)!.ms;
    return {
      since: new Date(Date.now() - ms).toISOString(),
      until: undefined,
    };
  }, [range, customFrom, customTo]);

  const { data } = useQuery({
    queryKey: ["health", projectId, since, until],
    queryFn: () => api.healthHourly(projectId, since, until),
    enabled: !!since,
    refetchInterval: 60_000,
  });

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 20,
  };

  const allRangeLabels = [...RANGES.map((r) => r.label), "Custom"];

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: range === "Custom" ? 8 : 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>Hourly Health Rate</span>
        </div>
        <div
          style={{
            display: "inline-flex",
            border: "1px solid var(--border)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          {allRangeLabels.map((label) => {
            const active = label === range;
            return (
              <button
                key={label}
                onClick={() => setRange(label)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  background: active ? "var(--indigo)" : "transparent",
                  color: active ? "#fff" : "var(--text-2)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom date range row */}
      {range === "Custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>From</span>
          <DatePicker
            value={customFrom}
            max={customTo || todayStr()}
            onChange={setCustomFrom}
          />
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>to</span>
          <DatePicker
            value={customTo}
            min={customFrom || undefined}
            max={todayStr()}
            onChange={setCustomTo}
            alignRight
          />
        </div>
      )}

      {/* Chart */}
      {data && data.length > 0 ? (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gWarn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gError" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="started_at"
              tickFormatter={(ts) => fmtTick(ts, range)}
              tick={{ fill: "var(--text-2)", fontSize: 11 }}
              minTickGap={48}
            />
            <YAxis
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: "var(--text-2)", fontSize: 11 }}
              domain={[0, (dataMax: number) => Math.min(100, Math.ceil(dataMax * 1.15))]}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
              labelStyle={{ color: "var(--text-2)", fontSize: 11 }}
              formatter={(val: number | undefined) => [`${val ?? "—"}%`]}
              labelFormatter={(l: unknown) => {
                const d = new Date(l as string);
                return d.toLocaleString("en-GB", {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                });
              }}
            />
            <Legend wrapperStyle={{ color: "var(--text-2)", fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="warn_rate_pct"
              name="Warning %"
              stroke="#f59e0b"
              fill="url(#gWarn)"
            />
            <Area
              type="monotone"
              dataKey="error_rate_pct"
              name="Error %"
              stroke="#ef4444"
              fill="url(#gError)"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : data ? (
        <Empty label={`No runs in the past ${range}`} />
      ) : (
        <div className="oh-skeleton" style={{ height: 260 }} />
      )}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div
      style={{
        height: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-3)",
        fontSize: 13,
      }}
    >
      {label}
    </div>
  );
}
