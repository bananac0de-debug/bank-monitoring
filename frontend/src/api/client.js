const API_ROOT = "/api";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Backend unreachable: ${error.message}`
        : "Backend unreachable.",
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The server returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status}).`);
  }
  return payload;
}

function queryString(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

export const api = {
  transactions: (filters = {}) =>
    request(`/transactions${queryString(filters)}`),
  alerts: (threshold) => request(`/alerts${queryString({ threshold })}`),
  stats: () => request("/stats"),
  status: () => request("/algorithms/status"),
  search: (q) => request(`/search${queryString({ q })}`),
  algorithmSearch: (mode, field, q) =>
    request(`/algorithms/search${queryString({ mode, field, q })}`),
  algorithmSort: (by, order) =>
    request(`/algorithms/sort${queryString({ by, order })}`),
  createTransaction: (transaction) =>
    request("/transactions", { method: "POST", body: JSON.stringify(transaction) }),
  updateTransaction: (id, transaction) =>
    request(`/transactions/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(transaction),
    }),
  deleteTransaction: (id) =>
    request(`/transactions/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
