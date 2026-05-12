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

import { formatMoney } from "@/lib/utils";

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

const tooltipStyle = {
  border: "1px solid var(--border)",
  borderRadius: "16px",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
};

/** Visually hidden text table fallback for screen readers. */
function SrTable({ children }: { children: React.ReactNode }) {
  return (
    <table className="sr-only">
      <tbody>{children}</tbody>
    </table>
  );
}

export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const totalIncome = data.reduce((s, d) => s + d.income, 0);
  const totalExpenses = data.reduce((s, d) => s + d.expenses, 0);

  return (
    <div>
      <div role="img" aria-label={`Cash flow chart: ${formatMoney(totalIncome)} income, ${formatMoney(totalExpenses)} expenses over ${data.length} months`}>
        <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
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
      </div>
      <SrTable>
        {data.map((d) => (
          <tr key={d.month}>
            <th scope="row">{d.month}</th>
            <td>Income: {formatMoney(d.income)}</td>
            <td>Expenses: {formatMoney(d.expenses)}</td>
          </tr>
        ))}
      </SrTable>
    </div>
  );
}

export function SpendingPieChart({ data }: { data: SpendingPoint[] }) {
  const summary = data.map((d) => `${d.name}: ${formatMoney(d.value)}`).join(", ");

  return (
    <div>
      <div role="img" aria-label={`Spending breakdown: ${summary}`}>
        <ResponsiveContainer width="100%" height={260}>
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
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => formatMoney(Number(value))}
          />
        </PieChart>
        </ResponsiveContainer>
      </div>
      <SrTable>
        {data.map((d) => (
          <tr key={d.name}>
            <th scope="row">{d.name}</th>
            <td>{formatMoney(d.value)}</td>
          </tr>
        ))}
      </SrTable>
    </div>
  );
}

export function BalanceTrendChart({ data }: { data: BalancePoint[] }) {
  const latest = data.length ? formatMoney(data[data.length - 1].balance) : "no data";

  return (
    <div>
      <div role="img" aria-label={`Balance trend chart, latest: ${latest}`}>
        <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
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
      </div>
      <SrTable>
        {data.map((d) => (
          <tr key={d.day}>
            <th scope="row">{d.day}</th>
            <td>{formatMoney(d.balance)}</td>
          </tr>
        ))}
      </SrTable>
    </div>
  );
}
