(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const state = { sortBy: "timestamp", order: "desc", transactions: [], alerts: [], charts: {} };
  let searchTimer;
  let toastTimer;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function showError(message, serviceFailure = false) {
    const banner = $("#error-banner");
    banner.textContent = message;
    banner.hidden = !message;
    $(".system-status span:last-child").textContent = serviceFailure ? "Service attention" : "System operational";
    $(".status-dot").classList.toggle("problem", serviceFailure);
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
  }

  async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`The server returned an unreadable response (${response.status}).`);
    }
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  }

  function queryFromFilters() {
    const params = new URLSearchParams();
    const values = {
      q: $("#table-search").value.trim(),
      status: $("#status-filter").value,
      account_id: $("#account-filter").value.trim(),
      date_from: $("#date-from").value,
      date_to: $("#date-to").value,
      min_amount: $("#min-amount").value,
      max_amount: $("#max-amount").value,
      sort_by: state.sortBy,
      order: state.order
    };
    Object.entries(values).forEach(([key, value]) => {
      if (value !== "") params.set(key, value);
    });
    return params.toString();
  }

  async function loadTransactions() {
    const body = $("#transaction-rows");
    body.innerHTML = '<tr><td colspan="6"><div class="loading-state"><span class="spinner"></span> Loading transactions…</div></td></tr>';
    const query = queryFromFilters();
    try {
      const payload = await fetchJson(`/api/transactions${query ? `?${query}` : ""}`);
      state.transactions = payload.transactions;
      renderTransactions(payload.transactions);
      $("#result-count").textContent = String(payload.count);
      $("#table-footer-text").textContent = `Showing ${payload.count} transaction${payload.count === 1 ? "" : "s"}`;
    } catch (error) {
      body.innerHTML = `<tr><td colspan="6"><div class="empty-state">Could not load transactions: ${escapeHtml(error.message)}</div></td></tr>`;
      throw error;
    }
  }

  function formatTimestamp(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("en-US", {
      month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
    });
  }

  function renderTransactions(rows) {
    const body = $("#transaction-rows");
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty-state">No transactions match these filters. Try changing or resetting them.</div></td></tr>';
      return;
    }
    body.innerHTML = rows.map((row) => `
      <tr data-transaction-id="${escapeHtml(row.transaction_id)}" tabindex="0" aria-label="View transaction ${escapeHtml(row.transaction_id)}">
        <td><span class="transaction-id">#${escapeHtml(row.transaction_id)}</span></td>
        <td><div class="account-pair"><strong>${escapeHtml(row.sender_account_id)}</strong><span>→</span>${escapeHtml(row.receiver_account_id)}</div></td>
        <td class="amount-cell">${money.format(row.amount)}</td>
        <td>${escapeHtml(row.transaction_type)}</td>
        <td class="date-cell">${escapeHtml(formatTimestamp(row.timestamp))}</td>
        <td><span class="status-badge status-${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td>
      </tr>`).join("");
    body.querySelectorAll("tr[data-transaction-id]").forEach((rowElement) => {
      const open = () => {
        const transaction = state.transactions.find((item) => String(item.transaction_id) === rowElement.dataset.transactionId);
        if (transaction) openDetails(transaction);
      };
      rowElement.addEventListener("click", open);
      rowElement.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }

  async function loadStats() {
    const stats = await fetchJson("/api/stats");
    $("#stat-total").textContent = stats.total_transactions.toLocaleString("en-US");
    $("#stat-value").textContent = money.format(stats.total_value);
    $("#stat-flagged").textContent = stats.flagged_transactions.toLocaleString("en-US");
    $("#stat-failed").textContent = stats.failed_transactions.toLocaleString("en-US");
    renderCharts(stats.volume_by_day);
  }

  function renderCharts(days) {
    if (typeof Chart === "undefined") {
      if (!document.querySelector(".chart-fallback")) {
        $("#volume-chart").insertAdjacentHTML("afterend", '<p class="chart-fallback">Chart library could not be loaded. Transaction data is still available below.</p>');
      }
      return;
    }
    const labels = days.map((item) => new Date(`${item.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    const common = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#172437", titleColor: "#e9eff8", bodyColor: "#aebbd0", borderColor: "#2b3c53", borderWidth: 1 } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#7d8ca0", font: { size: 9 } }, border: { display: false } },
        y: { beginAtZero: true, grid: { color: "#233044" }, ticks: { color: "#7d8ca0", font: { size: 9 }, precision: 0 }, border: { display: false } }
      }
    };
    if (state.charts.volume) state.charts.volume.destroy();
    if (state.charts.amount) state.charts.amount.destroy();
    state.charts.volume = new Chart($("#volume-chart"), {
      type: "bar", data: { labels, datasets: [{ data: days.map((item) => item.count), backgroundColor: "#4389ed", borderRadius: 4, maxBarThickness: 38 }] }, options: common
    });
    state.charts.amount = new Chart($("#amount-chart"), {
      type: "line", data: { labels, datasets: [{ data: days.map((item) => item.amount), borderColor: "#49caa0", backgroundColor: "#49caa01a", fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: "#49caa0" }] },
      options: { ...common, scales: { ...common.scales, y: { ...common.scales.y, ticks: { ...common.scales.y.ticks, callback: (value) => `$${Number(value).toLocaleString("en-US")}` } } } }
    });
  }

  async function loadAlerts() {
    try {
      const payload = await fetchJson("/api/alerts");
      state.alerts = payload.alerts;
      $("#alert-count").textContent = String(payload.count);
      $("#nav-alert-count").textContent = String(payload.count);
      $("#queue-engine").textContent = `${payload.engine} · ${money.format(payload.threshold)} high-value threshold`;
      renderAlerts(payload.alerts);
    } catch (error) {
      $("#alert-list").innerHTML = `<div class="empty-state">Could not load review queue: ${escapeHtml(error.message)}</div>`;
      throw error;
    }
  }

  function renderAlerts(alerts) {
    const container = $("#alert-list");
    if (!alerts.length) {
      container.innerHTML = '<div class="empty-state">No review patterns detected.</div>';
      return;
    }
    container.innerHTML = alerts.slice(-8).reverse().map((alert) => `
      <article class="alert-item">
        <span class="severity-mark severity-${escapeHtml(alert.severity)}"></span>
        <div class="alert-copy">
          <strong>Transaction #${escapeHtml(alert.transaction_id)} · ${escapeHtml(alert.account_id)}</strong>
          <p>${escapeHtml(alert.reason)}</p>
          <div class="alert-meta">${escapeHtml(formatTimestamp(alert.timestamp))}</div>
        </div>
        <span class="severity-label ${escapeHtml(alert.severity)}">${escapeHtml(alert.severity)}</span>
      </article>`).join("");
  }

  function openDetails(transaction) {
    const fields = [
      ["Transaction ID", `#${transaction.transaction_id}`],
      ["Status", transaction.status],
      ["Sender account", transaction.sender_account_id],
      ["Receiver account", transaction.receiver_account_id],
      ["Amount", money.format(transaction.amount)],
      ["Transaction type", transaction.transaction_type],
      ["Date and time", formatTimestamp(transaction.timestamp)]
    ];
    const matchedAlerts = state.alerts.filter((alert) => alert.transaction_id === transaction.transaction_id);
    $("#detail-content").innerHTML = `
      <div class="detail-grid">${fields.map(([label, value]) => `<div class="detail-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>
      <div class="detail-alerts"><h3>Pattern review</h3>${matchedAlerts.length
        ? matchedAlerts.map((alert) => `<p><strong>${escapeHtml(alert.severity.toUpperCase())}:</strong> ${escapeHtml(alert.reason)}</p>`).join("")
        : '<p>No configured review patterns matched this transaction. This does not establish that a transaction is safe.</p>'}</div>`;
    $("#detail-backdrop").hidden = false;
    $("#close-detail").focus();
  }

  async function refreshDashboard() {
    showError("");
    const results = await Promise.allSettled([loadStats(), loadTransactions(), loadAlerts()]);
    const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason.message);
    if (errors.length) showError(errors.join(" "), true);
    return errors.length === 0;
  }

  function applyFilters() {
    showError("");
    loadTransactions().catch((error) => showError(error.message));
  }

  function resetFilters() {
    $("#filter-form").reset();
    $("#global-search").value = "";
    state.sortBy = "timestamp";
    state.order = "desc";
    applyFilters();
    showToast("Filters reset.");
  }

  async function runAlgorithmSearch() {
    const query = $("#algorithm-query").value.trim();
    const resultBox = $("#algorithm-result");
    if (!query) {
      resultBox.textContent = "Enter a transaction ID or sender account to search.";
      $("#algorithm-query").focus();
      return;
    }
    resultBox.textContent = "Running search…";
    const params = new URLSearchParams({
      mode: $("#algorithm-mode").value,
      field: $("#algorithm-field").value,
      q: query
    });
    try {
      const result = await fetchJson(`/api/algorithms/search?${params}`);
      resultBox.innerHTML = result.found
        ? `<strong>Found #${escapeHtml(result.transaction.transaction_id)}</strong> · ${escapeHtml(result.transaction.sender_account_id)} → ${escapeHtml(result.transaction.receiver_account_id)} · ${money.format(result.transaction.amount)} · ${escapeHtml(result.engine)} ${escapeHtml(result.algorithm)}`
        : `No matching transaction. Executed ${escapeHtml(result.engine)} ${escapeHtml(result.algorithm)}.`;
    } catch (error) {
      resultBox.textContent = error.message;
    }
  }

  async function runAlgorithmSort() {
    const resultBox = $("#algorithm-result");
    const params = new URLSearchParams({ by: $("#algorithm-sort-key").value, order: $("#algorithm-sort-order").value });
    resultBox.textContent = "Sorting records…";
    try {
      const result = await fetchJson(`/api/algorithms/sort?${params}`);
      const first = result.transactions[0];
      const firstValue = first
        ? (params.get("by") === "amount" ? money.format(first.amount) : `#${first.transaction_id}`)
        : "no records";
      resultBox.innerHTML = `<strong>Sorted ${result.count} records</strong> using ${escapeHtml(result.engine)}. First record: ${escapeHtml(firstValue)}.`;
      showToast(`Merge sort completed (${result.engine}).`);
    } catch (error) {
      resultBox.textContent = error.message;
    }
  }

  async function showAlgorithmStatus() {
    try {
      const status = await fetchJson("/api/algorithms/status");
      $("#algorithm-result").textContent = status.c_available
        ? `C executable detected (${status.executable}). Sort, search, and FIFO queue operations use the C implementation.`
        : status.fallback;
    } catch (error) {
      $("#algorithm-result").textContent = error.message;
    }
  }

  $("#filter-form").addEventListener("submit", (event) => {
    event.preventDefault();
    applyFilters();
  });
  $("#reset-filters").addEventListener("click", resetFilters);
  $("#refresh-button").addEventListener("click", async () => {
    const button = $("#refresh-button");
    button.disabled = true;
    button.querySelector(".refresh-icon").textContent = "…";
    const refreshed = await refreshDashboard();
    button.disabled = false;
    button.querySelector(".refresh-icon").textContent = "↻";
    if (refreshed) showToast("Dashboard data refreshed.");
  });
  $("#table-search").addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(applyFilters, 250);
  });
  $("#global-search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      $("#table-search").value = $("#global-search").value;
      document.querySelector("#transactions").scrollIntoView({ behavior: "smooth" });
      applyFilters();
    }
  });
  $("#global-search").addEventListener("input", () => {
    if (!$("#global-search").value) {
      $("#table-search").value = "";
      applyFilters();
    }
  });
  document.querySelectorAll(".sort-button").forEach((button) => {
    button.addEventListener("click", () => {
      const sortKey = button.dataset.sort;
      state.order = state.sortBy === sortKey && state.order === "asc" ? "desc" : "asc";
      state.sortBy = sortKey;
      applyFilters();
    });
  });
  $("#algorithm-search").addEventListener("click", runAlgorithmSearch);
  $("#algorithm-query").addEventListener("keydown", (event) => {
    if (event.key === "Enter") runAlgorithmSearch();
  });
  $("#algorithm-sort").addEventListener("click", runAlgorithmSort);
  $("#about-button").addEventListener("click", () => showToast("Northstar is an academic demo using synthetic transaction records."));
  $("#close-detail").addEventListener("click", () => { $("#detail-backdrop").hidden = true; });
  $("#detail-backdrop").addEventListener("click", (event) => {
    if (event.target === $("#detail-backdrop")) $("#detail-backdrop").hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") $("#detail-backdrop").hidden = true;
  });
  document.querySelectorAll(".nav-item").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      link.classList.add("active");
    });
  });

  refreshDashboard();
  showAlgorithmStatus();
})();