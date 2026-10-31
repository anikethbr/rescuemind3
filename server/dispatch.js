const severityScore = { Critical: 100, High: 72, Moderate: 44, Low: 18 };
const typeBoost = { Medical: 12, Trapped: 10, Flood: 7, Fire: 6, Supplies: 0 };
const earthRadiusKm = 6371;

export function distanceKm(latA, lonA, latB, lonB) {
  const lat1 = (latA * Math.PI) / 180;
  const lat2 = (latB * Math.PI) / 180;
  const deltaLat = lat2 - lat1;
  const deltaLon = ((lonB - lonA) * Math.PI) / 180;
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(value)));
}

export function rankIncidents(incidents, baseLocation) {
  return incidents.map((incident) => {
    const urgency = (severityScore[incident.severity] || 0) + (typeBoost[incident.incident_type] || 0);
    let distance = null;
    let priority = urgency;
    if (baseLocation && incident.latitude !== null && incident.latitude !== undefined
      && incident.longitude !== null && incident.longitude !== undefined) {
      distance = distanceKm(incident.latitude, incident.longitude, baseLocation.latitude, baseLocation.longitude);
      priority -= Math.min(distance, 100) * 0.12;
    }
    return {
      ...incident,
      urgency_score: urgency,
      distance_km: distance === null ? null : Number(distance.toFixed(1)),
      priority_score: Number(priority.toFixed(1)),
    };
  }).sort((a, b) => b.priority_score - a.priority_score
    || b.created_at.localeCompare(a.created_at));
}

export function recommendDispatch(incidents, units) {
  const available = units.filter((unit) => unit.status === "available");
  const usedUnits = new Set();
  return incidents.map((incident) => {
    const locationKnown = incident.latitude !== null && incident.latitude !== undefined
      && incident.longitude !== null && incident.longitude !== undefined;
    const compatible = (locationKnown ? available : [])
      .filter((unit) => !usedUnits.has(unit.id) && unit.supports.includes(incident.incident_type))
      .sort((a, b) => {
        return distanceKm(incident.latitude, incident.longitude, a.latitude, a.longitude)
          - distanceKm(incident.latitude, incident.longitude, b.latitude, b.longitude);
      });
    const unit = compatible[0] || null;
    let unitDistance = null;
    let reason = "Operator must confirm location before a unit can be selected.";
    if (unit && locationKnown) {
      unitDistance = Number(distanceKm(
        incident.latitude,
        incident.longitude,
        unit.latitude,
        unit.longitude,
      ).toFixed(1));
      reason = "Nearest available compatible unit; operator confirmation required.";
      usedUnits.add(unit.id);
    } else if (locationKnown && !unit) {
      reason = "No unused available unit matches this incident type.";
    }
    return {
      incident_id: incident.id,
      incident_summary: incident.summary,
      incident_type: incident.incident_type,
      severity: incident.severity,
      unit,
      distance_km: unitDistance,
      reason,
      requires_confirmation: true,
    };
  });
}
