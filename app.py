"""Flask API for the synthetic bank transaction monitoring demonstration."""

from __future__ import annotations

import json
import math
import os
import subprocess
import tempfile
import threading
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, redirect, render_template, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "transactions.json"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
ALERT_THRESHOLD = 10_000.00
BURST_WINDOW_MINUTES = 10
BURST_TRANSACTION_COUNT = 3
REPEAT_WINDOW_HOURS = 24
REPEAT_TRANSACTION_COUNT = 3

MAX_RECORDS = 512  # bank_monitor.c rejects inputs above MAX_TRANSACTIONS
VALID_STATUSES = {"completed", "pending", "failed", "declined"}
FIELD_LIMITS = {"sender_account_id": 39, "receiver_account_id": 39, "status": 19, "transaction_type": 39}
DATA_LOCK = threading.Lock()

app = Flask(__name__)


def load_transactions() -> list[dict[str, Any]]:
    """Load the single source of synthetic transactions used by every API."""
    try:
        with DATA_FILE.open(encoding="utf-8") as data_file:
            rows = json.load(data_file)
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Could not load transaction data from {DATA_FILE.name}: {error}") from error

    if not isinstance(rows, list):
        raise RuntimeError("Transaction data must be a JSON array.")
    required = {
        "transaction_id",
        "sender_account_id",
        "receiver_account_id",
        "amount",
        "timestamp",
        "status",
        "transaction_type",
    }
    for row in rows:
        if not isinstance(row, dict) or not required.issubset(row):
            raise RuntimeError("A transaction record is missing one or more required fields.")
    return rows


def parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value)


def merge_sort(rows: list[dict[str, Any]], key: str, descending: bool = False) -> list[dict[str, Any]]:
    """Stable merge sort: O(n log n) time and O(n) auxiliary space."""
    if len(rows) < 2:
        return rows.copy()
    middle = len(rows) // 2
    left = merge_sort(rows[:middle], key, descending)
    right = merge_sort(rows[middle:], key, descending)
    merged: list[dict[str, Any]] = []
    left_index = right_index = 0
    while left_index < len(left) and right_index < len(right):
        left_value = left[left_index][key]
        right_value = right[right_index][key]
        take_left = left_value >= right_value if descending else left_value <= right_value
        if take_left:
            merged.append(left[left_index])
            left_index += 1
        else:
            merged.append(right[right_index])
            right_index += 1
    return merged + left[left_index:] + right[right_index:]


def linear_search(rows: list[dict[str, Any]], key: str, needle: str) -> dict[str, Any] | None:
    for row in rows:
        if str(row[key]).casefold() == needle.casefold():
            return row
    return None


def binary_search(rows: list[dict[str, Any]], key: str, needle: str) -> dict[str, Any] | None:
    ordered = merge_sort(rows, key)
    low, high = 0, len(ordered) - 1
    target: Any = needle
    if key == "transaction_id":
        target = int(needle)
    while low <= high:
        middle = (low + high) // 2
        value = ordered[middle][key]
        if value == target:
            return ordered[middle]
        if value < target:
            low = middle + 1
        else:
            high = middle - 1
    return None


def build_alerts(rows: list[dict[str, Any]], threshold: float = ALERT_THRESHOLD) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []

    def add(row: dict[str, Any], reason: str, severity: str) -> None:
        alerts.append(
            {
                "alert_id": f"A-{row['transaction_id']}-{len(alerts) + 1}",
                "transaction_id": row["transaction_id"],
                "account_id": row["sender_account_id"],
                "reason": reason,
                "severity": severity,
                "timestamp": row["timestamp"],
                "status": row["status"],
            }
        )

    chronological = merge_sort(rows, "timestamp")
    for row in chronological:
        if row["amount"] >= threshold:
            add(row, f"High-value transfer of ${row['amount']:,.2f} (threshold ${threshold:,.2f}).", "high")
        if row["status"] in {"failed", "declined"}:
            add(row, f"Transaction was {row['status']}. Review the attempt and account activity.", "medium")

    by_sender: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_recipient: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in chronological:
        by_sender[row["sender_account_id"]].append(row)
        by_recipient[(row["sender_account_id"], row["receiver_account_id"])].append(row)

    burst_window = timedelta(minutes=BURST_WINDOW_MINUTES)
    for account_id, account_rows in by_sender.items():
        for index, row in enumerate(account_rows):
            start = parse_timestamp(row["timestamp"])
            recent = [
                item
                for item in account_rows[max(0, index - BURST_TRANSACTION_COUNT + 1) : index + 1]
                if start - parse_timestamp(item["timestamp"]) <= burst_window
            ]
            if len(recent) >= BURST_TRANSACTION_COUNT:
                add(
                    row,
                    f"{len(recent)} transactions from {account_id} within {BURST_WINDOW_MINUTES} minutes.",
                    "high",
                )

        for index, row in enumerate(account_rows[1:], start=1):
            previous = account_rows[index - 1]
            if previous["amount"] >= 500 and row["amount"] >= 4 * previous["amount"] and row["amount"] >= 3_000:
                add(
                    row,
                    f"Amount ${row['amount']:,.2f} is at least 4x the account's prior ${previous['amount']:,.2f} transfer.",
                    "medium",
                )

    repeat_window = timedelta(hours=REPEAT_WINDOW_HOURS)
    for (sender, recipient), repeated_rows in by_recipient.items():
        for index, row in enumerate(repeated_rows):
            current = parse_timestamp(row["timestamp"])
            recent = [
                item
                for item in repeated_rows[max(0, index - REPEAT_TRANSACTION_COUNT + 1) : index + 1]
                if current - parse_timestamp(item["timestamp"]) <= repeat_window
            ]
            if len(recent) >= REPEAT_TRANSACTION_COUNT:
                add(
                    row,
                    f"Repeated transfers from {sender} to {recipient} within {REPEAT_WINDOW_HOURS} hours.",
                    "medium",
                )
    return alerts


def get_c_executable() -> Path | None:
    executable = BASE_DIR / ("bank_monitor.exe" if os.name == "nt" else "bank_monitor")
    return executable if executable.is_file() else None


def to_c_input(rows: list[dict[str, Any]]) -> str:
    return "".join(
        "|".join(
            (
                str(row["transaction_id"]),
                row["sender_account_id"],
                row["receiver_account_id"],
                f"{row['amount']:.2f}",
                row["timestamp"],
                row["status"],
                row["transaction_type"],
            )
        )
        + "\n"
        for row in rows
    )


def run_c_algorithm(arguments: list[str], input_text: str) -> list[str]:
    executable = get_c_executable()
    if executable is None:
        raise FileNotFoundError("C executable is not compiled yet.")
    result = subprocess.run(
        [str(executable), *arguments],
        input=input_text,
        capture_output=True,
        check=True,
        encoding="utf-8",
        timeout=10,
    )
    return [line for line in result.stdout.splitlines() if line]


def parse_c_transaction(line: str) -> dict[str, Any]:
    fields = line.split("|")
    if len(fields) != 7:
        raise ValueError("C algorithm returned a malformed transaction record.")
    return {
        "transaction_id": int(fields[0]),
        "sender_account_id": fields[1],
        "receiver_account_id": fields[2],
        "amount": float(fields[3]),
        "timestamp": fields[4],
        "status": fields[5],
        "transaction_type": fields[6],
    }


def filtered_transactions() -> list[dict[str, Any]]:
    rows = load_transactions()
    status = request.args.get("status", "").strip().lower()
    valid_statuses = {"completed", "pending", "failed", "declined"}
    if status and status not in valid_statuses:
        raise ValueError(f"status must be one of: {', '.join(sorted(valid_statuses))}.")

    account_id = request.args.get("account_id", "").strip()
    query = request.args.get("q", "").strip().casefold()
    date_from = request.args.get("date_from", "").strip()
    date_to = request.args.get("date_to", "").strip()
    min_amount = request.args.get("min_amount", "").strip()
    max_amount = request.args.get("max_amount", "").strip()
    try:
        start_date = date.fromisoformat(date_from) if date_from else None
        end_date = date.fromisoformat(date_to) if date_to else None
        minimum = float(min_amount) if min_amount else None
        maximum = float(max_amount) if max_amount else None
    except ValueError as error:
        raise ValueError("Dates must use YYYY-MM-DD and amount filters must be numbers.") from error
    if (minimum is not None and not math.isfinite(minimum)) or (maximum is not None and not math.isfinite(maximum)):
        raise ValueError("Amount filters must be finite numbers.")
    if minimum is not None and maximum is not None and minimum > maximum:
        raise ValueError("min_amount cannot be greater than max_amount.")
    if start_date and end_date and start_date > end_date:
        raise ValueError("date_from cannot be after date_to.")

    selected = []
    for row in rows:
        transaction_date = parse_timestamp(row["timestamp"]).date()
        searchable = " ".join(
            str(row[key])
            for key in ("transaction_id", "sender_account_id", "receiver_account_id", "transaction_type", "status")
        ).casefold()
        if status and row["status"] != status:
            continue
        if account_id and account_id.casefold() not in {
            row["sender_account_id"].casefold(),
            row["receiver_account_id"].casefold(),
        }:
            continue
        if query and query not in searchable:
            continue
        if start_date and transaction_date < start_date:
            continue
        if end_date and transaction_date > end_date:
            continue
        if minimum is not None and row["amount"] < minimum:
            continue
        if maximum is not None and row["amount"] > maximum:
            continue
        selected.append(row)

    sort_by = request.args.get("sort_by", "timestamp").strip()
    order = request.args.get("order", "desc").strip().lower()
    allowed_sort = {"transaction_id", "amount", "timestamp", "status", "sender_account_id"}
    if sort_by not in allowed_sort:
        raise ValueError(f"sort_by must be one of: {', '.join(sorted(allowed_sort))}.")
    if order not in {"asc", "desc"}:
        raise ValueError("order must be 'asc' or 'desc'.")
    return merge_sort(selected, sort_by, descending=order == "desc")


@app.errorhandler(ValueError)
def handle_bad_request(error: ValueError):
    return jsonify({"error": str(error)}), 400


@app.errorhandler(RuntimeError)
def handle_data_error(error: RuntimeError):
    app.logger.error("%s", error)
    return jsonify({"error": "Transaction data is currently unavailable."}), 500


@app.get("/")
def dashboard():
    return _react_app_file()


@app.get("/legacy")
def legacy_dashboard():
    return render_template("index.html")


def _react_app_file():
    entry = FRONTEND_DIST / "index.html"
    if not entry.is_file():
        return jsonify({"error": "React dashboard is not built. Run npm run build in frontend/."}), 404
    return send_from_directory(FRONTEND_DIST, "index.html")


@app.get("/app")
@app.get("/app/")
def react_dashboard():
    return _react_app_file()


@app.get("/app/assets/<path:filename>")
def react_dashboard_asset(filename: str):
    return send_from_directory(FRONTEND_DIST / "assets", filename)


@app.get("/assets/<path:filename>")
def react_asset(filename: str):
    return send_from_directory(FRONTEND_DIST / "assets", filename)


@app.get("/app/<path:route>")
def react_dashboard_route(route: str):
    target = request.full_path.removeprefix("/app").rstrip("?")
    return redirect(target or "/", code=302)


@app.get("/<path:route>")
def react_dashboard_fallback(route: str):
    if route == "api" or route.startswith("api/"):
        return jsonify({"error": "API endpoint not found."}), 404
    if route == "legacy" or route.startswith("legacy/"):
        return jsonify({"error": "Legacy dashboard route not found."}), 404
    return _react_app_file()


def add_risk(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach a rule-based review score. This is a heuristic, not a fraud verdict."""
    weights = {"high": 40, "medium": 20}
    by_txn: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for alert in build_alerts(load_transactions()):
        by_txn[alert["transaction_id"]].append(alert)
    enriched = []
    for row in rows:
        alerts = by_txn.get(row["transaction_id"], [])
        score = min(100, sum(weights.get(item["severity"], 0) for item in alerts))
        level = "high" if any(item["severity"] == "high" for item in alerts) else "medium" if alerts else "low"
        enriched.append({**row, "risk_score": score, "risk_level": level, "risk_reasons": [item["reason"] for item in alerts]})
    return enriched


def clean_transaction(payload: Any, existing_ids: set[int], current_id: int | None = None) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")
    record: dict[str, Any] = {}
    for key, limit in FIELD_LIMITS.items():
        value = str(payload.get(key, "")).strip()
        if not value:
            raise ValueError(f"{key} is required.")
        if len(value) > limit or "|" in value or "\n" in value:
            raise ValueError(f"{key} must be at most {limit} characters and cannot contain '|'.")
        record[key] = value
    record["status"] = record["status"].lower()
    if record["status"] not in VALID_STATUSES:
        raise ValueError(f"status must be one of: {', '.join(sorted(VALID_STATUSES))}.")
    try:
        amount = float(payload.get("amount"))
    except (TypeError, ValueError) as error:
        raise ValueError("amount must be a number.") from error
    if not math.isfinite(amount) or amount < 0:
        raise ValueError("amount must be a non-negative finite number.")
    record["amount"] = round(amount, 2)
    try:
        stamp = datetime.fromisoformat(str(payload.get("timestamp", "")).strip())
    except ValueError as error:
        raise ValueError("timestamp must be ISO format, e.g. 2026-10-31T14:30:00.") from error
    if stamp.tzinfo is not None:
        raise ValueError("timestamp must not include a timezone offset.")
    record["timestamp"] = stamp.isoformat(timespec="seconds")
    raw_id = payload.get("transaction_id") if current_id is None else current_id
    if raw_id in (None, ""):
        record["transaction_id"] = max(existing_ids, default=1000) + 1
    else:
        try:
            record["transaction_id"] = int(raw_id)
        except (TypeError, ValueError) as error:
            raise ValueError("transaction_id must be a whole number.") from error
        if not 0 <= record["transaction_id"] <= 2_147_483_647:
            raise ValueError("transaction_id must be between 0 and 2147483647.")
        if current_id is None and record["transaction_id"] in existing_ids:
            raise ValueError(f"transaction_id {record['transaction_id']} already exists.")
    return {key: record[key] for key in ("transaction_id", "sender_account_id", "receiver_account_id",
                                          "amount", "timestamp", "status", "transaction_type")}


def save_transactions(rows: list[dict[str, Any]]) -> None:
    """Write atomically so a crash cannot leave a half-written data file."""
    handle, temp_name = tempfile.mkstemp(dir=DATA_FILE.parent, suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as temp_file:
            json.dump(rows, temp_file, indent=2)
        os.replace(temp_name, DATA_FILE)
    except OSError:
        Path(temp_name).unlink(missing_ok=True)
        raise


@app.get("/api/transactions")
def transactions_api():
    rows = add_risk(filtered_transactions())
    return jsonify({"transactions": rows, "count": len(rows)})


@app.post("/api/transactions")
def create_transaction_api():
    with DATA_LOCK:
        rows = load_transactions()
        if len(rows) >= MAX_RECORDS:
            raise ValueError(f"The dataset is limited to {MAX_RECORDS} records (C program capacity).")
        record = clean_transaction(request.get_json(silent=True), {row["transaction_id"] for row in rows})
        rows.append(record)
        save_transactions(rows)
    return jsonify({"transaction": record}), 201


@app.put("/api/transactions/<int:transaction_id>")
def update_transaction_api(transaction_id: int):
    with DATA_LOCK:
        rows = load_transactions()
        index = next((i for i, row in enumerate(rows) if row["transaction_id"] == transaction_id), None)
        if index is None:
            return jsonify({"error": f"Transaction {transaction_id} was not found."}), 404
        rows[index] = clean_transaction(request.get_json(silent=True), set(), current_id=transaction_id)
        save_transactions(rows)
    return jsonify({"transaction": rows[index]})


@app.delete("/api/transactions/<int:transaction_id>")
def delete_transaction_api(transaction_id: int):
    with DATA_LOCK:
        rows = load_transactions()
        remaining = [row for row in rows if row["transaction_id"] != transaction_id]
        if len(remaining) == len(rows):
            return jsonify({"error": f"Transaction {transaction_id} was not found."}), 404
        save_transactions(remaining)
    return jsonify({"deleted": transaction_id})


@app.get("/api/search")
def search_api():
    if not request.args.get("q", "").strip():
        raise ValueError("Provide a non-empty q search value.")
    rows = filtered_transactions()
    return jsonify({"transactions": rows, "count": len(rows)})


@app.get("/api/alerts")
def alerts_api():
    threshold_text = request.args.get("threshold", str(ALERT_THRESHOLD))
    try:
        threshold = float(threshold_text)
    except ValueError as error:
        raise ValueError("threshold must be a number.") from error
    if not math.isfinite(threshold) or threshold <= 0:
        raise ValueError("threshold must be a positive finite number.")
    alerts = build_alerts(load_transactions(), threshold)
    executable = get_c_executable()
    engine = "Python fallback (compile bank_monitor.c to enable the C queue)"
    if executable:
        try:
            queue_input = "".join(
                "|".join(
                    (
                        item["alert_id"],
                        item["account_id"],
                        item["reason"],
                        item["severity"],
                        item["timestamp"],
                        str(item["transaction_id"]),
                    )
                )
                + "\n"
                for item in alerts
            )
            queued_lines = run_c_algorithm(["queue"], queue_input)
            queued_ids = [line.split("|", 1)[0] for line in queued_lines]
            by_id = {item["alert_id"]: item for item in alerts}
            alerts = [by_id[alert_id] for alert_id in queued_ids if alert_id in by_id]
            engine = "C FIFO alert queue"
        except (OSError, subprocess.SubprocessError, ValueError) as error:
            app.logger.exception("C alert queue failed.")
            return jsonify({"error": f"C alert queue failed: {error}"}), 500
    return jsonify({"alerts": alerts, "count": len(alerts), "engine": engine, "threshold": threshold})


@app.get("/api/stats")
def stats_api():
    rows = load_transactions()
    alerts = build_alerts(rows)
    return jsonify(
        {
            "total_transactions": len(rows),
            "total_value": round(sum(row["amount"] for row in rows), 2),
            "flagged_transactions": len({item["transaction_id"] for item in alerts}),
            "failed_transactions": sum(row["status"] in {"failed", "declined"} for row in rows),
            "average_amount": round(sum(row["amount"] for row in rows) / len(rows), 2) if rows else 0,
            "volume_by_day": _volume_by_day(rows),
        }
    )


def _volume_by_day(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, float | int]] = defaultdict(lambda: {"count": 0, "amount": 0.0})
    for row in rows:
        day = row["timestamp"][:10]
        grouped[day]["count"] += 1
        grouped[day]["amount"] += row["amount"]
    return [
        {"date": day, "count": int(values["count"]), "amount": round(float(values["amount"]), 2)}
        for day, values in sorted(grouped.items())
    ]


@app.get("/api/algorithms/status")
def algorithms_status_api():
    executable = get_c_executable()
    return jsonify(
        {
            "c_available": executable is not None,
            "executable": executable.name if executable else None,
            "fallback": "Python implementations are used until the C program is compiled.",
            "algorithms": ["linear search", "binary search", "merge sort", "FIFO alert queue"],
        }
    )


@app.get("/api/algorithms/search")
def algorithm_search_api():
    mode = request.args.get("mode", "linear").strip().lower()
    field = request.args.get("field", "transaction_id").strip()
    needle = request.args.get("q", "").strip()
    if mode not in {"linear", "binary"}:
        raise ValueError("mode must be 'linear' or 'binary'.")
    if field not in {"transaction_id", "sender_account_id"}:
        raise ValueError("field must be 'transaction_id' or 'sender_account_id'.")
    if not needle:
        raise ValueError("Provide a non-empty q search value.")
    if field == "transaction_id":
        try:
            transaction_id = int(needle)
        except ValueError as error:
            raise ValueError("transaction_id searches require a whole number.") from error
        if transaction_id < 0 or transaction_id > 2_147_483_647:
            raise ValueError("transaction_id must be between 0 and 2147483647.")
        needle = str(transaction_id)
    rows = load_transactions()
    executable = get_c_executable()
    if executable:
        c_mode = f"{mode}-{field}"
        try:
            output = run_c_algorithm([c_mode, needle], to_c_input(rows))
            result = parse_c_transaction(output[0]) if output else None
            engine = "C"
        except (OSError, subprocess.SubprocessError, ValueError) as error:
            app.logger.exception("C search failed.")
            return jsonify({"error": f"C search failed: {error}"}), 500
    else:
        result = (
            linear_search(rows, field, needle)
            if mode == "linear"
            else binary_search(rows, field, needle)
        )
        engine = "Python fallback"
    return jsonify({"transaction": result, "found": result is not None, "engine": engine, "algorithm": mode})


@app.get("/api/algorithms/sort")
def algorithm_sort_api():
    key = request.args.get("by", "amount").strip()
    order = request.args.get("order", "desc").strip().lower()
    if key not in {"transaction_id", "amount"}:
        raise ValueError("by must be 'transaction_id' or 'amount'.")
    if order not in {"asc", "desc"}:
        raise ValueError("order must be 'asc' or 'desc'.")
    rows = load_transactions()
    executable = get_c_executable()
    if executable:
        try:
            output = run_c_algorithm([f"sort-{key}", order, "raw"], to_c_input(rows))
            sorted_rows = [parse_c_transaction(line) for line in output]
            engine = "C merge sort"
        except ValueError:
            # An older bank_monitor executable (compiled before the "raw" mode existed) prints tables.
            app.logger.warning("Recompile bank_monitor.c to enable raw C sort output; using Python fallback.")
            sorted_rows = merge_sort(rows, key, descending=order == "desc")
            engine = "Python merge sort fallback (recompile bank_monitor.c)"
        except (OSError, subprocess.SubprocessError) as error:
            app.logger.exception("C merge sort failed.")
            return jsonify({"error": f"C merge sort failed: {error}"}), 500
    else:
        sorted_rows = merge_sort(rows, key, descending=order == "desc")
        engine = "Python merge sort fallback"
    return jsonify({"transactions": sorted_rows, "count": len(sorted_rows), "engine": engine})


if __name__ == "__main__":
    app.run(debug=True)