import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../server/app.js";
import { rankIncidents, recommendDispatch, distanceKm } from "../server/dispatch.js";
import { loadConfig } from "../server/config.js";
import { classifyDemo } from "../server/triage.js";

test("distance is zero at the same coordinates", () => {
  assert.equal(distanceKm(17.385, 78.486, 17.385, 78.486), 0);
});

test("ranking preserves urgency tiers and prefers nearer reports within a tier", () => {
  const incidents = [
    { id: "far-critical", severity: "Critical", incident_type: "Medical", latitude: 18, longitude: 78, created_at: "2026-01-01" },
    { id: "near-high", severity: "High", incident_type: "Trapped", latitude: 17.386, longitude: 78.486, created_at: "2026-01-02" },
    { id: "far-high", severity: "High", incident_type: "Trapped", latitude: 18, longitude: 78, created_at: "2026-01-03" },
  ];
  const ranked = rankIncidents(incidents, { latitude: 17.385, longitude: 78.486 });
  assert.equal(ranked[0].id, "far-critical");
  assert.ok(ranked.find((item) => item.id === "far-high").priority_score
    < ranked.find((item) => item.id === "near-high").priority_score);
});

test("dispatch chooses a distinct available compatible unit and waits for coordinates", () => {
  const incidents = [
    { id: "i1", summary: "Breathing issue", severity: "Critical", incident_type: "Medical", latitude: 17.4, longitude: 78.5 },
    { id: "i2", summary: "Injury", severity: "High", incident_type: "Medical", latitude: 17.41, longitude: 78.51 },
    { id: "i3", summary: "Unknown location", severity: "High", incident_type: "Medical", latitude: null, longitude: null },
  ];
  const units = [
    { id: "u1", name: "Ambulance 1", supports: ["Medical"], status: "available", latitude: 17.4, longitude: 78.5 },
    { id: "u2", name: "Ambulance 2", supports: ["Medical"], status: "available", latitude: 17.41, longitude: 78.51 },
    { id: "u3", name: "Busy ambulance", supports: ["Medical"], status: "busy", latitude: 17.4, longitude: 78.5 },
  ];
  const recommendations = recommendDispatch(incidents, units);
  assert.equal(recommendations[0].unit.id, "u1");
  assert.equal(recommendations[1].unit.id, "u2");
  assert.equal(recommendations[2].unit, null);
  assert.match(recommendations[2].reason, /confirm location/i);
  assert.ok(recommendations.every((item) => item.requires_confirmation));
});

test("demo triage marks breathing difficulty critical and extracts explicit coordinates", () => {
  const result = classifyDemo("Urgent medical help: difficulty breathing at 17.3900, 78.4800.");
  assert.equal(result.severity, "Critical");
  assert.equal(result.incident_type, "Medical");
  assert.equal(result.latitude, 17.39);
  assert.equal(result.longitude, 78.48);
});

test("HTTP API exposes health, protects dashboard, and accepts a demo report", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rescuemind-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const settings = {
    ...loadConfig({
      AI_PROVIDER: "demo",
      DASHBOARD_API_KEY: "test-secret",
      DISPATCH_BASE_LAT: "17.385",
      DISPATCH_BASE_LON: "78.4867",
      PORT: "8000",
    }),
    dataFile: path.join(directory, "data.json"),
  };
  const server = createServer(createApp({ settings }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");

  const denied = await fetch(`${baseUrl}/api/dashboard`);
  assert.equal(denied.status, 401);

  const headers = { "X-Dashboard-Key": "test-secret" };
  const dashboard = await fetch(`${baseUrl}/api/dashboard`, { headers });
  assert.equal(dashboard.status, 200);
  assert.equal((await dashboard.json()).incidents.length, 6);

  const form = new FormData();
  form.set("message", "A person is trapped near the bridge, urgent help needed.");
  const created = await fetch(`${baseUrl}/api/incidents`, { method: "POST", headers, body: form });
  assert.equal(created.status, 201);
  const payload = await created.json();
  assert.equal(payload.incident.incident_type, "Trapped");
  assert.equal(payload.incident.reviewed, false);
  assert.equal(payload.requires_human_review, true);

  const reviewed = await fetch(`${baseUrl}/api/incidents/${payload.incident.id}/review`, { method: "PATCH", headers });
  assert.equal(reviewed.status, 200);
  assert.equal((await reviewed.json()).incident.reviewed, true);
});

test("configuration rejects invalid port and coordinate values", () => {
  assert.throws(() => loadConfig({ PORT: "not-a-port" }), /PORT must be an integer/);
  assert.throws(() => loadConfig({ DISPATCH_BASE_LAT: "91" }), /between -90 and 90/);
});
