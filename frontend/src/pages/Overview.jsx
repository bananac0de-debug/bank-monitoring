import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, Clock3, Network, RefreshCw, ShieldAlert, Wallet } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useDashboard } from "../context/DashboardContext.jsx";
import { BarChartView, DonutChart, VolumeChart } from "../components/Charts.jsx";
import { MetricCard, PageTitle, Panel, RiskBadge, StateView, StatusBadge, formatMoney, formatDate } from "../components/common.jsx";

export default function Overview() {
  const { transactions, stats, alerts, status, preferences, setPreferences, refreshAll } = useDashboard();
  const navigate = useNavigate();
  const previousIds = useRef(new Set());
  const previousAlertIds = useRef(new Set());
  const [newRows, setNewRows] = useState([]);
  const [newHighAlerts, setNewHighAlerts] = useState([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const rows = transactions.data?.transactions || [];
  const alertRows = alerts.data?.alerts || [];

  useEffect(() => {
    if (!transactions.data) return;
    const currentIds = new Set(rows.map((row) => row.transaction_id));
    if (previousIds.current.size) {
      setNewRows(rows.filter((row) => !previousIds.current.has(row.transaction_id)).slice(0, 5));
    }
    previousIds.current = currentIds;
    setLastUpdated(new Date().toLocaleTimeString());
  }, [transactions.data]);

  useEffect(() => {
    if (!alerts.data) return;
    const currentIds = new Set(alertRows.map((alert) => alert.alert_id));
    if (previousAlertIds.current.size) {
      setNewHighAlerts(alertRows.filter((alert) =>
        alert.severity === "high" && !previousAlertIds.current.has(alert.alert_id),
      ));
    }
    previousAlertIds.current = currentIds;
  }, [alerts.data]);

  useEffect(() => {
    if (!preferences.autoRefresh) return undefined;
    const intervalId = window.setInterval(() => {
      refreshAll();
    }, Math.max(10, Number(preferences.refreshSeconds) || 30) * 1000);
    return () => window.clearInterval(intervalId);
  }, [preferences.autoRefresh, preferences.refreshSeconds, refreshAll]);

  const completed = rows.filter((row) => row.status === "completed").length;
  const failed = rows.filter((row) => row.status === "failed" || row.status === "declined").length;
  const reviewRate = stats.data?.total_transactions
    ? `${((stats.data.flagged_transactions / stats.data.total_transactions) * 100).toFixed(1)}%`
    : "0.0%";
  const statusSplit = useMemo(() => {
    const values = ["completed", "pending", "failed", "declined"];
    const colors = { completed: "#42d392", pending: "#f4b740", failed: "#ff2d55", declined: "#b47cff" };
    return values.map((name) => ({
      name,
      value: rows.filter((row) => row.status === name).length,
      color: colors[name],
    })).filter((row) => row.value > 0);
  }, [rows]);
  const riskSplit = useMemo(() => ["low", "medium", "high"].map((name) => ({
    name,
    value: rows.filter((row) => row.risk_level === name).length,
    color: { low: "#2e8bff", medium: "#f4b740", high: "#ff2d55" }[name],
  })), [rows]);
  const recentHigh = alertRows.filter((item) => item.severity === "high").slice(0, 5);
  const latestDay = stats.data?.volume_by_day?.at(-1);

  return (
    <div className="page-wrap">
      <PageTitle
        eyebrow="SYSTEM OVERVIEW"
        title="Transaction overview"
        description="A clear view of activity and rule-based review signals from your connected dataset."
        actions={
          <>
            <label className="toggle compact-toggle">
              <input
                type="checkbox"
                checked={preferences.autoRefresh}
                onChange={(event) => setPreferences((old) => ({ ...old, autoRefresh: event.target.checked }))}
              />
              <span className="toggle-track" />
              <span>Auto-refresh</span>
            </label>
            <button className="button button-secondary" type="button" onClick={async () => { await refreshAll(); }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </>
        }
      />
      <section className="dashboard-hero" aria-label="Dashboard introduction">
        <div className="hero-copy">
          <span className="hero-kicker"><span className="hero-kicker-dot" /> MONITORING CONSOLE <span className="hero-kicker-divider">/</span> DEMO ENVIRONMENT</span>
          <h2>See the flow.<br /><span>Understand the signals.</span></h2>
          <p>Explore transaction activity and account relationships from your connected dataset. Every signal is a review prompt—not a fraud verdict.</p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/transactions">Explore transactions <ArrowRight size={14} /></Link>
            <Link className="button hero-secondary" to="/network"><Network size={14} /> Open network</Link>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-orbit hero-orbit-outer" />
          <div className="hero-orbit hero-orbit-inner" />
          <div className="hero-center"><Activity size={25} /></div>
          <span className="hero-node hero-node-one" />
          <span className="hero-node hero-node-two" />
          <span className="hero-node hero-node-three" />
          <span className="hero-node hero-node-four" />
          <span className="hero-signal hero-signal-one" />
          <span className="hero-signal hero-signal-two" />
        </div>
        <div className="hero-summary">
          <div><span>RECORDS IN VIEW</span><strong>{stats.data?.total_transactions?.toLocaleString() ?? "—"}</strong></div>
          <div><span>LATEST ACTIVITY</span><strong>{latestDay?.date ?? "—"}</strong></div>
          <div><span>REVIEW SIGNALS</span><strong>{alerts.data?.count?.toLocaleString() ?? "—"}</strong></div>
        </div>
      </section>
      <div className="polling-note"><Clock3 size={13} /> Polling, not real-time streaming{preferences.autoRefresh ? ` · every ${preferences.refreshSeconds}s` : ""}{lastUpdated ? ` · updated ${lastUpdated}` : ""}</div>
      {(transactions.error || stats.error || alerts.error || status.error) && (
        <div className="inline-alert" role="alert">
          <AlertTriangle size={15} />
          {transactions.error || stats.error || alerts.error || status.error}
        </div>
      )}
      {newHighAlerts.length > 0 ? (
        <div className="notice-banner" role="status">
          <ShieldAlert size={15} />
          {newHighAlerts.length} new high-severity review signal{newHighAlerts.length === 1 ? "" : "s"} appeared in the latest poll.
          <button className="text-button" type="button" onClick={() => navigate("/fraud-detection")}>Review signals</button>
        </div>
      ) : null}
      <StateView loading={transactions.loading && !transactions.data} error={!transactions.data ? transactions.error : ""}>
        <section className="metric-grid">
          <MetricCard label="Total transactions" value={stats.data?.total_transactions?.toLocaleString() ?? "—"} note="Records in the source dataset" icon={Activity} />
          <MetricCard label="Total volume" value={formatMoney(stats.data?.total_value)} note="Value across all transactions" icon={Wallet} tone="green" />
          <MetricCard label="Flagged for review" value={stats.data?.flagged_transactions?.toLocaleString() ?? "—"} note="Unique records with one or more signals" icon={ShieldAlert} tone="red" />
          <MetricCard label="Successful" value={completed.toLocaleString()} note={`${failed} failed or declined`} icon={CheckCircle2} tone="green" />
          <MetricCard label="Review rate" value={reviewRate} note="Flagged records ÷ total records" icon={ArrowUpRight} tone="amber" />
        </section>
      </StateView>
      <div className="overview-grid">
        <Panel title="Daily transaction volume" subtitle="Computed from the active dataset">
          <StateView loading={stats.loading && !stats.data} error={!stats.data ? stats.error : ""} empty={!stats.data?.volume_by_day?.length} emptyText="No transaction activity yet.">
            <VolumeChart rows={stats.data?.volume_by_day || []} />
          </StateView>
        </Panel>
        <Panel title="Transaction status" subtitle="Status distribution">
          <StateView loading={transactions.loading && !transactions.data} error={!transactions.data ? transactions.error : ""} empty={!rows.length} emptyText="No status data available.">
            <DonutChart rows={statusSplit} centerLabel={`${rows.length} records`} />
          </StateView>
        </Panel>
        <Panel title="Review level" subtitle="Rule-based risk heuristic">
          <StateView loading={transactions.loading && !transactions.data} error={!transactions.data ? transactions.error : ""} empty={!rows.length} emptyText="No review levels available.">
            <DonutChart rows={riskSplit} centerLabel="score" />
          </StateView>
        </Panel>
        <Panel
          title="Highest-severity review signals"
          subtitle="Signals indicate activity to review, not confirmed fraud."
          actions={<button className="text-button" type="button" onClick={() => navigate("/fraud-detection")}>View all <ArrowUpRight size={13} /></button>}
        >
          <StateView loading={alerts.loading && !alerts.data} error={!alerts.data ? alerts.error : ""} empty={!recentHigh.length} emptyText="No high-severity review signals.">
            <div className="signal-list">
              {recentHigh.map((alert) => (
                <button className="signal-row" type="button" key={alert.alert_id} onClick={() => navigate(`/transactions?focus=${alert.transaction_id}`)}>
                  <span className="signal-indicator high"><AlertTriangle size={14} /></span>
                  <span className="signal-copy"><strong>#{alert.transaction_id} · {alert.account_id}</strong><small>{alert.reason}</small><small>{formatDate(alert.timestamp)}</small></span>
                  <RiskBadge level="high" />
                </button>
              ))}
            </div>
          </StateView>
        </Panel>
        <Panel title="Recent activity" subtitle="Latest transactions returned by the API" className="span-two">
          <StateView loading={transactions.loading && !transactions.data} error={!transactions.data ? transactions.error : ""} empty={!rows.length} emptyText="No transactions are available.">
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Transaction</th><th>Accounts</th><th>Amount</th><th>Status</th><th>Review score</th></tr></thead>
                <tbody>
                  {rows.slice(0, 6).map((row) => (
                    <tr key={row.transaction_id} className="clickable-row" onClick={() => navigate(`/transactions?focus=${row.transaction_id}`)}>
                      <td className="mono">#{row.transaction_id}<small>{formatDate(row.timestamp)}</small></td>
                      <td>{row.sender_account_id} <span className="arrow">→</span> {row.receiver_account_id}</td>
                      <td className="mono">{formatMoney(row.amount)}</td>
                      <td><StatusBadge status={row.status} /></td>
                      <td><RiskBadge level={row.risk_level} score={row.risk_score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </StateView>
        </Panel>
        <Panel title="Polling updates" subtitle="Refreshes are requested from Flask; no push stream is configured.">
          <StateView loading={false} error={transactions.error} empty={!newRows.length} emptyText={preferences.autoRefresh ? "No newly added transaction since the previous poll." : "Enable auto-refresh to watch for new records."}>
            <div className="signal-list">
              {newRows.map((row) => (
                <div className="monitor-row" key={row.transaction_id}>
                  <span className="live-dot" /> New record · #{row.transaction_id}
                  {row.risk_level === "high" ? <span className="badge risk-high">Review required</span> : null}
                </div>
              ))}
            </div>
          </StateView>
        </Panel>
        {alertRows.some((item) => item.severity === "high") && (
          <div className="notice-banner"><ShieldAlert size={15} /> High-severity signals are review prompts only; they do not establish fraud or intent.</div>
        )}
      </div>
    </div>
  );
}
