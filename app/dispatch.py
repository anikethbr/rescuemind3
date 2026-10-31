import math

_SEVERITY_SCORE = {"Critical": 100, "High": 72, "Moderate": 44, "Low": 18}
_TYPE_BOOST = {"Medical": 12, "Trapped": 10, "Flood": 7, "Fire": 6, "Supplies": 0}
_EARTH_RADIUS_KM = 6371.0


def distance_km(lat_a: float, lon_a: float, lat_b: float, lon_b: float) -> float:
    lat1, lat2 = math.radians(lat_a), math.radians(lat_b)
    dlat = lat2 - lat1
    dlon = math.radians(lon_b - lon_a)
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(value)))


def rank_incidents(incidents: list[dict], base_location: dict | None) -> list[dict]:
    ranked = []
    for incident in incidents:
        item = dict(incident)
        urgency = _SEVERITY_SCORE.get(item.get("severity"), 0) + _TYPE_BOOST.get(item.get("incident_type"), 0)
        item["urgency_score"] = urgency
        item["distance_km"] = None
        priority = float(urgency)
        if base_location and item.get("latitude") is not None and item.get("longitude") is not None:
            distance = distance_km(
                float(item["latitude"]),
                float(item["longitude"]),
                float(base_location["latitude"]),
                float(base_location["longitude"]),
            )
            item["distance_km"] = round(distance, 1)
            priority -= min(distance, 100) * 0.12
        item["priority_score"] = round(priority, 1)
        ranked.append(item)
    return sorted(ranked, key=lambda row: (row["priority_score"], row.get("created_at", "")), reverse=True)


def recommend_dispatch(incidents: list[dict], units: list[dict]) -> list[dict]:
    available = [unit for unit in units if unit.get("status") == "available"]
    used_unit_ids: set[str] = set()
    recommendations = []
    for incident in incidents:
        location_known = incident.get("latitude") is not None and incident.get("longitude") is not None
        compatible = [
            unit for unit in available
            if unit["id"] not in used_unit_ids and incident["incident_type"] in unit.get("supports", [])
        ]
        compatible.sort(
            key=lambda unit: distance_km(
                float(incident["latitude"]),
                float(incident["longitude"]),
                float(unit["latitude"]),
                float(unit["longitude"]),
            ) if location_known else math.inf
        )
        unit = compatible[0] if compatible else None
        unit_distance = None
        reason = "Operator must confirm location before a unit can be selected."
        if unit and location_known:
            unit_distance = round(
                distance_km(
                    float(incident["latitude"]),
                    float(incident["longitude"]),
                    float(unit["latitude"]),
                    float(unit["longitude"]),
                ),
                1,
            )
            reason = "Nearest available compatible unit; operator confirmation required."
            used_unit_ids.add(unit["id"])
        elif not unit:
            reason = "No unused available unit matches this incident type."
        recommendations.append(
            {
                "incident_id": incident["id"],
                "incident_summary": incident["summary"],
                "incident_type": incident["incident_type"],
                "severity": incident["severity"],
                "unit": unit,
                "distance_km": unit_distance,
                "reason": reason,
                "requires_confirmation": True,
            }
        )
    return recommendations
