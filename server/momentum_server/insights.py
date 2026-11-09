from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

Tables = dict[str, list[dict[str, Any]]]


def parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _measure(exercise_session: dict[str, Any]) -> str:
    snapshot = exercise_session.get("configSnapshot") or {}
    return "seconds" if snapshot.get("measure") == "seconds" else "reps"


def _counted(session: dict[str, Any]) -> bool:
    status = session.get("status")
    return status == "completed" or (status == "aborted" and (session.get("totalSets") or 0) > 0)


def _amount(set_row: dict[str, Any]) -> int:
    if set_row.get("skipped"):
        return 0
    return int(set_row.get("completedReps") or 0)


def workouts(tables: Tables) -> list[dict[str, Any]]:
    """Counted sessions, newest first, with reps and hold seconds split by measure."""
    measures = {row["id"]: _measure(row) for row in tables.get("exerciseSessions", [])}
    reps: dict[str, int] = defaultdict(int)
    holds: dict[str, int] = defaultdict(int)
    sets: dict[str, int] = defaultdict(int)
    for row in tables.get("setSessions", []):
        session_id = row.get("workoutSessionId")
        amount = _amount(row)
        if not row.get("skipped"):
            sets[session_id] += 1
        if measures.get(row.get("exerciseSessionId")) == "seconds":
            holds[session_id] += amount
        else:
            reps[session_id] += amount
    out = []
    for session in tables.get("workoutSessions", []):
        if not _counted(session):
            continue
        started = parse_time(session.get("startedAt"))
        out.append(
            {
                "id": session["id"],
                "program": session.get("programNameSnapshot") or "Workout",
                "status": session.get("status"),
                "started_at": started,
                "duration_min": round((session.get("durationMs") or 0) / 60000),
                "sets": sets[session["id"]],
                "reps": reps[session["id"]],
                "hold_seconds": holds[session["id"]],
            }
        )
    out.sort(key=lambda row: row["started_at"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return out


def summary(tables: Tables) -> dict[str, Any]:
    rows = workouts(tables)
    return {
        "workouts": len(rows),
        "last_workout": rows[0]["started_at"] if rows else None,
        "total_reps": sum(row["reps"] for row in rows),
        "total_hold_seconds": sum(row["hold_seconds"] for row in rows),
        "programs": len(tables.get("workoutPrograms", [])),
    }


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def weekly_volume(tables: Tables, weeks: int = 12, today: date | None = None) -> list[dict[str, Any]]:
    today = today or datetime.now(timezone.utc).date()
    first = _week_start(today) - timedelta(weeks=weeks - 1)
    buckets = {first + timedelta(weeks=i): {"reps": 0, "workouts": 0} for i in range(weeks)}
    for row in workouts(tables):
        if row["started_at"] is None:
            continue
        key = _week_start(row["started_at"].date())
        if key in buckets:
            buckets[key]["reps"] += row["reps"]
            buckets[key]["workouts"] += 1
    peak = max((bucket["reps"] for bucket in buckets.values()), default=0) or 1
    return [
        {
            "week": key,
            "label": key.strftime("%b %-d"),
            "reps": bucket["reps"],
            "workouts": bucket["workouts"],
            "pct": round(100 * bucket["reps"] / peak),
        }
        for key, bucket in sorted(buckets.items())
    ]


def programs(tables: Tables) -> list[dict[str, Any]]:
    names = {row["id"]: row.get("name", "") for row in tables.get("exercises", [])}
    progress = {row.get("exerciseId"): row for row in tables.get("progressionStates", [])}
    configs: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for config in tables.get("exerciseConfigurations", []):
        state = progress.get(config.get("exerciseId")) or {}
        tempo = config.get("tempo") or {}
        configs[config.get("programId")].append(
            {
                "order": config.get("order", 0),
                "name": names.get(config.get("exerciseId"), "Exercise"),
                "measure": config.get("measure") or "reps",
                "sets": config.get("sets"),
                "range": f"{config.get('minReps')}–{config.get('maxReps')}",
                "targets": state.get("currentTargets") or [],
                "tempo": "-".join(
                    str(tempo.get(key, 0)) for key in ("eccentric", "bottomPause", "concentric", "topPause")
                ),
                "resistance": config.get("resistanceLabel") or "",
                "laterality": config.get("laterality") or "bilateral",
                "best": state.get("personalBestReps") or 0,
            }
        )
    out = []
    for program in sorted(tables.get("workoutPrograms", []), key=lambda row: row.get("order", 0)):
        out.append(
            {
                "name": program.get("name") or "Program",
                "exercises": sorted(configs.get(program["id"], []), key=lambda row: row["order"]),
            }
        )
    return out


def records(tables: Tables) -> list[dict[str, Any]]:
    names = {row["id"]: row.get("name", "") for row in tables.get("exercises", [])}
    best: dict[tuple[str, str], dict[str, Any]] = {}
    for row in tables.get("personalRecords", []):
        key = (row.get("exerciseId"), row.get("kind"))
        if key not in best or (row.get("value") or 0) > (best[key].get("value") or 0):
            best[key] = row
    out = [
        {
            "exercise": names.get(row.get("exerciseId"), "Exercise"),
            "kind": "Best set" if row.get("kind") == "best_set_reps" else "Best workout",
            "value": row.get("value") or 0,
            "resistance": row.get("resistanceLabel") or "",
            "achieved_at": parse_time(row.get("achievedAt")),
        }
        for row in best.values()
    ]
    out.sort(key=lambda row: (row["exercise"], row["kind"]))
    return out


def session_detail(tables: Tables, session_id: str) -> dict[str, Any] | None:
    session = next((row for row in tables.get("workoutSessions", []) if row.get("id") == session_id), None)
    if session is None:
        return None
    sets_by_exercise: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in tables.get("setSessions", []):
        if row.get("workoutSessionId") == session_id:
            sets_by_exercise[row.get("exerciseSessionId")].append(row)
    exercises = []
    for row in sorted(
        (item for item in tables.get("exerciseSessions", []) if item.get("workoutSessionId") == session_id),
        key=lambda item: item.get("order", 0),
    ):
        snapshot = row.get("configSnapshot") or {}
        unit = "s" if _measure(row) == "seconds" else ""
        exercises.append(
            {
                "name": row.get("nameSnapshot") or snapshot.get("name") or "Exercise",
                "unit": unit,
                "resistance": snapshot.get("resistanceLabel") or "",
                "rating": (row.get("difficultyRating") or "").replace("_", " "),
                "rir": row.get("rir"),
                "form": row.get("formQuality"),
                "sets": [
                    {
                        "index": set_row.get("setIndex", 0) + 1,
                        "target": set_row.get("actualTarget"),
                        "done": set_row.get("completedReps"),
                        "left": set_row.get("leftReps"),
                        "right": set_row.get("rightReps"),
                        "skipped": bool(set_row.get("skipped")),
                        "rest": set_row.get("restSecondsActual"),
                    }
                    for set_row in sorted(sets_by_exercise[row["id"]], key=lambda item: item.get("setIndex", 0))
                ],
            }
        )
    return {
        "id": session_id,
        "program": session.get("programNameSnapshot") or "Workout",
        "status": session.get("status"),
        "started_at": parse_time(session.get("startedAt")),
        "duration_min": round((session.get("durationMs") or 0) / 60000),
        "exercises": exercises,
    }
