import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api } from "../api/client";

const CHART_H = 220;

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
};

interface Props {
  projectId: string;
}

export function FeeDistribution({ projectId }: Props) {
  const { data } = useQuery({
    queryKey: ["fee_distribution", projectId],
    queryFn: () => api.feeDistribution(projectId),
    refetchInterval: 60_000,
  });

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: 2,
            background: "var(--indigo)",
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>
          Fee Distribution
        </span>
      </div>

      {data && data.length > 0 ? (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="band"
              tick={{ fill: "var(--text-2)", fontSize: 11 }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "var(--text-2)", fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
              labelStyle={{ color: "var(--text-2)", fontSize: 11 }}
              formatter={(value: number) => [value, "gigs"]}
            />
            <Bar dataKey="count" fill="var(--indigo)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : data ? (
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
          No fee data yet
        </div>
      ) : (
        <div className="oh-skeleton" style={{ height: CHART_H }} />
      )}
    </div>
  );
}
