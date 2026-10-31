import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.dispatch import distance_km, rank_incidents, recommend_dispatch
from app.config import settings
from app.main import app
from app.store import add_incident, list_data, update_incident
from app.triage import _parse_model_json, classify_demo
from app.models import IncidentAnalysis


class DispatchTests(unittest.TestCase):
    def test_distance_is_zero_for_same_coordinates(self):
        self.assertAlmostEqual(distance_km(17.385, 78.486, 17.385, 78.486), 0)

    def test_urgency_and_proximity_change_order(self):
        incidents = [
            {"id": "far-critical", "severity": "Critical", "incident_type": "Medical", "latitude": 18.0, "longitude": 78.0},
            {"id": "near-high", "severity": "High", "incident_type": "Trapped", "latitude": 17.386, "longitude": 78.486},
            {"id": "far-high", "severity": "High", "incident_type": "Trapped", "latitude": 18.0, "longitude": 78.0},
        ]
        ranked = rank_incidents(incidents, {"latitude": 17.385, "longitude": 78.486})
        self.assertEqual(ranked[0]["id"], "far-critical")
        self.assertGreater(ranked[0]["priority_score"], ranked[1]["priority_score"])
        self.assertLess(
            next(item for item in ranked if item["id"] == "far-high")["priority_score"],
            next(item for item in ranked if item["id"] == "near-high")["priority_score"],
        )

    def test_recommendations_only_assign_available_compatible_units_once(self):
        incidents = [
            {"id": "i1", "summary": "breathing issue", "severity": "Critical", "incident_type": "Medical", "latitude": 17.4, "longitude": 78.5},
            {"id": "i2", "summary": "injury", "severity": "High", "incident_type": "Medical", "latitude": 17.41, "longitude": 78.51},
        ]
        units = [
            {"id": "u1", "name": "Ambulance 1", "unit_type": "Ambulance", "supports": ["Medical"], "status": "available", "latitude": 17.4, "longitude": 78.5},
            {"id": "u2", "name": "Ambulance 2", "unit_type": "Ambulance", "supports": ["Medical"], "status": "busy", "latitude": 17.41, "longitude": 78.51},
        ]
        result = recommend_dispatch(incidents, units)
        self.assertEqual(result[0]["unit"]["id"], "u1")
        self.assertIsNone(result[1]["unit"])
        self.assertTrue(all(item["requires_confirmation"] for item in result))

    def test_model_output_is_validated(self):
        payload = '{"translated_text":"Help","summary":"Person injured","severity":"High","incident_type":"Medical","location_text":"","latitude":null,"longitude":null,"confidence":0.8}'
        self.assertIsInstance(_parse_model_json(payload), IncidentAnalysis)
        with self.assertRaises(Exception):
            _parse_model_json(payload.replace('"High"', '"Urgent"'))

    def test_demo_classifier_escalates_breathing_difficulty(self):
        result = classify_demo("Urgent medical help; a person is having difficulty breathing.")
        self.assertEqual(result.severity.value, "Critical")
        self.assertEqual(result.incident_type.value, "Medical")

    def test_json_store_persists_add_and_update(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "store.json"
            seeded = list_data(path)["incidents"]
            self.assertEqual(len(seeded), 6)
            item = {"id": "test-1", "status": "open"}
            add_incident(item, path)
            self.assertEqual(list_data(path)["incidents"][-1]["id"], "test-1")
            update_incident("test-1", {"reviewed": True}, path)
            self.assertTrue(list_data(path)["incidents"][-1]["reviewed"])

    def test_api_classifies_and_persists_demo_report(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(
            settings, "data_file", Path(directory) / "store.json"
        ), patch.object(settings, "ai_provider", "demo"):
            client = TestClient(app)
            response = client.post(
                "/api/incidents",
                data={"message": "A person is trapped near the bridge, urgent help needed."},
            )
            self.assertEqual(response.status_code, 200)
            payload = response.json()
            self.assertTrue(payload["requires_human_review"])
            self.assertTrue(payload["incident"]["demo"])
            self.assertEqual(payload["incident"]["incident_type"], "Trapped")
            self.assertFalse(payload["incident"]["reviewed"])

    def test_api_rejects_image_when_demo_rules_are_active(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(
            settings, "data_file", Path(directory) / "store.json"
        ), patch.object(settings, "ai_provider", "demo"):
            client = TestClient(app)
            response = client.post(
                "/api/incidents",
                files={"image": ("sos.png", b"not-a-real-image", "image/png")},
            )
            self.assertEqual(response.status_code, 503)
            self.assertIn("AI_PROVIDER=gemini", response.json()["detail"])

    def test_dashboard_api_key_is_enforced_but_health_is_public(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(
            settings, "data_file", Path(directory) / "store.json"
        ), patch.object(settings, "dashboard_api_key", "test-secret"):
            client = TestClient(app)
            self.assertEqual(client.get("/api/health").status_code, 200)
            self.assertEqual(client.get("/api/dashboard").status_code, 401)
            self.assertEqual(
                client.get("/api/dashboard", headers={"X-Dashboard-Key": "test-secret"}).status_code,
                200,
            )


if __name__ == "__main__":
    unittest.main()
