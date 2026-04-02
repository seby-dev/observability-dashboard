import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "./DatePicker";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api } from "../api/client";

interface Props {
  projectId: string;
}

type RangeLabel = "3H" | "6H" | "12H" | "24H" | "3D" | "7D" | "Custom";

const RANGES: { label: RangeLabel; ms: number }[] = [
  { label: "3H",  ms: 3  * 3_600_000 },
  { label: "6H",  ms: 6  * 3_600_000 },
  { label: "12H", ms: 12 * 3_600_000 },
  { label: "24H", ms: 24 * 3_600_000 },
  { label: "3D",  ms: 3  * 86_400_000 },
  { label: "7D",  ms: 7  * 86_400_000 },
];

const ALL_RANGE_LABELS: RangeLabel[] = [...RANGES.map((r) => r.label), "Custom"];

const LINE_COLORS = [
  "#fb7185", // rose
  "#fbbf24", // amber
  "#c4b5fd", // lavender
  "#7dd3fc", // sky
  "#34d399", // emerald
  "#f97316", // orange
  "#a78bfa", // violet
  "#22d3ee", // cyan
  "#f472b6", // pink
  "#facc15", // yellow
];

const CHART_H = 260;

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgoStr(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function toISODate(dateStr: string, endOfDay = false): string {
  return dateStr + (endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z");
}

function fmtTick(ts: string, range: RangeLabel): string {
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

export function FilterBreakdown({ projectId }: Props) {
  const [range, setRange] = useState<RangeLabel>("24H");
  const [customFrom, setCustomFrom] = useState(() => nDaysAgoStr(1));
  const [customTo, setCustomTo] = useState(() => todayStr());
  const [hiddenFilters, setHiddenFilters] = useState<Set<string>>(new Set());

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
    queryKey: ["filters_series", projectId, since, until],
    queryFn: () => api.filtersSeries(projectId, since, until),
    enabled: !!since,
    refetchInterval: 60_000,
  });

  const toggleFilter = (f: string) => {
    setHiddenFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  const filters = data?.filters ?? [];
  const series = data?.series ?? [];

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: range === "Custom" ? 8 : 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--amber)", flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>Filter Rejection Breakdown</span>
        </div>
        <div
          style={{
            display: "inline-flex",
            border: "1px solid var(--border)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          {ALL_RANGE_LABELS.map((label) => {
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

      {/* Filter toggles */}
      {filters.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {filters.map((f, i) => {
            const color = LINE_COLORS[i % LINE_COLORS.length];
            const hidden = hiddenFilters.has(f);
            return (
              <button
                key={f}
                onClick={() => toggleFilter(f)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 10px",
                  fontSize: 11,
                  fontWeight: 500,
                  background: hidden ? "transparent" : `color-mix(in srgb, ${color} 15%, transparent)`,
                  color: hidden ? "var(--text-3)" : color,
                  border: `1px solid ${hidden ? "var(--border)" : color}`,
                  borderRadius: 20,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  opacity: hidden ? 0.5 : 1,
                  transition: "all 0.15s",
                }}
              >
                <span style={{
                  width: 8,
                  height: 3,
                  borderRadius: 2,
                  background: hidden ? "var(--text-3)" : color,
                }} />
                {f.replace("Filter", "")}
              </button>
            );
          })}
        </div>
      )}

      {/* Chart */}
      {series.length > 0 ? (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <LineChart data={series} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="started_at"
              tickFormatter={(ts) => fmtTick(ts, range)}
              tick={{ fill: "var(--text-2)", fontSize: 11 }}
              minTickGap={48}
            />
            <YAxis
              tick={{ fill: "var(--text-2)", fontSize: 11 }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
              labelStyle={{ color: "var(--text-2)", fontSize: 11 }}
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
            {filters.map((f, i) => {
              if (hiddenFilters.has(f)) return null;
              return (
                <Line
                  key={f}
                  type="monotone"
                  dataKey={f}
                  name={f.replace("Filter", "")}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      ) : data ? (
        <Empty label={range === "Custom" ? "No filter data in selected range" : `No filter data in the past ${range}`} />
      ) : (
        <div className="oh-skeleton" style={{ height: CHART_H }} />
      )}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div
      style={{
        height: CHART_H,
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
