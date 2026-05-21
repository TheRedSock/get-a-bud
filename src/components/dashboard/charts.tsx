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

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { formatCents, formatChartAxisTick } from "@/lib/finance/money";

type CashFlowPoint = {
  month: string;
  income: number;
  expenses: number;
};

type SpendingPoint = {
  name: string;
  value: number;
  color: string;
};

type BalancePoint = {
  day: string;
  balance: number;
};

const CHART_HEIGHT = 260;
const BALANCE_CHART_HEIGHT = 220;

function ChartEmptyState({
  message,
  height = CHART_HEIGHT,
}: {
  message: string;
  height?: number;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-2xl border border-dashed bg-muted/30 text-sm text-muted-foreground"
      style={{ height }}
    >
      {message}
    </div>
  );
}

/** Visually hidden text table fallback for screen readers. */
function SrTable({ children }: { children: React.ReactNode }) {
  return (
    <table className="sr-only">
      <tbody>{children}</tbody>
    </table>
  );
}

const cashFlowValueLabels: Record<string, string> = {
  income: "Income",
  expenses: "Expenses",
};

export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  if (!data.length) {
    return <ChartEmptyState message="No cash flow data for this period yet." />;
  }

  const totalIncome = data.reduce((s, d) => s + d.income, 0);
  const totalExpenses = data.reduce((s, d) => s + d.expenses, 0);

  return (
    <div>
      <div
        role="img"
        aria-label={`Cash flow chart: ${formatCents(totalIncome)} income, ${formatCents(totalExpenses)} expenses over ${data.length} months`}
      >
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={data}>
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
            <YAxis
              stroke="var(--muted-foreground)"
              fontSize={12}
              tickFormatter={(value) => formatChartAxisTick(Number(value))}
            />
            <Tooltip
              content={
                <ChartTooltip
                  valueLabel={(name) => cashFlowValueLabels[name] ?? name}
                />
              }
            />
            <Bar dataKey="income" fill="var(--income)" radius={[8, 8, 0, 0]} />
            <Bar dataKey="expenses" fill="var(--expense)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SrTable>
        {data.map((d) => (
          <tr key={d.month}>
            <th scope="row">{d.month}</th>
            <td>Income: {formatCents(d.income)}</td>
            <td>Expenses: {formatCents(d.expenses)}</td>
          </tr>
        ))}
      </SrTable>
    </div>
  );
}

export function SpendingPieChart({ data }: { data: SpendingPoint[] }) {
  if (!data.length) {
    return (
      <ChartEmptyState message="No spending breakdown available for this period." />
    );
  }

  const summary = data.map((d) => `${d.name}: ${formatCents(d.value)}`).join(", ");

  return (
    <div>
      <div role="img" aria-label={`Spending breakdown: ${summary}`}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={92}
              paddingAngle={4}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <SrTable>
        {data.map((d) => (
          <tr key={d.name}>
            <th scope="row">{d.name}</th>
            <td>{formatCents(d.value)}</td>
          </tr>
        ))}
      </SrTable>
    </div>
  );
}

export function BalanceTrendChart({ data }: { data: BalancePoint[] }) {
  if (!data.length) {
    return (
      <ChartEmptyState
        height={BALANCE_CHART_HEIGHT}
        message="No balance history to show yet."
      />
    );
  }

  const latest = formatCents(data[data.length - 1].balance);

  return (
    <div>
      <div role="img" aria-label={`Balance trend chart, latest: ${latest}`}>
        <ResponsiveContainer width="100%" height={BALANCE_CHART_HEIGHT}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="balanceGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.42} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
            <YAxis
              stroke="var(--muted-foreground)"
              fontSize={12}
              tickFormatter={(value) => formatChartAxisTick(Number(value))}
              width={72}
            />
            <Tooltip
              content={<ChartTooltip valueLabel={() => "Balance"} />}
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
      </div>
      <SrTable>
        {data.map((d) => (
          <tr key={d.day}>
            <th scope="row">{d.day}</th>
            <td>{formatCents(d.balance)}</td>
          </tr>
        ))}
      </SrTable>
    </div>
  );
}
