from copy import deepcopy
import json
import os
import tempfile
import threading
from pathlib import Path

from app.config import settings
from app.models import utc_now

_lock = threading.RLock()

_SEED_INCIDENTS = [
    {
        "id": "demo-001",
        "original_message": "నా తల్లికి శ్వాస తీసుకోవడం కష్టంగా ఉంది. గాంధీ నగర్, హైదరాబాద్.",
        "translated_text": "My mother is having difficulty breathing. Gandhi Nagar, Hyderabad.",
        "summary": "Older adult with difficulty breathing; needs urgent medical assessment.",
        "severity": "Critical",
        "incident_type": "Medical",
        "location_text": "Gandhi Nagar, Hyderabad",
        "latitude": 17.4065,
        "longitude": 78.4833,
        "confidence": 0.96,
        "source_type": "text",
        "status": "open",
        "reviewed": False,
        "demo": True,
        "created_at": "2026-10-31T05:42:00+00:00",
    },
    {
        "id": "demo-002",
        "original_message": "Water is rising fast inside the ground floor near Musi river. Two children are here.",
        "translated_text": "Water is rising fast inside the ground floor near the Musi River. Two children are here.",
        "summary": "Floodwater entering a ground floor with two children inside.",
        "severity": "Critical",
        "incident_type": "Flood",
        "location_text": "Musi River area, Hyderabad",
        "latitude": 17.3714,
        "longitude": 78.4814,
        "confidence": 0.91,
        "source_type": "text",
        "status": "open",
        "reviewed": False,
        "demo": True,
        "created_at": "2026-10-31T05:38:00+00:00",
    },
    {
        "id": "demo-003",
        "original_message": "We are trapped on the roof after the bridge washed away. Near Amberpet.",
        "translated_text": "We are trapped on a roof after the bridge washed away. Near Amberpet.",
        "summary": "People trapped on a roof with bridge access washed out.",
        "severity": "High",
        "incident_type": "Trapped",
        "location_text": "Amberpet, Hyderabad",
        "latitude": 17.3903,
        "longitude": 78.5116,
        "confidence": 0.89,
        "source_type": "text",
        "status": "open",
        "reviewed": False,
        "demo": True,
        "created_at": "2026-10-31T05:29:00+00:00",
    },
    {
        "id": "demo-004",
        "original_message": "மருத்துவ முகாமில் இன்சுலின் மற்றும் குடிநீர் தேவை. అంబర్‌పేట్.",
        "translated_text": "The medical camp needs insulin and drinking water. Amberpet.",
        "summary": "Relief camp requests insulin and safe drinking water.",
        "severity": "High",
        "incident_type": "Supplies",
        "location_text": "Amberpet, Hyderabad",
        "latitude": 17.3981,
        "longitude": 78.5078,
        "confidence": 0.84,
        "source_type": "text",
        "status": "open",
        "reviewed": False,
        "demo": True,
        "created_at": "2026-10-31T05:20:00+00:00",
    },
    {
        "id": "demo-005",
        "original_message": "Smoke seen from a shop on the first floor, no flames visible yet. Secunderabad.",
        "translated_text": "Smoke is visible from a first-floor shop; no flames are visible yet. Secunderabad.",
        "summary": "Smoke reported from a first-floor shop; no flames confirmed.",
        "severity": "Moderate",
        "incident_type": "Fire",
        "location_text": "Secunderabad",
        "latitude": 17.4399,
        "longitude": 78.4983,
        "confidence": 0.79,
        "source_type": "text",
        "status": "open",
        "reviewed": False,
        "demo": True,
        "created_at": "2026-10-31T05:10:00+00:00",
    },
    {
        "id": "demo-006",
        "original_message": "Need blankets and dry food for 12 families at the school shelter in Tarnaka.",
        "translated_text": "Blankets and dry food are needed for 12 families at the school shelter in Tarnaka.",
        "summary": "Shelter requests blankets and dry food for 12 families.",
        "severity": "Moderate",
        "incident_type": "Supplies",
        "location_text": "Tarnaka, Hyderabad",
        "latitude": 17.4281,
        "longitude": 78.5388,
        "confidence": 0.82,
        "source_type": "text",
        "status": "open",
        "reviewed": False,
        "demo": True,
        "created_at": "2026-10-31T04:54:00+00:00",
    },
]

_SEED_UNITS = [
    {"id": "unit-01", "name": "Ambulance 04", "unit_type": "Ambulance", "supports": ["Medical"], "status": "available", "latitude": 17.4010, "longitude": 78.4740},
    {"id": "unit-02", "name": "Rescue Boat 02", "unit_type": "Boat", "supports": ["Flood", "Trapped"], "status": "available", "latitude": 17.3650, "longitude": 78.4930},
    {"id": "unit-03", "name": "Relief Team 07", "unit_type": "Relief team", "supports": ["Supplies", "Trapped", "Flood"], "status": "available", "latitude": 17.4140, "longitude": 78.5220},
    {"id": "unit-04", "name": "Fire Crew 03", "unit_type": "Fire crew", "supports": ["Fire"], "status": "available", "latitude": 17.4350, "longitude": 78.4890},
    {"id": "unit-05", "name": "Ambulance 09", "unit_type": "Ambulance", "supports": ["Medical"], "status": "available", "latitude": 17.4230, "longitude": 78.5350},
    {"id": "unit-06", "name": "Relief Team 11", "unit_type": "Relief team", "supports": ["Supplies", "Flood"], "status": "busy", "latitude": 17.3890, "longitude": 78.4590},
]


def _initial_store() -> dict:
    return {"incidents": deepcopy(_SEED_INCIDENTS), "units": deepcopy(_SEED_UNITS), "updated_at": utc_now()}


def _write(data: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(prefix=f"{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as temp_file:
            json.dump(data, temp_file, ensure_ascii=False, indent=2)
            temp_file.flush()
            os.fsync(temp_file.fileno())
        os.replace(temp_name, path)
    except OSError:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def _read(path: Path) -> dict:
    if not path.exists():
        data = _initial_store()
        _write(data, path)
        return data
    try:
        with path.open("r", encoding="utf-8") as store_file:
            data = json.load(store_file)
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Unable to read the RescueMind data file at {path}") from exc
    if not isinstance(data, dict) or not isinstance(data.get("incidents"), list) or not isinstance(data.get("units"), list):
        raise RuntimeError(f"The RescueMind data file at {path} has an invalid structure")
    return data


def list_data(path: Path | None = None) -> dict:
    with _lock:
        return _read(path or settings.data_file)


def add_incident(incident: dict, path: Path | None = None) -> dict:
    target = path or settings.data_file
    with _lock:
        data = _read(target)
        data["incidents"].append(incident)
        data["updated_at"] = utc_now()
        _write(data, target)
    return incident


def update_incident(incident_id: str, changes: dict, path: Path | None = None) -> dict | None:
    target = path or settings.data_file
    with _lock:
        data = _read(target)
        incident = next((item for item in data["incidents"] if item["id"] == incident_id), None)
        if incident is None:
            return None
        incident.update(changes)
        data["updated_at"] = utc_now()
        _write(data, target)
        return incident
