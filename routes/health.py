from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, request

from routes.common import body, error, ok, require_auth

health_bp = Blueprint("health", __name__, url_prefix="/api/health")

METRICS = ["heart_rate", "spo2", "steps", "calories", "water"]
SOURCES = ["band", "app", "manual", "backend"]
AVERAGED = {"heart_rate", "spo2"}          # buckets show the average; the others show totals
# History page keys -> database metric
HISTORY_METRICS = {"heart": "heart_rate", "spo2": "spo2", "steps": "steps",
                   "calories": "calories", "water": "water", "sleep": "sleep"}
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MAX_ROWS = 20000


# ------------------------------------------------------------------ helpers
def tz_offset():
    """Minutes to add to UTC to get the user's local time (the app sends JS getTimezoneOffset())."""
    try:
        return -int(request.args.get("tz", 0))
    except ValueError:
        return 0


def to_local(ts, offset):
    return datetime.fromisoformat(ts.replace("Z", "+00:00")) + timedelta(minutes=offset)


def local_now(offset):
    return datetime.now(timezone.utc) + timedelta(minutes=offset)


def utc_iso(local_dt, offset):
    return (local_dt - timedelta(minutes=offset)).isoformat()


def ms(ts):
    return int(datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000)


def fetch_all(query_builder):
    """PostgREST returns at most 1000 rows per request; page through up to MAX_ROWS."""
    rows, start = [], 0
    while start < MAX_ROWS:
        page = query_builder().range(start, start + 999).execute().data
        rows.extend(page)
        if len(page) < 1000:
            break
        start += 1000
    return rows


def readings_between(metric, start_utc, end_utc):
    return fetch_all(lambda: g.db.table("health_readings").select("value,recorded_at")
                     .eq("user_id", g.user.id).eq("metric", metric)
                     .gte("recorded_at", start_utc).lt("recorded_at", end_utc)
                     .order("recorded_at"))


def sleep_between(start_utc, end_utc):
    return fetch_all(lambda: g.db.table("sleep_sessions").select("start_time,end_time,duration_minutes")
                     .eq("user_id", g.user.id).gte("end_time", start_utc).lt("end_time", end_utc)
                     .order("end_time"))


def sleep_minutes(session):
    if session.get("duration_minutes") is not None:
        return float(session["duration_minutes"])
    start = datetime.fromisoformat(session["start_time"].replace("Z", "+00:00"))
    end = datetime.fromisoformat(session["end_time"].replace("Z", "+00:00"))
    return (end - start).total_seconds() / 60


def buckets_for(range_name, offset):
    """[(label, local_start, local_end)] for the chart, oldest first."""
    now = local_now(offset)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if range_name == "day":
        return [(f"{h}h", midnight + timedelta(hours=h), midnight + timedelta(hours=h + 3)) for h in range(0, 24, 3)]
    if range_name == "week":
        monday = midnight - timedelta(days=midnight.weekday())
        return [(DAY_NAMES[i], monday + timedelta(days=i), monday + timedelta(days=i + 1)) for i in range(7)]
    first = midnight - timedelta(days=29)
    return [(str((first + timedelta(days=i)).day), first + timedelta(days=i), first + timedelta(days=i + 1))
            for i in range(30)]


# ------------------------------------------------------------------ raw readings
@health_bp.route("/readings", methods=["GET"])
@require_auth
def get_readings():
    query = g.db.table("health_readings").select("*").eq("user_id", g.user.id)
    metric = request.args.get("metric")
    if metric:
        if metric not in METRICS:
            return error("Invalid health metric")
        query = query.eq("metric", metric)
    if request.args.get("from"):
        query = query.gte("recorded_at", request.args["from"])
    if request.args.get("to"):
        query = query.lt("recorded_at", request.args["to"])
    limit = min(int(request.args.get("limit", 200)), 1000)
    response = query.order("recorded_at", desc=True).limit(limit).execute()
    return ok(readings=response.data)


@health_bp.route("/readings", methods=["POST"])
@require_auth
def add_readings():
    """Save one reading, or a batch from a band sync: {"readings": [{metric, value, recorded_at?}, ...]}."""
    data = body()
    items = data.get("readings") if isinstance(data.get("readings"), list) else [data]
    if not items or len(items) > 500:
        return error("Send between 1 and 500 readings")

    device_id = data.get("device_id")
    if device_id:
        owned = g.db.table("devices").select("id").eq("id", device_id).eq("user_id", g.user.id).execute()
        if not owned.data:
            return error("Device not found", 404)

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for i, item in enumerate(items):
        metric, value = item.get("metric"), item.get("value")
        if metric not in METRICS:
            return error(f"Reading {i + 1}: metric must be one of {', '.join(METRICS)}")
        if not isinstance(value, (int, float)) or value < 0:
            return error(f"Reading {i + 1}: value must be a number of 0 or more")
        source = item.get("source", data.get("source", "app"))
        if source not in SOURCES:
            return error(f"Reading {i + 1}: source must be one of {', '.join(SOURCES)}")
        row = {"user_id": g.user.id, "metric": metric, "value": value,
               "recorded_at": item.get("recorded_at") or now, "source": source}
        if item.get("device_id") or device_id:
            row["device_id"] = item.get("device_id") or device_id
        rows.append(row)

    response = g.db.table("health_readings").insert(rows).execute()
    return ok(201, message=f"Saved {len(response.data)} reading(s)", readings=response.data)


# ------------------------------------------------------------------ home cards
@health_bp.route("/today", methods=["GET"])
@require_auth
def today():
    offset = tz_offset()
    midnight = local_now(offset).replace(hour=0, minute=0, second=0, microsecond=0)
    start, end = utc_iso(midnight, offset), utc_iso(midnight + timedelta(days=1), offset)

    result = {}
    for metric in ("heart_rate", "spo2"):
        latest = (g.db.table("health_readings").select("value,recorded_at").eq("user_id", g.user.id)
                  .eq("metric", metric).order("recorded_at", desc=True).limit(1).execute().data)
        result[metric] = ({"value": float(latest[0]["value"]), "time": ms(latest[0]["recorded_at"])}
                          if latest else None)
    for metric in ("steps", "calories", "water"):
        result[metric] = sum(float(r["value"]) for r in readings_between(metric, start, end))
    last_night = sleep_between(utc_iso(midnight - timedelta(hours=12), offset), end)
    result["sleep_minutes"] = sleep_minutes(last_night[-1]) if last_night else None
    return ok(today=result)


# ------------------------------------------------------------------ history pages
@health_bp.route("/history/<metric_key>", methods=["GET"])
@require_auth
def history(metric_key):
    """Data for the history pages: {latest, points, readings} (see history.js)."""
    metric = HISTORY_METRICS.get(metric_key)
    if not metric:
        return error("Unknown metric. Use one of: " + ", ".join(HISTORY_METRICS))
    range_name = request.args.get("range", "week")
    if range_name not in ("day", "week", "month"):
        return error('range must be "day", "week" or "month"')

    offset = tz_offset()
    buckets = buckets_for(range_name, offset)
    start, end = utc_iso(buckets[0][1], offset), utc_iso(buckets[-1][2], offset)
    to_display = (lambda v: v / 1000.0) if metric == "water" else (lambda v: v)   # ml -> litres

    if metric == "sleep":
        sessions = sleep_between(start, end)
        entries = [(to_local(s["end_time"], offset), sleep_minutes(s), s["end_time"]) for s in sessions]
    else:
        rows = readings_between(metric, start, end)
        entries = [(to_local(r["recorded_at"], offset), float(r["value"]), r["recorded_at"]) for r in rows]

    points = []
    for label, b_start, b_end in buckets:
        values = [v for t, v, _ in entries if b_start <= t < b_end]
        if metric in AVERAGED:
            if values:
                points.append({"label": label, "value": round(sum(values) / len(values), 1)})
        else:
            points.append({"label": label, "value": round(to_display(sum(values)), 2)})
    if not entries:
        points = []   # the page shows its "No data yet" state

    readings = [{"time": ms(raw), "value": round(to_display(v), 2)} for _, v, raw in reversed(entries[-50:])]

    latest = None
    if metric in AVERAGED:
        row = (g.db.table("health_readings").select("value,recorded_at").eq("user_id", g.user.id)
               .eq("metric", metric).order("recorded_at", desc=True).limit(1).execute().data)
        if row:
            latest = {"value": float(row[0]["value"]), "time": ms(row[0]["recorded_at"])}
    elif metric == "sleep":
        row = (g.db.table("sleep_sessions").select("start_time,end_time,duration_minutes")
               .eq("user_id", g.user.id).order("end_time", desc=True).limit(1).execute().data)
        if row:
            latest = {"value": sleep_minutes(row[0]), "time": ms(row[0]["end_time"])}
    else:
        midnight = local_now(offset).replace(hour=0, minute=0, second=0, microsecond=0)
        today_rows = readings_between(metric, utc_iso(midnight, offset), utc_iso(midnight + timedelta(days=1), offset))
        if today_rows:
            latest = {"value": round(to_display(sum(float(r["value"]) for r in today_rows)), 2),
                      "time": ms(today_rows[-1]["recorded_at"])}

    return ok(latest=latest, points=points, readings=readings)


# ------------------------------------------------------------------ daily summary table
@health_bp.route("/summary", methods=["GET"])
@require_auth
def get_daily_summary():
    response = (g.db.table("daily_health_summary").select("*").eq("user_id", g.user.id)
                .order("summary_date", desc=True).limit(90).execute())
    return ok(summary=response.data)
