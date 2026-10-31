import { useEffect, useState } from "react";

const KEY = "bank-monitoring-preferences";
const DEFAULTS = {
  threshold: "10000",
  refreshSeconds: 30,
  autoRefresh: false,
  reducedMotion: false,
  demoData: false,
};

function readPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULTS, ...stored };
  } catch {
    return DEFAULTS;
  }
}

export function usePreferences() {
  const [preferences, setPreferences] = useState(readPreferences);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(preferences));
    document.documentElement.dataset.motion = preferences.reducedMotion ? "reduce" : "full";
  }, [preferences]);
  return [preferences, setPreferences];
}
