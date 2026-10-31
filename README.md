# Bank Transaction Monitoring System

An intermediate-level university demonstration that searches synthetic bank-like transactions, sorts records, highlights unusual patterns, and presents the results in a Flask dashboard. **This is not a real banking or fraud-detection system.** Every alert is a review signal, not a finding of fraud.

## Overview

- A Flask REST API serves one JSON dataset to the dashboard, alert queue, charts, and DSA tools.
- A separate C program implements transaction searches, merge sort, and a FIFO alert queue.
- Python provides matching search/sort logic when the C program is not compiled. When the compiled C executable is present beside `app.py`, selected API operations use it.
- The dashboard includes summary metrics, charts, transaction filters, a transaction detail dialog, alert reasons/severity, and interactive algorithm controls.

## Technologies

- C11: arrays, `struct`, merge sort, linear/binary search, and a circular FIFO queue.
- Python 3.10 or newer: sample data loading, rule-based review patterns, API filtering, and C process integration.
- Flask: dashboard route and JSON API.
- HTML, CSS, JavaScript, and Chart.js: responsive dashboard.
- JSON: synthetic transaction records in `data/transactions.json`.

## Folder structure

```text
Dsa project 3sem/
|-- app.py
|-- bank_monitor.c
|-- bank_monitor.exe          # created by the compile command; do not commit if not needed
|-- data/
|   `-- transactions.json
|-- templates/
|   `-- index.html
|-- static/
|   |-- style.css
|   `-- script.js
|-- frontend/                 # React + Vite dashboard, served by Flask at /
`-- README.md
```

## DSA implementation and complexity

| Concept | Where it is used | Best | Average | Worst |
|---|---|---:|---:|---:|
| Linear search | C `linear-*` operations; Python fallback; scans records until a match | O(1) | O(n) | O(n) |
| Binary search | C `binary-transaction_id` and Python fallback; records are sorted by ID first | O(1) | O(log n) | O(log n) after sort |
| Merge sort | C `sort-*` operations and Python fallback; stable divide/merge sort | O(n log n) | O(n log n) | O(n log n) |
| Circular FIFO queue | C `queue` operation orders pending alert records | O(1) enqueue/dequeue | O(1) | O(1) |
| Time-window analysis | Python alert rules check recent activity by account/recipient | O(n log n) overall | O(n log n) overall | O(n log n) overall |
| Arrays and structures | C stores transaction records in a bounded `Transaction` array | — | — | — |

`n` is the number of transactions. Binary search takes O(log n) once the data is sorted; sorting first costs O(n log n), so a one-off binary lookup including preparation is O(n log n). The current bounded sample has 512-record capacity in the C command-line program. The Python API's time-window checks are intended for small demonstration data, not large production streams.

## Review-pattern rules

The rules are explicit demonstration heuristics in `app.py` and can be adjusted there:

1. **High value:** a transaction at or above `$10,000` is marked high severity.
2. **Rapid activity:** three transactions from one sender in a ten-minute window are marked high severity.
3. **Repeated recipient:** three transfers from a sender to the same recipient in 24 hours are marked medium severity.
4. **Failed/declined:** the transaction is marked medium severity.
5. **Sudden amount change:** a transaction at least four times the sender's immediately previous transfer, with a minimum amount of `$3,000`, is marked medium severity.

Each alert includes an alert ID, associated transaction ID, sender account, reason, severity, timestamp, and status. Rules may overlap, so one transaction can produce more than one alert. Alerts are patterns requiring review; they do not establish intent, loss, or fraud.

## Windows setup

Run these commands in the VS Code integrated **PowerShell** terminal from the project folder. If PowerShell is unavailable, choose **Terminal → New Terminal** in VS Code and select PowerShell, Command Prompt, or another shell, adjusting activation syntax as needed.

### Check installed tools manually

```powershell
python --version
py --list
python -m pip --version
Get-Command python, py, pip, gcc, clang, cl -ErrorAction SilentlyContinue
```

In this workspace, the selected virtual environment reports Python 3.14.8, Flask was installed into that environment, and GCC was found at `C:\MinGW\bin\gcc.EXE`. The C source compiled and its CLI/API integration checks passed during implementation. A separate VS Code terminal can have a different `PATH`; use the commands above to check your own terminal. Python 3.10+ is required; use Python 3.14 if installed.

### Create an environment and install Flask

```powershell
Set-Location "C:\Users\DELL\OneDrive\Documents\Dsa project 3sem"
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install Flask
```

If `py -3.14` is unavailable but `python --version` shows Python 3.10+, use `python -m venv .venv` instead. If PowerShell blocks venv activation, run the venv's interpreter directly:

```powershell
.\.venv\Scripts\python.exe -m pip install Flask
.\.venv\Scripts\python.exe app.py
```

### Compile and run the C program

Check whether a compiler is installed with the commands above. GCC, Clang, or the Visual C compiler can build the standalone C source. With GCC or Clang:

```powershell
gcc -std=c11 -Wall -Wextra -Wpedantic -O2 bank_monitor.c -o bank_monitor.exe
```

With Visual Studio C++ Build Tools available in a developer command prompt:

```powershell
cl /nologo /W4 /O2 bank_monitor.c /Fe:bank_monitor.exe
```

The CLI reads pipe-delimited records from standard input. Try a small standalone merge-sort example:

```powershell
@(
  "101|AC-1|AC-9|25.00|2026-10-11T10:00:00|completed|transfer"
  "102|AC-2|AC-8|250.00|2026-10-11T10:01:00|failed|purchase"
) | .\bank_monitor.exe sort-amount desc
```

Available C operations:

```text
linear-transaction_id <id>
linear-sender_account_id <account>
binary-transaction_id <id>
binary-sender_account_id <account>
sort-amount asc|desc
sort-transaction_id asc|desc
queue
```

The queue accepts one pipe-delimited alert per line and writes those lines back in FIFO order. The Flask app discovers `bank_monitor.exe` beside `app.py`; no machine-specific executable path is embedded in the code. The C search/sort and alert queue endpoints use the executable when present. Otherwise, the Python fallback is used for the same dashboard operations.

### Launch Flask

```powershell
python app.py
```

Open `http://127.0.0.1:5000` in a browser. Stop the development server with Ctrl+C. Flask's debug server is for local development only.

## React dashboard

The React/Vite dashboard is the default application served by Flask at `/`. The original Flask-rendered dashboard remains available at `/legacy`; all existing API endpoints remain under `/api`.

### Development

Use two terminals from the project folder. Start Flask in the first:

```powershell
python app.py
```

In the second terminal, start Vite:

```powershell
Set-Location "frontend"
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` requests to Flask at `http://127.0.0.1:5000`.

### Production build

From `frontend/`, install dependencies if needed and build:

```powershell
npm install
npm run build
```

Then start Flask from the project folder with `python app.py` and open `http://127.0.0.1:5000/`. Flask serves the built React app and its assets at `/assets/`; `/app` remains an alias for the new dashboard, and `/legacy` opens the original dashboard. React Router routes such as `/transactions`, `/analytics`, `/reports`, and `/settings` are served by Flask's frontend fallback, including direct refreshes. API routes take precedence and continue to return Flask JSON responses.

The new dashboard reads the existing transaction API and does not add demo records. It provides transaction CRUD, review-signal inspection, analytics, reports, an account network, and step-based DSA visualizations. Its monitoring refresh is polling, not real-time streaming.

## API

- `GET /api/transactions` — list records; supports `status`, `q`, `account_id`, `date_from`, `date_to`, `min_amount`, `max_amount`, `sort_by`, and `order`.
- `GET /api/alerts` — configured alert queue; accepts optional positive `threshold`.
- `GET /api/stats` — transaction totals and chart-series values.
- `GET /api/search?q=AC-1001` — search records by transaction ID, sender/recipient account, type, or status.
- `GET /api/algorithms/search?mode=binary&field=transaction_id&q=1017` — run linear/binary search.
- `GET /api/algorithms/sort?by=amount&order=desc` — run merge sort.
- `GET /api/algorithms/status` — report whether the C executable is available.

Invalid filters return HTTP 400 with a JSON error. Data-file problems are logged by Flask and return HTTP 500.

## Sample checks and expected behavior

- `GET /api/transactions?status=failed` returns transaction `1008`.
- `GET /api/transactions?sort_by=amount&order=desc` places transaction `1017` (`$12,500`) first.
- `GET /api/algorithms/search?mode=binary&field=transaction_id&q=1017` finds transaction `1017`.
- `GET /api/algorithms/search?mode=linear&field=sender_account_id&q=AC-1020` finds a transaction from account `AC-1020`.
- `GET /api/alerts` includes the `$12,500` high-value transfer, rapid activity for `AC-1020` and `AC-1030`, repeated-recipient transfers for `AC-1020`, plus failed/declined attempts.
- In the UI, select a table row to see transaction details and any associated alert explanations. Reset filters restores the full transaction list.

## Validation notes

Run in the project folder after setup:

```powershell
python -m py_compile app.py
python app.py
```

While Flask is running, use another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:5000/api/stats
Invoke-RestMethod "http://127.0.0.1:5000/api/transactions?status=failed"
Invoke-RestMethod "http://127.0.0.1:5000/api/algorithms/search?mode=binary&field=transaction_id&q=1017"
```

The legacy dashboard at `/legacy` uses Chart.js. The React dashboard uses its bundled chart dependencies and does not rely on a chart CDN.

## Limitations and future work

- Synthetic records and simple fixed heuristics only; no real bank feeds, identity data, or production fraud model.
- The C process integration uses a documented local pipe-delimited protocol to avoid a third-party JSON parser dependency. Alert explanations are constructed in Python and their ordering can be passed through the C FIFO queue.
- Data is loaded from a local JSON file on each API request; there is no database, authentication, authorization, audit log, or user-specific access control.
- For a larger project, add persistence and migrations, configurable rule profiles, stronger tests, role-based access, privacy controls, streaming/risk scoring, and accessibility/usability review.
