"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { balanceData, cashFlowData, spendingData } from "@/lib/demo-data";
import { formatMoney } from "@/lib/utils";

const tooltipStyle = {
  border: "1px solid var(--border)",
  borderRadius: "16px",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
};

export function CashFlowChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={cashFlowData}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
        <YAxis
          stroke="var(--muted-foreground)"
          fontSize={12}
          tickFormatter={(value) => `${Number(value) / 1000}k`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => formatMoney(Number(value))}
        />
        <Bar dataKey="income" fill="var(--chart-2)" radius={[8, 8, 0, 0]} />
        <Bar dataKey="expenses" fill="var(--chart-4)" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpendingPieChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={spendingData}
          dataKey="value"
          nameKey="name"
          innerRadius={62}
          outerRadius={92}
          paddingAngle={4}
        >
          {spendingData.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => formatMoney(Number(value))}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BalanceTrendChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={balanceData}>
        <defs>
          <linearGradient id="balanceGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.42} />
            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
        <YAxis hide domain={["dataMin - 5000", "dataMax + 5000"]} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => formatMoney(Number(value))}
        />
        <Area
          dataKey="balance"
          fill="url(#balanceGradient)"
          stroke="var(--primary)"
          strokeWidth={3}
          type="monotone"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
