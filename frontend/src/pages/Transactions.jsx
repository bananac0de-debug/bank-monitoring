import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useDashboard } from "../context/DashboardContext.jsx";
import { EmptyCell, formatDate, formatMoney, Modal, PageTitle, RiskBadge, StateView, StatusBadge } from "../components/common.jsx";

const LIMIT = 512;
const PAGE_SIZE = 8;
const blankRecord = () => ({
  transaction_id: "",
  sender_account_id: "",
  receiver_account_id: "",
  amount: "",
  timestamp: new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 19),
  status: "completed",
  transaction_type: "transfer",
});

function validateRecord(record, existing, editing) {
  if (!editing && record.transaction_id !== "" && !/^\d+$/.test(String(record.transaction_id))) {
    return "Transaction ID must be a whole number.";
  }
  if (!editing && record.transaction_id !== "" && existing.some((item) => item.transaction_id === Number(record.transaction_id))) {
    return `Transaction ID ${record.transaction_id} already exists.`;
  }
  for (const [field, max] of [["sender_account_id", 39], ["receiver_account_id", 39], ["status", 19], ["transaction_type", 39]]) {
    const value = String(record[field] ?? "").trim();
    if (!value) return `${field.replaceAll("_", " ")} is required.`;
    if (value.length > max || value.includes("|") || value.includes("\n")) {
      return `${field.replaceAll("_", " ")} must be at most ${max} characters and cannot contain '|'.`;
    }
  }
  if (!["completed", "pending", "failed", "declined"].includes(record.status.toLowerCase())) {
    return "Status must be completed, pending, failed, or declined.";
  }
  if (record.amount === "" || !Number.isFinite(Number(record.amount)) || Number(record.amount) < 0) {
    return "Amount must be a non-negative number.";
  }
  if (!Number.isInteger(Number(record.transaction_id)) && editing === false && record.transaction_id !== "") {
    return "Transaction ID must be a whole number.";
  }
  const stamp = new Date(record.timestamp);
  if (Number.isNaN(stamp.getTime()) || /(?:Z|[+-]\d{2}:\d{2})$/i.test(record.timestamp)) {
    return "Timestamp must be a local ISO date/time without a timezone offset.";
  }
  return "";
}

function TransactionForm({ initial, existing, onSubmit, busy, serverError }) {
  const editing = Boolean(initial);
  const [record, setRecord] = useState(() => initial ? { ...initial } : blankRecord());
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const validation = validateRecord(record, existing, editing);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    await onSubmit({
      ...record,
      ...(editing ? { transaction_id: initial.transaction_id } : record.transaction_id === "" ? {} : { transaction_id: Number(record.transaction_id) }),
      amount: Number(record.amount),
    });
  }

  function field(name, label, props = {}) {
    return (
      <label className="form-field" key={name}>
        <span>{label}</span>
        <input
          value={record[name] ?? ""}
          onChange={(event) => setRecord((old) => ({ ...old, [name]: event.target.value }))}
          readOnly={name === "transaction_id" && editing}
          required={name !== "transaction_id"}
          {...props}
        />
      </label>
    );
  }

  return (
    <form className="transaction-form" onSubmit={submit} noValidate>
      {!editing && field("transaction_id", "Transaction ID (optional)", { inputMode: "numeric", placeholder: "Auto-assigned if empty" })}
      <div className="form-grid">
        {field("sender_account_id", "Sender account", { maxLength: 39 })}
        {field("receiver_account_id", "Receiver account", { maxLength: 39 })}
        {field("amount", "Amount (USD)", { type: "number", min: "0", step: "0.01" })}
        {field("timestamp", "Local timestamp", { type: "datetime-local", step: "1" })}
        <label className="form-field"><span>Status</span><select value={record.status} onChange={(event) => setRecord((old) => ({ ...old, status: event.target.value }))}>{["completed", "pending", "failed", "declined"].map((value) => <option key={value}>{value}</option>)}</select></label>
        {field("transaction_type", "Transaction type", { maxLength: 39 })}
      </div>
      <div className="form-guidance">No pipe characters are accepted. Amounts must be non-negative. Maximum dataset size: {LIMIT} records.</div>
      {error || serverError ? <div className="form-error" role="alert"><AlertTriangle size={14} />{error || serverError}</div> : null}
      <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => window.dispatchEvent(new CustomEvent("close-transaction-modal"))}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add transaction"}</button></div>
    </form>
  );
}

function DetailPanel({ row, onClose }) {
  return (
    <Modal title={`Transaction #${row.transaction_id}`} onClose={onClose}>
      <div className="detail-grid">
        <div><small>Sender</small><strong>{row.sender_account_id}</strong></div>
        <div><small>Receiver</small><strong>{row.receiver_account_id}</strong></div>
        <div><small>Amount</small><strong>{formatMoney(row.amount)}</strong></div>
        <div><small>Timestamp</small><strong>{formatDate(row.timestamp)}</strong></div>
        <div><small>Type</small><strong>{row.transaction_type}</strong></div>
        <div><small>Status</small><StatusBadge status={row.status} /></div>
      </div>
      <div className="detail-risk">
        <h3>Rule-based review score <RiskBadge level={row.risk_level} score={row.risk_score} /></h3>
        {row.risk_reasons?.length ? <ul>{row.risk_reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul> : <p className="muted">No review signals are currently associated with this transaction.</p>}
        <p className="disclaimer">Signals are heuristics for review, not confirmed fraud.</p>
      </div>
    </Modal>
  );
}

export default function Transactions() {
  const { transactions, refreshAll } = useDashboard();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("timestamp");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [requestState, setRequestState] = useState({ loading: true, error: "" });
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  const focusId = searchParams.get("focus");
  useEffect(() => {
    if (transactions.data) {
      setRows(transactions.data.transactions);
      setRequestState({ loading: false, error: "" });
    } else if (transactions.error) {
      setRequestState({ loading: false, error: transactions.error });
    }
  }, [transactions.data, transactions.error]);

  useEffect(() => {
    let active = true;
    setRequestState((old) => ({ ...old, loading: true, error: "" }));
    api.transactions({ q: debouncedQuery, status: statusFilter, sort_by: sortBy, order })
      .then((payload) => {
        if (active) {
          setRows(payload.transactions);
          setRequestState({ loading: false, error: "" });
        }
      })
      .catch((error) => {
        if (active) setRequestState({ loading: false, error: error.message });
      });
    return () => { active = false; };
  }, [debouncedQuery, statusFilter, sortBy, order]);

  useEffect(() => {
    if (!focusId || !transactions.data) return;
    const found = transactions.data.transactions.find((row) => String(row.transaction_id) === focusId);
    if (found) setSelected(found);
  }, [focusId, transactions.data]);

  useEffect(() => {
    const close = () => setModal(null);
    window.addEventListener("close-transaction-modal", close);
    return () => window.removeEventListener("close-transaction-modal", close);
  }, []);

  const filtered = useMemo(() => typeFilter ? rows.filter((row) => row.transaction_type === typeFilter) : rows, [rows, typeFilter]);
  const types = useMemo(() => [...new Set((transactions.data?.transactions || []).map((row) => row.transaction_type))].sort(), [transactions.data]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allRows = transactions.data?.transactions || [];

  useEffect(() => setPage(1), [debouncedQuery, statusFilter, typeFilter, sortBy, order]);
  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount]);

  async function save(record) {
    setBusy(true);
    setServerError("");
    try {
      if (modal.mode === "edit") await api.updateTransaction(modal.row.transaction_id, record);
      else await api.createTransaction(record);
      setNotice(modal.mode === "edit" ? "Transaction updated." : "Transaction added.");
      setModal(null);
      await refreshAll();
    } catch (error) {
      setServerError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    if (!window.confirm(`Delete transaction #${row.transaction_id}? This change will be written to the source dataset.`)) return;
    setBusy(true);
    setNotice("");
    try {
      await api.deleteTransaction(row.transaction_id);
      setSelected(null);
      setNotice(`Transaction #${row.transaction_id} deleted.`);
      await refreshAll();
    } catch (error) {
      setNotice(`Could not delete transaction: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function closeDetails() {
    setSelected(null);
    if (searchParams.has("focus")) {
      searchParams.delete("focus");
      setSearchParams(searchParams, { replace: true });
    }
  }

  function exportCurrent() {
    const fields = ["transaction_id", "sender_account_id", "receiver_account_id", "amount", "timestamp", "transaction_type", "status", "risk_score", "risk_level"];
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const content = [fields.map(quote).join(","), ...filtered.map((row) => fields.map((field) => quote(row[field])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-wrap">
      <PageTitle eyebrow="DATA MANAGEMENT" title="Transactions" description="Search and manage API records. Changes are persisted to the existing dataset." actions={<button className="button button-primary" type="button" onClick={() => { setServerError(""); setModal({ mode: "add" }); }} disabled={allRows.length >= LIMIT}><Plus size={15} /> Add transaction</button>} />
      {allRows.length >= LIMIT ? <div className="inline-alert"><AlertTriangle size={14} /> Dataset capacity reached: {LIMIT} records. Delete a record before adding another.</div> : null}
      {notice ? <div className="notice-banner" role="status">{notice}</div> : null}
      <section className="panel transactions-panel">
        <div className="toolbar">
          <label className="table-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, sender, receiver…" aria-label="Search transaction records" /></label>
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{["completed", "pending", "failed", "declined"].map((value) => <option key={value}>{value}</option>)}</select>
          <select aria-label="Filter by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All types</option>{types.map((value) => <option key={value}>{value}</option>)}</select>
          <select aria-label="Sort field" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="timestamp">Timestamp</option><option value="amount">Amount</option></select>
          <button className="button button-secondary" type="button" onClick={() => setOrder((old) => old === "asc" ? "desc" : "asc")}>{order === "asc" ? "Ascending" : "Descending"}</button>
          <button className="button button-quiet" type="button" onClick={exportCurrent}><Download size={14} /> CSV</button>
        </div>
        <StateView loading={requestState.loading && !rows.length} error={requestState.error} empty={!requestState.loading && !filtered.length} emptyText="No transactions match these filters.">
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>ID</th><th>Sender → Receiver</th><th>Amount</th><th>Date / time</th><th>Type</th><th>Status</th><th>Review score</th><th>Actions</th></tr></thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.transaction_id} className="clickable-row" onClick={() => setSelected(row)}>
                    <td className="mono">#{row.transaction_id}</td>
                    <td>{row.sender_account_id} <span className="arrow">→</span> {row.receiver_account_id}</td>
                    <td className="mono">{formatMoney(row.amount)}</td>
                    <td>{formatDate(row.timestamp)}</td>
                    <td>{row.transaction_type}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td><RiskBadge level={row.risk_level} score={row.risk_score} /></td>
                    <td><div className="row-actions" onClick={(event) => event.stopPropagation()}>
                      <button className="icon-button" aria-label={`View transaction ${row.transaction_id}`} type="button" onClick={() => setSelected(row)}><Eye size={14} /></button>
                      <button className="icon-button" aria-label={`Edit transaction ${row.transaction_id}`} type="button" onClick={() => { setServerError(""); setModal({ mode: "edit", row }); }}><Pencil size={14} /></button>
                      <button className="icon-button danger-icon" aria-label={`Delete transaction ${row.transaction_id}`} type="button" disabled={busy} onClick={() => remove(row)}><Trash2 size={14} /></button>
                    </div></td>
                  </tr>
                ))}
                {!requestState.loading && filtered.length === 0 ? <EmptyCell colSpan={8}>No matching rows.</EmptyCell> : null}
              </tbody>
            </table>
          </div>
          <div className="table-footer"><span>{filtered.length} matching records · page {page} of {pageCount}</span><div><button className="button button-quiet" type="button" disabled={page <= 1} onClick={() => setPage((old) => old - 1)}>Previous</button><button className="button button-quiet" type="button" disabled={page >= pageCount} onClick={() => setPage((old) => old + 1)}>Next</button></div></div>
        </StateView>
      </section>
      {modal ? <Modal title={modal.mode === "edit" ? `Edit transaction #${modal.row.transaction_id}` : "Add transaction"} onClose={() => setModal(null)} wide><TransactionForm key={modal.row?.transaction_id || "new"} initial={modal.row} existing={allRows} onSubmit={save} busy={busy} serverError={serverError} /></Modal> : null}
      {selected ? <DetailPanel row={selected} onClose={closeDetails} /> : null}
    </div>
  );
}
