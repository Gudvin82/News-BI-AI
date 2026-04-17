"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface RevenueChartProps {
  data: { day: string; value: number; isToday?: boolean }[];
  height?: number;
}

function formatK(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${Math.round(v / 1_000)}K`;
  return String(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm shadow-lg"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="font-medium mb-0.5" style={{ color: "var(--color-muted)" }}>{label}</p>
      <p className="font-bold tabular-nums" style={{ color: "var(--color-brand)" }}>
        ₽ {Number(payload[0].value).toLocaleString("ru-RU")}
      </p>
    </div>
  );
}

export function RevenueChart({ data, height = 140 }: RevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barCategoryGap="30%" margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="day"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--color-muted)" }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tickFormatter={formatK}
          tick={{ fontSize: 11, fill: "var(--color-muted)" }}
          width={36}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(245,158,11,0.06)", radius: 4 }} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.isToday ? "#F59E0B" : entry.value === 0 ? "var(--color-border)" : "#FCD34D"}
              opacity={entry.value === 0 ? 0.4 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
