import { AlertTriangle, LoaderCircle } from "lucide-react";

export function PageTitle({ eyebrow, title, description, actions }) {
  return (
    <header className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({ title, subtitle, actions, className = "", children }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-heading">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StateView({ loading, error, empty, emptyText = "No records to display.", children }) {
  if (loading) {
    return (
      <div className="state-view" role="status">
        <LoaderCircle className="spin" size={18} />
        <span>Loading from the backend…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="state-view state-error" role="alert">
        <AlertTriangle size={18} />
        <span>{error}</span>
      </div>
    );
  }
  if (empty) return <div className="state-view muted">{emptyText}</div>;
  return children;
}

export function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}>{status}</span>;
}

export function RiskBadge({ level, score }) {
  return (
    <span className={`badge risk-${level || "low"}`}>
      {level || "low"}{Number.isFinite(score) ? ` · ${score}` : ""}
    </span>
  );
}

export function MetricCard({ label, value, note, icon: Icon, tone = "blue" }) {
  return (
    <article className="metric-card">
      <div className="metric-head">
        <span>{label}</span>
        {Icon ? <span className={`metric-icon tone-${tone}`}><Icon size={16} /></span> : null}
      </div>
      <strong className="metric-value">{value}</strong>
      {note ? <p className="metric-note">{note}</p> : null}
    </article>
  );
}

export function EmptyCell({ colSpan, children }) {
  return <tr><td className="empty-cell" colSpan={colSpan}>{children}</td></tr>;
}

export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

export function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
