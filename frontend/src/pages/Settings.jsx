import { useEffect, useState } from "react";
import { Check, Server, Settings2 } from "lucide-react";
import { useDashboard } from "../context/DashboardContext.jsx";
import { PageTitle, Panel, StateView } from "../components/common.jsx";

export default function SettingsPage() {
  const { preferences, setPreferences, status, alerts, refreshAll } = useDashboard();
  const [threshold, setThreshold] = useState(preferences.threshold);
  const [refreshSeconds, setRefreshSeconds] = useState(String(preferences.refreshSeconds));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setThreshold(preferences.threshold);
    setRefreshSeconds(String(preferences.refreshSeconds));
  }, [preferences.threshold, preferences.refreshSeconds]);

  function saveSettings(event) {
    event.preventDefault();
    const numericThreshold = Number(threshold);
    const interval = Number(refreshSeconds);
    if (!Number.isFinite(numericThreshold) || numericThreshold <= 0 || !Number.isInteger(interval) || interval < 10 || interval > 3600) return;
    setPreferences((old) => ({ ...old, threshold: String(numericThreshold), refreshSeconds: interval }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  }

  return (
    <div className="page-wrap">
      <PageTitle eyebrow="PREFERENCES" title="Settings" description="Adjust local presentation and polling preferences for this browser." />
      <div className="settings-grid">
        <Panel title="Review thresholds" subtitle="The alert endpoint uses this value for the high-value review rule.">
          <form className="settings-form" onSubmit={saveSettings}>
            <label className="form-field"><span>High-value threshold (USD)</span><input type="number" min="0.01" step="0.01" value={threshold} onChange={(event) => setThreshold(event.target.value)} required /></label>
            <label className="form-field"><span>Auto-refresh interval (seconds)</span><input type="number" min="10" max="3600" step="1" value={refreshSeconds} onChange={(event) => setRefreshSeconds(event.target.value)} required /><small>Polling is not real-time streaming. Valid range: 10–3600 seconds.</small></label>
            <button className="button button-primary" type="submit">{saved ? <Check size={14} /> : <Settings2 size={14} />}{saved ? "Saved" : "Save preferences"}</button>
          </form>
        </Panel>
        <Panel title="Interface preferences" subtitle="Stored in this browser's localStorage.">
          <div className="settings-toggle-list">
            <label className="setting-row"><span><strong>Reduced motion</strong><small>Prefer fewer interface animations.</small></span><input type="checkbox" checked={preferences.reducedMotion} onChange={(event) => setPreferences((old) => ({ ...old, reducedMotion: event.target.checked }))} /></label>
            <label className="setting-row setting-disabled"><span><strong>Demo data</strong><small>No separate demo dataset is configured. The source data is not altered.</small></span><input type="checkbox" disabled checked={preferences.demoData} onChange={() => {}} /></label>
          </div>
        </Panel>
        <Panel title="Backend status" subtitle="Live response from /api/algorithms/status">
          <StateView loading={status.loading && !status.data} error={status.error}>
            <div className="backend-card">
              <span className={`backend-icon ${status.data?.c_available ? "green" : "blue"}`}><Server size={19} /></span>
              <div><strong>{status.data?.c_available ? "C engine active" : "Python fallback"}</strong><small>{status.data?.executable || "C executable not compiled"}</small></div>
              <span className="badge status-completed">API reachable</span>
            </div>
            <p className="muted small-note">{status.data?.fallback}</p>
            <p className="muted small-note">Supported operations: {(status.data?.algorithms || []).join(", ")}.</p>
          </StateView>
        </Panel>
        <Panel title="Alert queue response" subtitle="Result currently used by the dashboard">
          <StateView loading={alerts.loading && !alerts.data} error={alerts.error}>
            <div className="complexity-list"><div><span>Threshold</span><b>{alerts.data ? `$${Number(alerts.data.threshold).toLocaleString()}` : "—"}</b></div><div><span>Alert rows</span><b>{alerts.data?.count ?? "—"}</b></div><div><span>Queue engine</span><b>{alerts.data?.engine || "—"}</b></div></div>
          </StateView>
        </Panel>
      </div>
      <div className="settings-bottom"><span>Preferences do not change transaction data or backend fraud rules.</span><button className="button button-quiet" type="button" onClick={refreshAll}>Refresh backend status</button></div>
    </div>
  );
}
