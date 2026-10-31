import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Filter, ShieldAlert } from "lucide-react";
import { useDashboard } from "../context/DashboardContext.jsx";
import { formatDate, formatMoney, PageTitle, Panel, RiskBadge, StateView, StatusBadge } from "../components/common.jsx";

function ruleName(reason) {
  if (reason.startsWith("High-value")) return "High-value transfer";
  if (reason.includes("transactions from")) return "Rapid activity";
  if (reason.startsWith("Repeated transfers")) return "Repeated recipient";
  if (reason.startsWith("Transaction was")) return "Failed or declined";
  if (reason.startsWith("Amount $")) return "Sudden amount jump";
  return "Other review signal";
}

export default function FraudDetection() {
  const { alerts, transactions, preferences, setPreferences } = useDashboard();
  const [groupBy, setGroupBy] = useState("rule");
  const [expanded, setExpanded] = useState("");
  const [thresholdDraft, setThresholdDraft] = useState(preferences.threshold);
  const transactionById = useMemo(() => new Map(
    (transactions.data?.transactions || []).map((row) => [row.transaction_id, row]),
  ), [transactions.data]);
  const groups = useMemo(() => {
    const keyFor = (alert) => groupBy === "account" ? alert.account_id : ruleName(alert.reason);
    return Object.groupBy
      ? Object.groupBy(alerts.data?.alerts || [], keyFor)
      : (alerts.data?.alerts || []).reduce((result, alert) => {
        const key = keyFor(alert);
        result[key] ||= [];
        result[key].push(alert);
        return result;
      }, {});
  }, [alerts.data, groupBy]);
  const groupEntries = Object.entries(groups);
  const totalHigh = (alerts.data?.alerts || []).filter((item) => item.severity === "high").length;
  const totalMedium = (alerts.data?.alerts || []).filter((item) => item.severity === "medium").length;

  function applyThreshold(event) {
    event.preventDefault();
    const threshold = Number(thresholdDraft);
    if (!Number.isFinite(threshold) || threshold <= 0) return;
    setPreferences((old) => ({ ...old, threshold: String(threshold) }));
  }

  return (
    <div className="page-wrap">
      <PageTitle eyebrow="RULE-BASED MONITORING" title="Flagged for review" description="Inspect rule-based signals alongside the transaction details that produced them." />
      <div className="notice-banner"><ShieldAlert size={16} /><span>These are rule-based review signals, not confirmed fraud. Multiple signals can apply to one transaction.</span></div>
      <div className="metric-grid metric-grid-three">
        <article className="metric-card"><div className="metric-head">High severity<span className="severity-dot severity-high" /></div><strong className="metric-value">{alerts.loading && !alerts.data ? "—" : totalHigh}</strong><p className="metric-note">Requires closer review</p></article>
        <article className="metric-card"><div className="metric-head">Medium severity<span className="severity-dot severity-medium" /></div><strong className="metric-value">{alerts.loading && !alerts.data ? "—" : totalMedium}</strong><p className="metric-note">Rule threshold for review</p></article>
        <article className="metric-card"><div className="metric-head">Queue ordering</div><strong className="metric-engine">{alerts.data?.engine || (alerts.loading ? "Loading…" : "Unavailable")}</strong><p className="metric-note">API-reported engine</p></article>
      </div>
      <div className="review-toolbar">
        <form className="threshold-form" onSubmit={applyThreshold}>
          <label><span>High-value threshold</span><div><span className="currency-prefix">$</span><input aria-label="High-value alert threshold" type="number" min="0.01" step="0.01" value={thresholdDraft} onChange={(event) => setThresholdDraft(event.target.value)} /></div></label>
          <button className="button button-secondary" type="submit">Apply threshold</button>
        </form>
        <label className="select-with-icon"><Filter size={14} /><span>Group by</span><select value={groupBy} onChange={(event) => { setGroupBy(event.target.value); setExpanded(""); }}><option value="rule">Rule</option><option value="account">Account</option></select></label>
      </div>
      <Panel title={`${alerts.data?.count ?? 0} review signals`} subtitle="Alerts are returned in backend queue order.">
        <StateView loading={alerts.loading && !alerts.data} error={alerts.error} empty={!groupEntries.length} emptyText="No alerts matched the active rule thresholds.">
          <div className="accordion-list">
            {groupEntries.map(([group, items]) => {
              const isOpen = expanded === group || (!expanded && groupEntries.length === 1);
              return (
                <section className="accordion-item" key={group}>
                  <button className="accordion-button" type="button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? "" : group)}>
                    <span><ChevronDown size={16} className={isOpen ? "chevron-open" : ""} /><strong>{group}</strong></span>
                    <span className="accordion-meta">{items.length} signals <span className="badge risk-high">{items.filter((item) => item.severity === "high").length} high</span></span>
                  </button>
                  {isOpen ? (
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead><tr><th>Transaction</th><th>Account</th><th>Amount</th><th>Rule reason</th><th>Severity</th><th>Status</th><th>Timestamp</th></tr></thead>
                        <tbody>{items.map((alert) => {
                          const transaction = transactionById.get(alert.transaction_id);
                          return (
                            <tr key={alert.alert_id}>
                              <td className="mono">#{alert.transaction_id}</td>
                              <td>{alert.account_id}</td>
                              <td className="mono">{transaction ? formatMoney(transaction.amount) : "—"}</td>
                              <td className="reason-cell">{alert.reason}<small>{ruleName(alert.reason)}</small></td>
                              <td><span className={`badge severity-badge severity-${alert.severity}`}>{alert.severity}</span></td>
                              <td><StatusBadge status={alert.status} /></td>
                              <td>{formatDate(alert.timestamp)}</td>
                            </tr>
                          );
                        })}</tbody>
                      </table>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </StateView>
      </Panel>
      <div className="rule-explainer"><AlertTriangle size={15} /><span>Rules include high value, rapid activity, repeated recipient, failed or declined attempts, and sudden amount increases. The backend remains the source of truth for rule results.</span></div>
    </div>
  );
}
