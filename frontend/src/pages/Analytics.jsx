import { useMemo, useState } from "react";
import { Activity, CalendarDays, Filter } from "lucide-react";
import { BarChartView, DonutChart, VolumeChart } from "../components/Charts.jsx";
import { useDashboard } from "../context/DashboardContext.jsx";
import { formatMoney, MetricCard, PageTitle, Panel, StateView } from "../components/common.jsx";

function periodGroups(rows, formatKey) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = formatKey(new Date(row.timestamp));
    const group = grouped.get(key) || { date: key, amount: 0, count: 0 };
    group.amount += row.amount;
    group.count += 1;
    grouped.set(key, group);
  });
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date)).map((row) => ({ ...row, amount: Number(row.amount.toFixed(2)) }));
}

export default function Analytics() {
  const { transactions } = useDashboard();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const rows = transactions.data?.transactions || [];
  const filtered = useMemo(() => rows.filter((row) => {
    const day = row.timestamp.slice(0, 10);
    return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
  }), [rows, dateFrom, dateTo]);
  const daily = useMemo(() => {
    const grouped = new Map();
    filtered.forEach((row) => {
      const date = row.timestamp.slice(0, 10);
      const group = grouped.get(date) || { date, amount: 0, count: 0 };
      group.amount += row.amount;
      group.count += 1;
      grouped.set(date, group);
    });
    return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({ ...row, amount: Number(row.amount.toFixed(2)) }));
  }, [filtered]);
  const weekly = useMemo(() => periodGroups(filtered, (date) => {
    const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    return `W ${day.toISOString().slice(0, 10)}`;
  }), [filtered]);
  const monthly = useMemo(() => periodGroups(filtered, (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`), [filtered]);
  const statusRows = useMemo(() => ["completed", "pending", "failed", "declined"].map((name) => ({ label: name, value: filtered.filter((row) => row.status === name).length })), [filtered]);
  const riskRows = useMemo(() => [
    { name: "Normal", value: filtered.filter((row) => row.risk_level === "low").length, color: "#2e8bff" },
    { name: "Flagged", value: filtered.filter((row) => row.risk_level !== "low").length, color: "#ff2d55" },
  ], [filtered]);
  const topAmounts = useMemo(() => filtered.slice().sort((a, b) => b.amount - a.amount).slice(0, 10).map((row) => ({ label: `#${row.transaction_id}`, amount: row.amount })), [filtered]);
  const accounts = useMemo(() => {
    const volumes = new Map();
    filtered.forEach((row) => {
      volumes.set(row.sender_account_id, (volumes.get(row.sender_account_id) || 0) + row.amount);
      volumes.set(row.receiver_account_id, (volumes.get(row.receiver_account_id) || 0) + row.amount);
    });
    return [...volumes].map(([label, amount]) => ({ label, amount: Number(amount.toFixed(2)) })).sort((a, b) => b.amount - a.amount).slice(0, 10);
  }, [filtered]);
  const types = useMemo(() => {
    const counts = new Map();
    filtered.forEach((row) => counts.set(row.transaction_type, (counts.get(row.transaction_type) || 0) + 1));
    return [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  return (
    <div className="page-wrap">
      <PageTitle eyebrow="DATA EXPLORATION" title="Analytics" description="Interactive views computed from the same API records and active date range." />
      <section className="panel analytics-filter">
        <Filter size={15} /><strong>Date range</strong>
        <label><span>From</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label><span>To</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <span className="filter-count"><CalendarDays size={13} /> {filtered.length} of {rows.length} records</span>
        {(dateFrom || dateTo) ? <button className="text-button" type="button" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear range</button> : null}
      </section>
      <div className="metric-grid metric-grid-three">
        <MetricCard label="Filtered records" value={filtered.length.toLocaleString()} note="Applied across every chart" icon={Activity} />
        <MetricCard label="Filtered volume" value={formatMoney(filtered.reduce((sum, row) => sum + row.amount, 0))} note="Sum of selected transaction values" icon={CalendarDays} tone="green" />
        <MetricCard label="Flagged records" value={filtered.filter((row) => row.risk_level !== "low").length.toLocaleString()} note="One or more review signals" icon={Filter} tone="red" />
      </div>
      <StateView loading={transactions.loading && !transactions.data} error={transactions.error} empty={!filtered.length} emptyText="No transactions fall within the selected date range.">
        <div className="analytics-grid">
          <Panel title="Daily volume" subtitle="Transaction amount per calendar day"><VolumeChart rows={daily} /></Panel>
          <Panel title="Weekly trend" subtitle="Weeks start on Monday"><VolumeChart rows={weekly} /></Panel>
          <Panel title="Monthly trend" subtitle="Calendar month totals"><VolumeChart rows={monthly} /></Panel>
          <Panel title="Transaction status" subtitle="Completed, pending, failed and declined"><BarChartView rows={statusRows} dataKey="value" labelKey="label" /></Panel>
          <Panel title="Normal vs flagged" subtitle="Flagged means one or more review signals"><DonutChart rows={riskRows} /></Panel>
          <Panel title="Top transaction amounts" subtitle="Highest values in the selected range"><BarChartView rows={topAmounts} dataKey="amount" labelKey="label" /></Panel>
          <Panel title="Most active accounts by volume" subtitle="Counts sender and receiver values"><BarChartView rows={accounts} dataKey="amount" labelKey="label" horizontal /></Panel>
          <Panel title="Transaction types" subtitle="Distribution across the current dataset"><BarChartView rows={types} dataKey="value" labelKey="label" horizontal /></Panel>
        </div>
      </StateView>
    </div>
  );
}
