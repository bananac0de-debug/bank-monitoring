import { createContext, useCallback, useContext } from "react";
import { api } from "../api/client.js";
import { useData } from "../hooks/useData.js";
import { usePreferences } from "../hooks/usePreferences.js";

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const [preferences, setPreferences] = usePreferences();
  const transactions = useData(() => api.transactions(), []);
  const stats = useData(() => api.stats(), []);
  const alerts = useData(() => api.alerts(preferences.threshold), [preferences.threshold]);
  const status = useData(() => api.status(), []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      transactions.refetch(),
      stats.refetch(),
      alerts.refetch(),
      status.refetch(),
    ]);
  }, [transactions.refetch, stats.refetch, alerts.refetch, status.refetch]);

  return (
    <DashboardContext.Provider
      value={{ transactions, stats, alerts, status, preferences, setPreferences, refreshAll }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("useDashboard must be used inside DashboardProvider.");
  return value;
}
