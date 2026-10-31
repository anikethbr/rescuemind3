import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")


def _optional_float(name: str) -> float | None:
    value = os.getenv(name, "").strip()
    if not value:
        return None
    try:
        return float(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number") from exc


class Settings:
    ai_provider = os.getenv("AI_PROVIDER", "demo").strip().lower()
    gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
    gemini_model = os.getenv("GEMINI_MODEL", "gemma-4-e4b-it").strip()
    gemini_api_base_url = os.getenv(
        "GEMINI_API_BASE_URL",
        "https://generativelanguage.googleapis.com/v1beta",
    ).rstrip("/")
    dashboard_api_key = os.getenv("DASHBOARD_API_KEY", "")
    dispatch_base_lat = _optional_float("DISPATCH_BASE_LAT")
    dispatch_base_lon = _optional_float("DISPATCH_BASE_LON")
    max_image_bytes = int(os.getenv("MAX_IMAGE_BYTES", "5242880"))
    data_file = Path(os.getenv("DATA_FILE", str(ROOT_DIR / "data" / "rescuemind.json")))


settings = Settings()

if settings.ai_provider not in {"demo", "gemini"}:
    raise ValueError("AI_PROVIDER must be either 'demo' or 'gemini'")
if settings.dispatch_base_lat is not None and not -90 <= settings.dispatch_base_lat <= 90:
    raise ValueError("DISPATCH_BASE_LAT must be between -90 and 90")
if settings.dispatch_base_lon is not None and not -180 <= settings.dispatch_base_lon <= 180:
    raise ValueError("DISPATCH_BASE_LON must be between -180 and 180")
if settings.max_image_bytes < 1:
    raise ValueError("MAX_IMAGE_BYTES must be positive")
