import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { useDashboard } from "../context/DashboardContext.jsx";
import { formatDate, formatMoney, PageTitle, Panel, RiskBadge, StateView, StatusBadge } from "../components/common.jsx";

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(filename, fields, rows) {
  const csv = [
    fields.map((field) => csvCell(field.label)).join(","),
    ...rows.map((row) => fields.map((field) => csvCell(row[field.key])).join(",")),
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { transactions, alerts } = useDashboard();
  const [reportType, setReportType] = useState("transactions");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const dataset = transactions.data?.transactions || [];
  const rows = useMemo(() => dataset.filter((row) => {
    const day = row.timestamp.slice(0, 10);
    return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
  }), [dataset, dateFrom, dateTo]);
  const reportRows = reportType === "flagged" ? rows.filter((row) => row.risk_level !== "low") : rows;
  const generated = new Date().toLocaleString();
  const fields = [
    { key: "transaction_id", label: "Transaction ID" },
    { key: "sender_account_id", label: "Sender account" },
    { key: "receiver_account_id", label: "Receiver account" },
    { key: "amount", label: "Amount USD" },
    { key: "timestamp", label: "Timestamp" },
    { key: "transaction_type", label: "Transaction type" },
    { key: "status", label: "Status" },
    ...(reportType === "flagged" ? [
      { key: "risk_score", label: "Review score" },
      { key: "risk_level", label: "Review level" },
      { key: "risk_reasons", label: "Review reasons" },
    ] : []),
  ];

  function exportReport() {
    const output = reportRows.map((row) => ({
      ...row,
      amount: Number(row.amount).toFixed(2),
      risk_reasons: (row.risk_reasons || []).join(" | "),
    }));
    downloadCsv(`${reportType}-report.csv`, fields, output);
  }

  return (
    <div className="page-wrap report-page">
      <PageTitle eyebrow="EXPORT CENTER" title="Reports" description="Create a date-filtered CSV report from the current API dataset." actions={<button className="button button-secondary" type="button" onClick={() => window.print()}><Printer size={15} /> Print</button>} />
      <section className="panel report-controls">
        <label className="form-field"><span>Report</span><select value={reportType} onChange={(event) => setReportType(event.target.value)}><option value="transactions">Transaction report</option><option value="flagged">Flagged-for-review report</option></select></label>
        <label className="form-field"><span>From date</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label className="form-field"><span>To date</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <button className="button button-primary" type="button" onClick={exportReport} disabled={transactions.loading || !reportRows.length}><Download size={15} /> Export CSV</button>
      </section>
      <div className="report-meta"><span>Generated {generated}</span><span>Dataset size: {dataset.length} · Report rows: {reportRows.length}</span><span>Alert feed: {alerts.data?.count ?? "—"} signals</span></div>
      <Panel title={reportType === "flagged" ? "Flagged-for-review report" : "Transaction report"} subtitle="CSV fields match the preview. Text values are escaped for spreadsheet compatibility." className="report-table-panel">
        <StateView loading={transactions.loading && !transactions.data} error={transactions.error} empty={!reportRows.length} emptyText="No records are available for this report.">
          <div className="table-scroll">
            <table className="data-table report-table">
              <thead><tr>{fields.map((field) => <th key={field.key}>{field.label}</th>)}</tr></thead>
              <tbody>{reportRows.map((row) => (
                <tr key={row.transaction_id}>
                  <td className="mono">#{row.transaction_id}</td><td>{row.sender_account_id}</td><td>{row.receiver_account_id}</td><td className="mono">{formatMoney(row.amount)}</td><td>{formatDate(row.timestamp)}</td><td>{row.transaction_type}</td><td><StatusBadge status={row.status} /></td>
                  {reportType === "flagged" ? <><td>{row.risk_score}</td><td><RiskBadge level={row.risk_level} /></td><td className="reason-cell">{(row.risk_reasons || []).join("; ")}</td></> : null}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </StateView>
      </Panel>
      <p className="disclaimer">Flagged records are review signals only and do not establish fraud or intent.</p>
    </div>
  );
}
