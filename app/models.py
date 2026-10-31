from datetime import datetime, timezone
from enum import Enum
from typing import Annotated
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class Severity(str, Enum):
    critical = "Critical"
    high = "High"
    moderate = "Moderate"
    low = "Low"


class IncidentType(str, Enum):
    medical = "Medical"
    flood = "Flood"
    fire = "Fire"
    trapped = "Trapped"
    supplies = "Supplies"


class IncidentAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    translated_text: Annotated[str, Field(min_length=1, max_length=4000)]
    summary: Annotated[str, Field(min_length=1, max_length=500)]
    severity: Severity
    incident_type: IncidentType
    location_text: Annotated[str, Field(max_length=240)] = ""
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    confidence: float = Field(ge=0, le=1)


class IncidentCreate(BaseModel):
    original_message: Annotated[str, Field(min_length=1, max_length=4000)]
    analysis: IncidentAnalysis
    source_type: str = "text"
    demo: bool = False


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_incident(analysis: IncidentAnalysis, original_message: str, source_type: str, demo: bool) -> dict:
    return {
        "id": str(uuid4()),
        "original_message": original_message,
        "translated_text": analysis.translated_text,
        "summary": analysis.summary,
        "severity": analysis.severity.value,
        "incident_type": analysis.incident_type.value,
        "location_text": analysis.location_text or "Location not confirmed",
        "latitude": analysis.latitude,
        "longitude": analysis.longitude,
        "confidence": analysis.confidence,
        "source_type": source_type,
        "status": "open",
        "reviewed": False,
        "demo": demo,
        "created_at": utc_now(),
    }
