import { randomUUID } from "node:crypto";
import { z } from "zod";

export const Severity = Object.freeze({
  critical: "Critical",
  high: "High",
  moderate: "Moderate",
  low: "Low",
});

export const IncidentType = Object.freeze({
  medical: "Medical",
  flood: "Flood",
  fire: "Fire",
  trapped: "Trapped",
  supplies: "Supplies",
});

export const IncidentAnalysisSchema = z.object({
  translated_text: z.string().min(1).max(4000),
  summary: z.string().min(1).max(500),
  severity: z.enum(["Critical", "High", "Moderate", "Low"]),
  incident_type: z.enum(["Medical", "Flood", "Fire", "Trapped", "Supplies"]),
  location_text: z.string().max(240).default(""),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  confidence: z.number().min(0).max(1),
}).strict();

export function createIncident(analysis, originalMessage, sourceType, demo) {
  return {
    id: randomUUID(),
    original_message: originalMessage,
    translated_text: analysis.translated_text,
    summary: analysis.summary,
    severity: analysis.severity,
    incident_type: analysis.incident_type,
    location_text: analysis.location_text || "Location not confirmed",
    latitude: analysis.latitude,
    longitude: analysis.longitude,
    confidence: analysis.confidence,
    source_type: sourceType,
    status: "open",
    reviewed: false,
    demo,
    created_at: new Date().toISOString(),
  };
}
