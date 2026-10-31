import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleHelp, FastForward, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { api } from "../api/client.js";
import { useDashboard } from "../context/DashboardContext.jsx";
import { binarySearchSteps, collectGenerator, linearSearchSteps, mergeSortSteps } from "../dsa/generators.js";
import { formatMoney, PageTitle, Panel, StateView } from "../components/common.jsx";

const INITIAL_SPEED = 450;

function complexityFor(algorithm) {
  if (algorithm === "linear") return { best: "O(1)", average: "O(n)", worst: "O(n)", space: "O(1)" };
  if (algorithm === "binary") return { best: "O(1)", average: "O(log n)", worst: "O(log n)", space: "O(1)" };
  return { best: "O(n log n)", average: "O(n log n)", worst: "O(n log n)", space: "O(n)" };
}

export default function DsaVisualizer() {
  const { transactions, alerts } = useDashboard();
  const [algorithm, setAlgorithm] = useState("linear");
  const [target, setTarget] = useState("");
  const [sortBy, setSortBy] = useState("amount");
  const [order, setOrder] = useState("asc");
  const [windowSize, setWindowSize] = useState(16);
  const [speed, setSpeed] = useState(INITIAL_SPEED);
  const [steps, setSteps] = useState([]);
  const [stepIndex, setStepIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [inputError, setInputError] = useState("");
  const [crossCheck, setCrossCheck] = useState(null);
  const [crossCheckLoading, setCrossCheckLoading] = useState(false);
  const runId = useRef(0);
  const checkedRun = useRef(0);
  const records = transactions.data?.transactions || [];
  const baseWindow = useMemo(() => records.slice(0, windowSize), [records, windowSize]);
  const sortRows = useMemo(() => {
    if (algorithm !== "binary") return baseWindow;
    return [...baseWindow].sort((a, b) => a.transaction_id - b.transaction_id);
  }, [algorithm, baseWindow]);
  const currentStep = steps[stepIndex] || null;
  const complexity = complexityFor(algorithm);
  const isSort = algorithm === "sort";

  function prepareSteps() {
    setInputError("");
    setCrossCheck(null);
    if (!isSort && !/^\d+$/.test(target.trim())) {
      setInputError("Enter a whole-number transaction ID.");
      return false;
    }
    if (!isSort && Number(target) > 2_147_483_647) {
      setInputError("Transaction ID must be between 0 and 2147483647.");
      return false;
    }
    const generator = algorithm === "linear"
      ? linearSearchSteps(baseWindow, target.trim())
      : algorithm === "binary"
        ? binarySearchSteps(sortRows, Number(target))
        : mergeSortSteps(baseWindow, sortBy, order);
    const generated = collectGenerator(generator);
    setSteps(generated);
    setStepIndex(-1);
    setCrossCheck(null);
    runId.current += 1;
    checkedRun.current = 0;
    return true;
  }

  function start() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (stepIndex < 0 || !steps.length || stepIndex >= steps.length - 1) {
      if (!prepareSteps()) return;
    }
    setPlaying(true);
  }

  function stepOnce() {
    setPlaying(false);
    if (stepIndex < 0 || !steps.length) {
      if (!prepareSteps()) return;
      setStepIndex(0);
    } else {
      setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    }
  }

  function reset() {
    setPlaying(false);
    setSteps([]);
    setStepIndex(-1);
    setCrossCheck(null);
    setInputError("");
  }

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    }, speed);
    return () => window.clearInterval(timer);
  }, [playing, speed, steps.length]);

  useEffect(() => {
    if (playing && steps.length && stepIndex >= steps.length - 1) setPlaying(false);
  }, [playing, stepIndex, steps.length]);

  useEffect(() => {
    if (!steps.length || playing || stepIndex < steps.length - 1 || checkedRun.current === runId.current) return;
    const final = steps[steps.length - 1];
    if (final.type !== "found" && final.type !== "not-found" && final.type !== "complete") return;
    checkedRun.current = runId.current;
    let active = true;
    setCrossCheckLoading(true);
    async function verify() {
      try {
        if (algorithm === "sort") {
          const response = await api.algorithmSort(sortBy, order);
          const visibleIds = new Set(baseWindow.map((row) => row.transaction_id));
          const backendIds = response.transactions.filter((row) => visibleIds.has(row.transaction_id)).map((row) => row.transaction_id);
          const browserIds = final.rows.map((row) => row.transaction_id);
          const matches = browserIds.length === backendIds.length && browserIds.every((id, index) => id === backendIds[index]);
          if (active) setCrossCheck({ matches, engine: response.engine, message: matches ? "Browser order matches backend for the selected window." : "Browser and backend order differ." });
        } else {
          const response = await api.algorithmSearch(algorithm, "transaction_id", target.trim());
          const browserFound = final.type === "found";
          const browserId = browserFound ? final.value.transaction_id : null;
          const outsideWindow = response.found && !baseWindow.some((row) => row.transaction_id === response.transaction.transaction_id);
          const matches = outsideWindow || (browserFound === response.found && (!browserFound || browserId === response.transaction.transaction_id));
          if (active) setCrossCheck({
            matches,
            engine: response.engine,
            message: outsideWindow
              ? `Backend found #${response.transaction.transaction_id} outside the first ${baseWindow.length} visualized records.`
              : matches ? "Browser result matches backend." : "Browser result differs from backend.",
          });
        }
      } catch (error) {
        if (active) setCrossCheck({ matches: false, engine: "Unavailable", message: error.message });
      } finally {
        if (active) setCrossCheckLoading(false);
      }
    }
    verify();
    return () => { active = false; };
  }, [steps, playing, stepIndex, algorithm, sortBy, order, baseWindow, target]);

  const compared = currentStep?.comparisons ?? 0;
  const activeIndices = new Set(
    currentStep?.type === "comparison"
      ? algorithm === "binary" ? [currentStep.low, currentStep.mid, currentStep.high] : [currentStep.index, currentStep.leftIndex, currentStep.rightIndex]
      : currentStep?.type === "found" ? [currentStep.index ?? currentStep.mid] : [],
  );
  const displayedRows = isSort && currentStep?.type === "complete" ? currentStep.rows : sortRows;
  const completionLabel = currentStep?.type === "found"
    ? `Found transaction #${currentStep.value.transaction_id}`
    : currentStep?.type === "not-found"
      ? "Transaction ID not found in the visualized window"
      : currentStep?.type === "complete"
        ? `Sorted ${currentStep.rows.length} records`
        : "";

  return (
    <div className="page-wrap">
      <PageTitle eyebrow="ALGORITHM LAB" title="DSA Visualizer" description="Step through the real search and merge-sort procedures using records fetched from the Flask API." />
      <div className="dsa-note"><CircleHelp size={15} /> Visualized window: first {windowSize} API records at most. Binary search first uses a labeled, locally sorted copy.</div>
      <div className="dsa-layout">
        <section className="dsa-main">
          <Panel title="Algorithm controls" subtitle="Each player step corresponds to one generator event.">
            <div className="dsa-controls">
              <label className="form-field"><span>Algorithm</span><select value={algorithm} onChange={(event) => { setAlgorithm(event.target.value); reset(); }}><option value="linear">Linear Search</option><option value="binary">Binary Search</option><option value="sort">Merge Sort</option></select></label>
              {isSort ? (
                <>
                  <label className="form-field"><span>Sort by</span><select value={sortBy} onChange={(event) => { setSortBy(event.target.value); reset(); }}><option value="amount">Amount</option><option value="transaction_id">Transaction ID</option></select></label>
                  <label className="form-field"><span>Order</span><select value={order} onChange={(event) => { setOrder(event.target.value); reset(); }}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
                </>
              ) : (
                <label className="form-field"><span>Transaction ID</span><input inputMode="numeric" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="e.g. 1001" /></label>
              )}
              <label className="form-field"><span>Window size</span><select value={windowSize} onChange={(event) => { setWindowSize(Number(event.target.value)); reset(); }}><option value={8}>8 records</option><option value={16}>16 records</option><option value={24}>24 records</option></select></label>
            </div>
            <div className="player-controls">
              <button className="button button-primary" type="button" onClick={start}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? "Pause" : steps.length && stepIndex < steps.length - 1 ? "Resume" : "Start"}</button>
              <button className="button button-secondary" type="button" onClick={stepOnce}><SkipForward size={15} /> Step</button>
              <button className="button button-quiet" type="button" onClick={reset}><RotateCcw size={14} /> Reset</button>
              <label className="speed-control"><FastForward size={14} /><span>Speed</span><input aria-label="Animation speed" type="range" min="100" max="1200" step="50" value={1300 - speed} onChange={(event) => setSpeed(1300 - Number(event.target.value))} /><small>{speed} ms</small></label>
            </div>
            {inputError ? <p className="form-error" role="alert">{inputError}</p> : null}
          </Panel>
          <Panel title={isSort ? "Merge sort trace" : algorithm === "binary" ? "Binary search trace" : "Linear search trace"} subtitle={algorithm === "binary" ? "Sorted copy by transaction_id · left / mid / right pointers" : "API order is preserved for linear search."} className="algorithm-panel">
            <StateView loading={transactions.loading && !transactions.data} error={transactions.error} empty={!records.length} emptyText="There are no transaction records to visualize.">
              <div className="algorithm-summary">
                <div><small>Step</small><strong>{Math.max(0, stepIndex + 1)} / {steps.length || "—"}</strong></div>
                <div><small>Comparisons</small><strong>{compared}</strong></div>
                <div><small>Current operation</small><strong>{currentStep?.type || "Ready"}</strong></div>
                {currentStep && algorithm === "binary" ? <div><small>Range</small><strong>L {currentStep.low ?? "—"} · M {currentStep.mid ?? "—"} · R {currentStep.high ?? "—"}</strong></div> : null}
              </div>
              {completionLabel ? <div className={`result-banner ${currentStep?.type === "not-found" ? "result-warning" : ""}`}>{currentStep?.type === "found" || currentStep?.type === "complete" ? <CheckCircle2 size={15} /> : null}{completionLabel}</div> : null}
              {crossCheckLoading ? <div className="muted cross-check">Checking result against the backend…</div> : crossCheck ? <div className={`cross-check ${crossCheck.matches ? "cross-check-match" : "cross-check-mismatch"}`}><span>{crossCheck.matches ? "Matches backend" : "Backend comparison"}</span><small>{crossCheck.engine} · {crossCheck.message}</small></div> : null}
              <div className="algorithm-array">
                {displayedRows.map((row, index) => {
                  const pointed = activeIndices.has(index) || (algorithm === "binary" && currentStep?.mid === index);
                  const found = currentStep?.type === "found" && (currentStep.index === index || currentStep.mid === index);
                  const barHeight = Math.max(12, Math.min(120, (Number(row.amount) / Math.max(1, ...displayedRows.map((item) => Number(item.amount))) * 120)));
                  return (
                    <div className={`algorithm-item ${pointed ? "is-current" : ""} ${found ? "is-found" : ""}`} key={`${row.transaction_id}-${index}`}>
                      <div className="algorithm-bar" style={{ height: `${barHeight}px` }} title={formatMoney(row.amount)} />
                      <small>#{row.transaction_id}</small>
                      <b>{isSort ? formatMoney(row[sortBy]) : formatMoney(row.amount)}</b>
                      {algorithm === "binary" && currentStep?.type === "comparison" ? <i>{currentStep.low === index ? "L" : ""}{currentStep.mid === index ? "M" : ""}{currentStep.high === index ? "R" : ""}</i> : null}
                    </div>
                  );
                })}
              </div>
              <div className="algorithm-step-list">
                {steps.slice(0, Math.max(0, stepIndex + 1)).slice(-4).map((step, index) => (
                  <div key={`${step.type}-${index}`}><span>{step.type}</span><small>{step.type === "comparison" ? `Comparison ${step.comparisons}` : step.type === "split" ? `Split [${step.start}, ${step.end})` : step.type === "merge" ? `Merged ${step.end - step.start} values` : step.type}</small></div>
                ))}
              </div>
            </StateView>
          </Panel>
        </section>
        <aside className="dsa-aside">
          <Panel title="Complexity" subtitle="Asymptotic algorithm costs">
            <div className="complexity-list"><div><span>Best case</span><b>{complexity.best}</b></div><div><span>Average case</span><b>{complexity.average}</b></div><div><span>Worst case</span><b>{complexity.worst}</b></div><div><span>Auxiliary space</span><b>{complexity.space}</b></div></div>
            {algorithm === "sort" ? <p className="muted small-note">Merge sort is stable: records with equal keys keep their original relative order.</p> : algorithm === "binary" ? <p className="muted small-note">The one-time local sort is shown separately from the O(log n) search.</p> : <p className="muted small-note">Linear search scans records in the order received from the API.</p>}
          </Panel>
          <Panel title="Data provenance" subtitle="No mock transaction records are used.">
            <div className="provenance"><span>Loaded records</span><strong>{records.length}</strong></div>
            <div className="provenance"><span>Visualized records</span><strong>{baseWindow.length}</strong></div>
            <div className="provenance"><span>Search scope</span><strong>Selected window</strong></div>
          </Panel>
          <Panel title="FIFO alert queue" subtitle={`Order provided by ${alerts.data?.engine || (alerts.loading ? "loading" : "unavailable")}`}>
            <QueuePreview />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function QueuePreview() {
  const { alerts } = useDashboard();
  const [dequeued, setDequeued] = useState(0);
  const alertRows = alerts.data?.alerts || [];
  const displayed = alertRows.slice(dequeued);
  return (
    <div className="queue-preview">
      <StateView loading={alerts.loading && !alerts.data} error={alerts.error} empty={!alertRows.length} emptyText="The API returned no alert records.">
        <div className="queue-count"><span>Queue size</span><b>{displayed.length} / {alertRows.length}</b></div>
        <ol>{displayed.slice(0, 5).map((item) => <li key={item.alert_id}><span>{item.alert_id}</span><small>#{item.transaction_id} · {item.severity}</small></li>)}</ol>
        <button className="button button-quiet full-width" type="button" disabled={!displayed.length} onClick={() => setDequeued((old) => Math.min(old + 1, alertRows.length))}>Dequeue next</button>
      </StateView>
    </div>
  );
}
