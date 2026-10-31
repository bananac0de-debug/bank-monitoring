import { Suspense, lazy, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  ChevronDown,
  CircleHelp,
  Command,
  Database,
  FileText,
  Fingerprint,
  Gauge,
  Menu,
  Network,
  Search,
  Settings,
  ShieldAlert,
  WalletCards,
  X,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "./context/DashboardContext.jsx";
import { api } from "./api/client.js";
import { StateView } from "./components/common.jsx";

const Overview = lazy(() => import("./pages/Overview.jsx"));
const Transactions = lazy(() => import("./pages/Transactions.jsx"));
const FraudDetection = lazy(() => import("./pages/FraudDetection.jsx"));
const DsaVisualizer = lazy(() => import("./pages/DsaVisualizer.jsx"));
const Network3D = lazy(() => import("./pages/Network3D.jsx"));
const Analytics = lazy(() => import("./pages/Analytics.jsx"));
const Reports = lazy(() => import("./pages/Reports.jsx"));
const SettingsPage = lazy(() => import("./pages/Settings.jsx"));

const navItems = [
  { path: "/", label: "Overview", icon: Gauge },
  { path: "/transactions", label: "Transactions", icon: WalletCards },
  { path: "/fraud-detection", label: "Review signals", icon: ShieldAlert },
  { path: "/dsa", label: "DSA Visualizer", icon: Fingerprint },
  { path: "/network", label: "Transaction Network", icon: Network },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/reports", label: "Reports", icon: FileText },
  { path: "/settings", label: "Settings", icon: Settings },
];

function SearchBox() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      const payload = await api.search(query.trim());
      setResults(payload.transactions.slice(0, 6));
      if (!payload.transactions.length) setError("No matching records.");
    } catch (reason) {
      setError(reason.message);
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  function open(id) {
    setResults([]);
    setQuery("");
    navigate(`/transactions?focus=${encodeURIComponent(id)}`);
  }

  return (
    <div className="global-search-wrap">
      <form className="global-search" onSubmit={submit} role="search">
        <Search size={16} />
        <input
          aria-label="Search transaction, account, type or status"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setError(""); }}
          placeholder="Search ID, account, type…"
        />
        {busy ? <span className="search-loading">…</span> : <kbd><Command size={10} /></kbd>}
      </form>
      {(results.length > 0 || error) && (
        <div className="search-results">
          {error ? <p className="search-error">{error}</p> : results.map((item) => (
            <button type="button" key={item.transaction_id} onClick={() => open(item.transaction_id)}>
              <span>#{item.transaction_id} · {item.sender_account_id} → {item.receiver_account_id}</span>
              <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.amount)}</strong>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Header() {
  const { status, alerts } = useDashboard();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const highCount = useMemo(
    () => (alerts.data?.alerts || []).filter((item) => item.severity === "high").length,
    [alerts.data],
  );
  const alertRows = (alerts.data?.alerts || []).slice(0, 5);
  const backendUp = Boolean(status.data) && !status.error;

  return (
    <header className="topbar">
      <div className="mobile-mark"><span className="brand-mark">B</span><strong>Bank Monitor</strong></div>
      <div className={`backend-status ${status.loading && !status.data ? "is-checking" : backendUp ? "is-up" : "is-down"}`} title={status.error || "API reachable"} aria-live="polite">
        <span className="status-light" />
          <span>{status.loading && !status.data ? "Connecting to API…" : backendUp ? (status.data?.c_available ? "C engine active" : "Python fallback") : "Backend unreachable"}</span>
      </div>
      <div className="topbar-right">
        <SearchBox />
        <div className="notification-wrap">
          <button
            className="icon-button notification-button"
            type="button"
            aria-label={`${highCount} high severity alerts`}
            aria-expanded={showNotifications}
            onClick={() => setShowNotifications((value) => !value)}
          >
            <Bell size={17} />{highCount > 0 ? <span className="notification-count">{highCount}</span> : null}
          </button>
          {showNotifications && (
            <div className="notification-popover">
              <div className="popover-heading"><strong>Flagged for review</strong><button type="button" onClick={() => setShowNotifications(false)} aria-label="Close notifications"><X size={14} /></button></div>
              {alerts.error ? <p className="muted">{alerts.error}</p> : alertRows.length ? alertRows.map((alert) => (
                <button key={alert.alert_id} className="notification-row" type="button" onClick={() => { setShowNotifications(false); navigate("/fraud-detection"); }}>
                  <span className={`severity-dot severity-${alert.severity}`} />
                  <span><b>#{alert.transaction_id}</b><small>{alert.reason}</small></span>
                </button>
              )) : <p className="muted">No review signals returned.</p>}
            </div>
          )}
        </div>
        <button className="profile-button" type="button" title="Static demo profile">
          <span className="avatar">DM</span><span className="profile-label">Demo profile</span><ChevronDown size={13} />
        </button>
      </div>
    </header>
  );
}

function Shell() {
  const location = useLocation();
  const { alerts, status, transactions, preferences } = useDashboard();
  const [mobileNav, setMobileNav] = useState(false);
  const title = navItems.find((item) => item.path === location.pathname)?.label || "Overview";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <NavLink className="brand" to="/" aria-label="Bank Monitoring System home">
          <span className="brand-mark">B</span>
          <span><strong>Bank Monitor</strong><small>TRANSACTION INTELLIGENCE</small></span>
        </NavLink>
        <p className="nav-label">WORKSPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => setMobileNav(false)}
              className={`nav-item ${location.pathname === path ? "active" : ""}`}
              aria-current={location.pathname === path ? "page" : undefined}
            >
              <Icon size={17} /><span>{label}</span>
              {path === "/fraud-detection" && alerts.data?.count > 0 ? <i>{alerts.data.count}</i> : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="dataset-card">
            <Database size={16} />
            <div><strong>Source connected</strong><small>{transactions.data?.count ?? "—"} API records</small></div>
            <span className={`mini-status ${status.error ? "offline" : ""}`} />
          </div>
          <p className="sidebar-disclaimer">Synthetic demonstration dataset. Review signals are not confirmed fraud.</p>
        </div>
      </aside>
      {mobileNav ? <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} /> : null}
      <main className="main-content">
        <Header />
        <button className="mobile-menu icon-button" type="button" aria-label="Open navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><Menu size={17} /></button>
        <div className="page-context"><span>WORKSPACE</span><b>/</b>{title}</div>
        <Suspense fallback={<div className="page-wrap"><StateView loading /></div>}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: preferences.reducedMotion ? 0 : 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={preferences.reducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
          >
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/fraud-detection" element={<FraudDetection />} />
              <Route path="/dsa" element={<DsaVisualizer />} />
              <Route path="/network" element={<Network3D />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </Suspense>
      </main>
      <footer className="mobile-footer"><CircleHelp size={13} /> Rule-based review dashboard · Demo only</footer>
    </div>
  );
}

export default function App() {
  return <DashboardProvider><Shell /></DashboardProvider>;
}
