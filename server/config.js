import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadConfig(env = process.env) {
  const latitude = optionalNumberFrom(env, "DISPATCH_BASE_LAT");
  const longitude = optionalNumberFrom(env, "DISPATCH_BASE_LON");
  const maxImageBytes = integerFrom(env, "MAX_IMAGE_BYTES", 5 * 1024 * 1024);
  const port = integerFrom(env, "PORT", 8000);
  const provider = (env.AI_PROVIDER || "demo").trim().toLowerCase();
  const dashboardApiKey = (env.DASHBOARD_API_KEY || "").trim();

  if (!["demo", "gemini"].includes(provider)) throw new Error("AI_PROVIDER must be 'demo' or 'gemini'");
  if (latitude !== null && (latitude < -90 || latitude > 90)) throw new Error("DISPATCH_BASE_LAT must be between -90 and 90");
  if (longitude !== null && (longitude < -180 || longitude > 180)) throw new Error("DISPATCH_BASE_LON must be between -180 and 180");
  if (maxImageBytes < 1) throw new Error("MAX_IMAGE_BYTES must be positive");
  if (port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
  if (env.NODE_ENV === "production" && dashboardApiKey.length < 32) {
    throw new Error("DASHBOARD_API_KEY must contain at least 32 characters in production");
  }

  return {
    aiProvider: provider,
    geminiApiKey: (env.GEMINI_API_KEY || "").trim(),
    geminiModel: (env.GEMINI_MODEL || "gemma-4-e4b-it").trim(),
    geminiApiBaseUrl: (env.GEMINI_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, ""),
    dashboardApiKey,
    dispatchBaseLat: latitude,
    dispatchBaseLon: longitude,
    maxImageBytes,
    port,
    host: env.HOST || "0.0.0.0",
    dataFile: path.resolve(rootDir, env.DATA_FILE || "data/rescuemind.json"),
    rootDir,
  };
}

function optionalNumberFrom(env, name) {
  const value = env[name]?.trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number`);
  return parsed;
}

function integerFrom(env, name, fallback) {
  const value = env[name];
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

export const config = loadConfig();
