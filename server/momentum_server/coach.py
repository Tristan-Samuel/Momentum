"""Gemini coach. The phone sends the program and recent sessions; the key stays on tssamuel.com."""

from __future__ import annotations

import json
import re
from typing import Any, Callable

import requests

Complete = Callable[[str], str]

TASKS = ("create_program", "edit_exercise", "analyze")


class CoachError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def complete_with_gemini(prompt: str, *, api_key: str, model: str) -> str:
    response = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        json={
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.4, "responseMimeType": "application/json"},
        },
        timeout=25,
    )
    if response.status_code >= 400:
        raise CoachError("Gemini could not answer. Try again in a moment.", 503)
    try:
        return response.json()["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise CoachError("Gemini returned an empty answer.", 503) from exc


def interpret(task: str, note: str, context: Any, complete: Complete) -> dict[str, Any]:
    if task not in TASKS:
        raise CoachError("Unknown coach task.")
    if not isinstance(note, str):
        raise CoachError("Note must be text.")
    if not isinstance(context, dict):
        raise CoachError("Context must be an object.")
    note = note.strip()[:2000]
    raw_context = json.dumps(context, default=str)[:60_000]
    text = complete(_prompt(task, note, raw_context))
    try:
        payload = json.loads(_strip_fence(text))
    except json.JSONDecodeError as exc:
        raise CoachError("Gemini returned something that was not a workout.", 503) from exc
    if not isinstance(payload, dict):
        raise CoachError("Gemini returned something that was not a workout.", 503)
    reply = _shape(task, payload, _ids(context))
    return reply


def _prompt(task: str, note: str, context: str) -> str:
    return f"""You are the coach inside Momentum, a one-person strength app.
Reply with one JSON object and no markdown.

Rules of the app:
- Rest is only between sets of the same exercise.
- Transition is the only gap between exercises. Do not add a second rest there.
- startPosition "bottom" means the rep starts with the lift (pull-ups, chin-ups, rows). The person begins at the bottom.
- startPosition "top" means the rep starts by lowering (push-ups, squats, dips).
- Tempo is seconds: eccentric, bottomPause, concentric, topPause.
- measure "seconds" is an isometric hold. measure "reps" is a tempo set.
- cueMode "open" means the person logs the reps (barbell and machine compounds such as squat, bench, deadlift, row, overhead press). cueMode "tempo" keeps the metronome. Curls, raises, and bodyweight stay tempo.
- load is the weight as a number. loadUnit is "lb" or "kg". loadKind is "bodyweight", "added" (a belt or vest), or "external" (a bar, dumbbell, or machine). loadPer is "total" or "side". loadStep is how much to add after the top of the rep range.
- Use exerciseConfigId values from the context when you edit or recommend. Never invent an id.

Task: {task}
Note from the person: {note or "(none)"}
Context: {context}

JSON shape:
{{
  "summary": "one or two plain sentences",
  "program": null or {{"name": "string", "exercises": [exercise]}},
  "edit": null or {{"exerciseConfigId": "string", "name": "string", "sets": 2, "minReps": 6, "maxReps": 12, "measure": "reps", "tempo": {{"eccentric": 3, "bottomPause": 0, "concentric": 1, "topPause": 0}}, "startPosition": "bottom", "restAfterSetSeconds": 120, "transitionAfterExerciseSeconds": 30, "targets": [8]}},
  "recommendations": [{{"exerciseConfigId": "string", "note": "string", "targets": [8], "resistanceLabel": "string"}}]
}}
For create_program, fill program and leave edit null.
For edit_exercise, fill edit for the focused exercise and leave program null. Change only what was asked.
For analyze, fill recommendations and leave program and edit null.
"""


def _strip_fence(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _ids(context: Any) -> set[str]:
    found: set[str] = set()

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key in {"id", "exerciseConfigId"} and isinstance(value, str):
                    found.add(value)
                else:
                    walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(context)
    return found


def _clamp(value: Any, low: int, high: int, fallback: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(low, min(high, number))


def _text(value: Any, limit: int, fallback: str = "") -> str:
    if not isinstance(value, str):
        return fallback
    cleaned = " ".join(value.split()).strip()
    return cleaned[:limit] or fallback


def _exercise(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    name = _text(value.get("name"), 80)
    if not name:
        return None
    measure = "seconds" if value.get("measure") == "seconds" else "reps"
    hold = measure == "seconds"
    min_reps = _clamp(value.get("minReps"), 1, 600 if hold else 100, 20 if hold else 6)
    max_reps = _clamp(value.get("maxReps"), 1, 600 if hold else 100, 45 if hold else 12)
    if min_reps > max_reps:
        min_reps, max_reps = max_reps, min_reps
    start = value.get("startPosition")
    if start not in {"top", "bottom"}:
        start = "bottom" if re.search(r"\b(pull-?ups?|chin-?ups?)\b", name, re.I) else "top"
    tempo = value.get("tempo") if isinstance(value.get("tempo"), dict) else {}
    laterality = "unilateral" if value.get("laterality") == "unilateral" else "bilateral"
    order = value.get("unilateralOrder")
    if order not in {"right-then-left", "left-then-right", "alternating"}:
        order = "right-then-left"
    rir_min = _clamp(value.get("targetRirMin"), 0, 5, 1)
    rir_max = _clamp(value.get("targetRirMax"), 0, 5, 2)
    if rir_min > rir_max:
        rir_min, rir_max = rir_max, rir_min
    return {
        "name": name,
        "sets": _clamp(value.get("sets"), 1, 10, 2),
        "minReps": min_reps,
        "maxReps": max_reps,
        "measure": measure,
        "tempo": {
            "eccentric": _clamp(tempo.get("eccentric"), 0, 10, 3),
            "bottomPause": _clamp(tempo.get("bottomPause"), 0, 10, 0),
            "concentric": _clamp(tempo.get("concentric"), 0, 10, 1),
            "topPause": _clamp(tempo.get("topPause"), 0, 10, 0),
        },
        "startPosition": start,
        "restAfterSetSeconds": _clamp(value.get("restAfterSetSeconds"), 0, 900, 60 if hold else 120),
        "transitionAfterExerciseSeconds": _clamp(value.get("transitionAfterExerciseSeconds"), 0, 600, 30),
        "targetRirMin": rir_min,
        "targetRirMax": rir_max,
        "laterality": laterality,
        "unilateralOrder": order,
        "resistanceLabel": _text(value.get("resistanceLabel"), 40, "Bodyweight"),
        "progressionStep": _clamp(value.get("progressionStep"), 1, 30 if hold else 5, 5 if hold else 1),
        **_load_fields(value),
    }


def _load_fields(value: dict[str, Any]) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    if value.get("cueMode") in {"tempo", "open"}:
        fields["cueMode"] = value["cueMode"]
    if value.get("loadKind") in {"bodyweight", "added", "external"}:
        fields["loadKind"] = value["loadKind"]
    load = value.get("load")
    if load is None and "load" in value:
        fields["load"] = None
    elif isinstance(load, (int, float)) and not isinstance(load, bool):
        fields["load"] = round(max(0, min(2000, float(load))), 2)
    if value.get("loadUnit") in {"lb", "kg"}:
        fields["loadUnit"] = value["loadUnit"]
    step = value.get("loadStep")
    if isinstance(step, (int, float)) and not isinstance(step, bool) and step > 0:
        fields["loadStep"] = round(min(100, float(step)), 2)
    if value.get("loadPer") in {"total", "side"}:
        fields["loadPer"] = value["loadPer"]
    return fields


def _targets(value: Any) -> list[int] | None:
    if not isinstance(value, list):
        return None
    targets = [_clamp(item, 1, 600, 1) for item in value[:10]]
    return targets or None


def _edit(value: Any, known: set[str]) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    config_id = _text(value.get("exerciseConfigId"), 128)
    if not config_id or (known and config_id not in known):
        return None
    edit: dict[str, Any] = {"exerciseConfigId": config_id}
    name = _text(value.get("name"), 80)
    if name:
        edit["name"] = name
    for key, low, high, fallback in (
        ("sets", 1, 10, 2),
        ("minReps", 1, 600, 6),
        ("maxReps", 1, 600, 12),
        ("restAfterSetSeconds", 0, 900, 120),
        ("transitionAfterExerciseSeconds", 0, 600, 30),
        ("targetRirMin", 0, 5, 1),
        ("targetRirMax", 0, 5, 2),
        ("progressionStep", 1, 30, 1),
    ):
        if key in value and value.get(key) is not None:
            edit[key] = _clamp(value.get(key), low, high, fallback)
    if value.get("measure") in {"reps", "seconds"}:
        edit["measure"] = value["measure"]
    if value.get("startPosition") in {"top", "bottom"}:
        edit["startPosition"] = value["startPosition"]
    if isinstance(value.get("tempo"), dict):
        tempo = value["tempo"]
        edit["tempo"] = {
            "eccentric": _clamp(tempo.get("eccentric"), 0, 10, 3),
            "bottomPause": _clamp(tempo.get("bottomPause"), 0, 10, 0),
            "concentric": _clamp(tempo.get("concentric"), 0, 10, 1),
            "topPause": _clamp(tempo.get("topPause"), 0, 10, 0),
        }
    if value.get("laterality") in {"bilateral", "unilateral"}:
        edit["laterality"] = value["laterality"]
    if value.get("unilateralOrder") in {"right-then-left", "left-then-right", "alternating"}:
        edit["unilateralOrder"] = value["unilateralOrder"]
    resistance = _text(value.get("resistanceLabel"), 40)
    if resistance:
        edit["resistanceLabel"] = resistance
    edit.update(_load_fields(value))
    targets = _targets(value.get("targets"))
    if targets:
        edit["targets"] = targets
    return edit if len(edit) > 1 else None


def _shape(task: str, payload: dict[str, Any], known: set[str]) -> dict[str, Any]:
    summary = _text(payload.get("summary"), 600, "No summary came back.")
    program = None
    raw_program = payload.get("program")
    if isinstance(raw_program, dict):
        exercises = [item for item in (_exercise(row) for row in raw_program.get("exercises") or []) if item][:12]
        if exercises:
            program = {"name": _text(raw_program.get("name"), 80, "New program"), "exercises": exercises}
    edit = _edit(payload.get("edit"), known)
    recommendations = []
    for row in (payload.get("recommendations") or [])[:8]:
        if not isinstance(row, dict):
            continue
        note = _text(row.get("note"), 280)
        if not note:
            continue
        config_id = _text(row.get("exerciseConfigId"), 128)
        if known and config_id and config_id not in known:
            config_id = ""
        item: dict[str, Any] = {"exerciseConfigId": config_id or None, "note": note}
        targets = _targets(row.get("targets"))
        if targets:
            item["targets"] = targets
        resistance = _text(row.get("resistanceLabel"), 40)
        if resistance:
            item["resistanceLabel"] = resistance
        recommendations.append(item)
    if task == "create_program":
        edit = None
        recommendations = []
        if program is None:
            raise CoachError("Gemini did not return a program.", 503)
    elif task == "edit_exercise":
        program = None
        recommendations = []
        if edit is None:
            raise CoachError("Gemini did not return a change for that exercise.", 503)
    else:
        program = None
        edit = None
    return {"summary": summary, "program": program, "edit": edit, "recommendations": recommendations}
