import { timingSafeEqual } from "node:crypto";
import express from "express";
import multer from "multer";
import { config as defaultConfig } from "./config.js";
import { rankIncidents, recommendDispatch } from "./dispatch.js";
import { createIncident } from "./models.js";
import { addIncident, listData, updateIncident } from "./store.js";
import { classifyDemo, classifyWithGemini, ModelServiceError } from "./triage.js";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function authorized(supplied, expected) {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function createApp({ settings = defaultConfig, store = {} } = {}) {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: settings.maxImageBytes,
      files: 1,
      fields: 1,
      fieldSize: 4000,
    },
    fileFilter: (_req, file, callback) => {
      if (!allowedImageTypes.has(file.mimetype)) {
        const error = new Error("Upload a JPEG, PNG, or WebP image.");
        error.status = 415;
        callback(error);
        return;
      }
      callback(null, true);
    },
  });

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.set("X-Frame-Options", "SAMEORIGIN");
    next();
  });
  app.use("/static", express.static(`${settings.rootDir}/static`));

  app.use("/api", (req, res, next) => {
    if (!settings.dashboardApiKey || req.path === "/health") {
      next();
      return;
    }
    if (!authorized(req.get("X-Dashboard-Key") || "", settings.dashboardApiKey)) {
      res.status(401).json({ detail: "Dashboard key required. Enter the configured key in the dashboard." });
      return;
    }
    next();
  });

  app.get("/", (_req, res) => {
    res.sendFile(`${settings.rootDir}/static/index.html`);
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      ai_provider: settings.aiProvider,
      ai_ready: settings.aiProvider === "demo" || Boolean(settings.geminiApiKey),
      model: settings.aiProvider === "gemini" ? settings.geminiModel : "Local demo rules",
      auth_required: Boolean(settings.dashboardApiKey),
      time: new Date().toISOString(),
    });
  });

  app.get("/api/dashboard", asyncRoute(async (_req, res) => {
    const data = await listData(store.dataFile || settings.dataFile);
    const baseLocation = settings.dispatchBaseLat === null || settings.dispatchBaseLon === null
      ? null
      : { latitude: settings.dispatchBaseLat, longitude: settings.dispatchBaseLon };
    const incidents = rankIncidents(data.incidents, baseLocation);
    const openIncidents = incidents.filter((incident) => incident.status === "open");
    res.json({
      incidents,
      units: data.units,
      recommendations: recommendDispatch(openIncidents, data.units),
      base_location: baseLocation,
      updated_at: data.updated_at,
    });
  }));

  app.post("/api/incidents", upload.single("image"), asyncRoute(async (req, res) => {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const file = req.file || null;
    if (!message && !file) {
      res.status(422).json({ detail: "Add an emergency message or attach a screenshot/photo." });
      return;
    }
    if (message.length > 4000) {
      res.status(413).json({ detail: "Message exceeds the 4,000 character limit." });
      return;
    }

    let analysis;
    let demo = false;
    try {
      if (settings.aiProvider === "gemini") {
        analysis = await classifyWithGemini(message, file, settings);
      } else {
        if (file) throw new ModelServiceError("Image analysis needs AI_PROVIDER=gemini and a configured Gemini API key.");
        analysis = classifyDemo(message);
        demo = true;
      }
    } catch (error) {
      if (error instanceof ModelServiceError) {
        res.status(503).json({ detail: error.message });
        return;
      }
      throw error;
    }

    const incident = createIncident(
      analysis,
      message || "[Image-only emergency report]",
      file && !message ? "image" : file ? "text+image" : "text",
      demo,
    );
    await addIncident(incident, store.dataFile || settings.dataFile);
    res.status(201).json({
      incident,
      ai_provider: demo ? "demo" : "gemini",
      requires_human_review: true,
    });
  }));

  app.patch("/api/incidents/:id/review", asyncRoute(async (req, res) => {
    const incident = await updateIncident(
      req.params.id,
      { reviewed: true, reviewed_at: new Date().toISOString() },
      store.dataFile || settings.dataFile,
    );
    if (!incident) {
      res.status(404).json({ detail: "Incident not found." });
      return;
    }
    res.json({ incident });
  }));

  app.patch("/api/incidents/:id/resolve", asyncRoute(async (req, res) => {
    const incident = await updateIncident(
      req.params.id,
      { status: "resolved", resolved_at: new Date().toISOString() },
      store.dataFile || settings.dataFile,
    );
    if (!incident) {
      res.status(404).json({ detail: "Incident not found." });
      return;
    }
    res.json({ incident });
  }));

  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
      const status = error.code === "LIMIT_FILE_SIZE" || error.code === "LIMIT_FIELD_VALUE" ? 413 : 400;
      res.status(status).json({ detail: status === 413 ? "Upload exceeds the configured size limit." : "Invalid multipart upload." });
      return;
    }
    if (error.status) {
      res.status(error.status).json({ detail: error.message });
      return;
    }
    console.error("RescueMind request failed:", error);
    res.status(500).json({ detail: "The request could not be completed. Check the server log." });
  });

  return app;
}
