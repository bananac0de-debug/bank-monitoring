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
import { formatMoney } from "./common.jsx";

const COLORS = ["#2e8bff", "#ff2d55", "#f4b740", "#42d392"];
const axis = { fill: "#8290a4", fontSize: 10 };

export function VolumeChart({ rows, dataKey = "amount", compact = false }) {
  return (
    <div className={`chart ${compact ? "chart-compact" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2e8bff" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#2e8bff" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#202a39" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} />
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            width={compact ? 42 : 55}
            tickFormatter={(value) => dataKey === "amount" ? `$${Number(value) / 1000}k` : value}
          />
          <Tooltip
            contentStyle={{ background: "#111722", border: "1px solid #2b3545", borderRadius: 9 }}
            formatter={(value) => dataKey === "amount" ? formatMoney(value) : value}
          />
          <Area type="monotone" dataKey={dataKey} stroke="#2e8bff" strokeWidth={2} fill="url(#volumeFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ rows, nameKey = "name", valueKey = "value", centerLabel }) {
  return (
    <div className="donut-wrap">
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie data={rows} dataKey={valueKey} nameKey={nameKey} innerRadius={56} outerRadius={78} paddingAngle={3}>
            {rows.map((entry, index) => <Cell key={entry[nameKey]} fill={entry.color || COLORS[index % COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: "#111722", border: "1px solid #2b3545", borderRadius: 9 }} />
        </PieChart>
      </ResponsiveContainer>
      {centerLabel ? <span className="donut-label">{centerLabel}</span> : null}
      <div className="chart-legend">
        {rows.map((row, index) => (
          <span key={row[nameKey]}><i style={{ background: row.color || COLORS[index % COLORS.length] }} />{row[nameKey]} <b>{row[valueKey]}</b></span>
        ))}
      </div>
    </div>
  );
}

export function BarChartView({ rows, dataKey = "amount", labelKey = "label", horizontal = false }) {
  return (
    <div className="chart chart-bars">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="#202a39" strokeDasharray="3 5" vertical={!horizontal} horizontal={horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tick={axis} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey={labelKey} tick={axis} tickLine={false} axisLine={false} width={110} />
            </>
          ) : (
            <>
              <XAxis dataKey={labelKey} tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} />
            </>
          )}
          <Tooltip
            contentStyle={{ background: "#111722", border: "1px solid #2b3545", borderRadius: 9 }}
            formatter={(value) => dataKey.toLowerCase().includes("amount") ? formatMoney(value) : value}
          />
          <Bar dataKey={dataKey} fill="#2e8bff" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
