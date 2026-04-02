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
  ResponsiveContainer,
} from "recharts";
import { api } from "../api/client";

interface Props {
  projectId: string;
}

const RANGES = [
  { label: "1W",  ms: 7  * 86_400_000 },
  { label: "2W",  ms: 14 * 86_400_000 },
  { label: "1M",  ms: 30 * 86_400_000 },
  { label: "3M",  ms: 90 * 86_400_000 },
];

function toISODate(dateStr: string, endOfDay = false): string {
  return dateStr + (endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z");
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgoStr(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function fmtTick(ts: string, range: string): string {
  const d = new Date(ts);
  if (range === "1W" || range === "2W") {
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
  }
  // 1M, 3M, Custom
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function ListingsChart({ projectId }: Props) {
  const [range, setRange] = useState("1W");
  const [customFrom, setCustomFrom] = useState(() => nDaysAgoStr(7));
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
    queryKey: ["listings", projectId, since, until],
    queryFn: () => api.listingsWindows(projectId, since, until, 24),
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
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--indigo)", flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>Avg Listings per Day</span>
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
              <linearGradient id="gListings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="window_start"
              tickFormatter={(ts) => fmtTick(ts, range)}
              tick={{ fill: "var(--text-2)", fontSize: 11 }}
              minTickGap={48}
            />
            <YAxis tick={{ fill: "var(--text-2)", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
              labelStyle={{ color: "var(--text-2)", fontSize: 11 }}
              formatter={(val: number | undefined, name: string | undefined) => {
                if (name === "avg_listed") return [`${val ?? "—"} avg`, "Avg listed"];
                return [val ?? "—", name ?? ""];
              }}
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
            <Area
              type="monotone"
              dataKey="avg_listed"
              name="avg_listed"
              stroke="#6366f1"
              fill="url(#gListings)"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : data ? (
        <Empty label="No listings data for this range" />
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
