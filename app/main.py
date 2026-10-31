import secrets
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from app.config import ROOT_DIR, settings
from app.dispatch import rank_incidents, recommend_dispatch
from app.models import IncidentAnalysis, new_incident, utc_now
from app.store import add_incident, list_data, update_incident
from app.triage import ModelServiceError, classify_demo, classify_with_gemini

app = FastAPI(title="RescueMind", version="1.0.0")
STATIC_DIR = ROOT_DIR / "static"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def dashboard_api_key(request, call_next):
    if settings.dashboard_api_key and request.url.path.startswith("/api/") and request.url.path != "/api/health":
        supplied = request.headers.get("X-Dashboard-Key", "")
        if not secrets.compare_digest(supplied, settings.dashboard_api_key):
            return app_response_unauthorized()
    return await call_next(request)


def app_response_unauthorized():
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=401, content={"detail": "Dashboard key required. Enter the configured key in the dashboard."})


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "ai_provider": settings.ai_provider,
        "ai_ready": settings.ai_provider == "demo" or bool(settings.gemini_api_key),
        "model": settings.gemini_model if settings.ai_provider == "gemini" else "Local demo rules",
        "auth_required": bool(settings.dashboard_api_key),
        "time": utc_now(),
    }


@app.get("/api/dashboard")
async def dashboard():
    data = list_data()
    base = None
    if settings.dispatch_base_lat is not None and settings.dispatch_base_lon is not None:
        base = {"latitude": settings.dispatch_base_lat, "longitude": settings.dispatch_base_lon}
    ranked = rank_incidents(data["incidents"], base)
    open_incidents = [incident for incident in ranked if incident.get("status") == "open"]
    recommendations = recommend_dispatch(open_incidents, data["units"])
    return {
        "incidents": ranked,
        "units": data["units"],
        "recommendations": recommendations,
        "base_location": base,
        "updated_at": data.get("updated_at"),
    }


@app.post("/api/incidents")
async def create_incident(
    message: Annotated[str, Form()] = "",
    image: Annotated[UploadFile | None, File()] = None,
):
    clean_message = message.strip()
    if not clean_message and image is None:
        raise HTTPException(status_code=422, detail="Add an emergency message or attach a screenshot/photo.")
    if len(clean_message) > 4000:
        raise HTTPException(status_code=413, detail="Message exceeds the 4,000 character limit.")

    image_bytes = None
    mime_type = None
    if image is not None:
        mime_type = image.content_type or ""
        if mime_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=415, detail="Upload a JPEG, PNG, or WebP image.")
        image_bytes = await image.read(settings.max_image_bytes + 1)
        if len(image_bytes) > settings.max_image_bytes:
            raise HTTPException(status_code=413, detail=f"Image exceeds the {settings.max_image_bytes // (1024 * 1024)} MB limit.")

    try:
        if settings.ai_provider == "gemini":
            analysis = await classify_with_gemini(clean_message, image_bytes, mime_type)
            demo = False
        else:
            if image_bytes is not None:
                raise ModelServiceError("Image analysis needs AI_PROVIDER=gemini and a configured Gemini API key.")
            analysis = classify_demo(clean_message)
            demo = True
    except ModelServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="The triage result failed validation. Please review the message manually.") from exc

    incident = new_incident(
        analysis=analysis,
        original_message=clean_message or "[Image-only emergency report]",
        source_type="image" if image_bytes is not None and not clean_message else "text+image" if image_bytes is not None else "text",
        demo=demo,
    )
    try:
        add_incident(incident)
    except (OSError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail="The triage result could not be saved. Keep the report and retry.") from exc
    return {"incident": incident, "ai_provider": "demo" if demo else "gemini", "requires_human_review": True}


@app.patch("/api/incidents/{incident_id}/review")
async def review_incident(incident_id: str):
    incident = update_incident(incident_id, {"reviewed": True, "reviewed_at": utc_now()})
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    return {"incident": incident}


@app.patch("/api/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str):
    incident = update_incident(incident_id, {"status": "resolved", "resolved_at": utc_now()})
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    return {"incident": incident}
