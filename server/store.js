import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const demoIncidents = [
  {
    id: "demo-001",
    original_message: "నా తల్లికి శ్వాస తీసుకోవడం కష్టంగా ఉంది. గాంధీ నగర్, హైదరాబాద్.",
    translated_text: "My mother is having difficulty breathing. Gandhi Nagar, Hyderabad.",
    summary: "Older adult with difficulty breathing; needs urgent medical assessment.",
    severity: "Critical",
    incident_type: "Medical",
    location_text: "Gandhi Nagar, Hyderabad",
    latitude: 17.4065,
    longitude: 78.4833,
    confidence: 0.96,
    source_type: "text",
    status: "open",
    reviewed: false,
    demo: true,
    created_at: "2026-10-31T05:42:00+00:00",
  },
  {
    id: "demo-002",
    original_message: "Water is rising fast inside the ground floor near Musi river. Two children are here.",
    translated_text: "Water is rising fast inside the ground floor near the Musi River. Two children are here.",
    summary: "Floodwater entering a ground floor with two children inside.",
    severity: "Critical",
    incident_type: "Flood",
    location_text: "Musi River area, Hyderabad",
    latitude: 17.3714,
    longitude: 78.4814,
    confidence: 0.91,
    source_type: "text",
    status: "open",
    reviewed: false,
    demo: true,
    created_at: "2026-10-31T05:38:00+00:00",
  },
  {
    id: "demo-003",
    original_message: "We are trapped on the roof after the bridge washed away. Near Amberpet.",
    translated_text: "We are trapped on a roof after the bridge washed away. Near Amberpet.",
    summary: "People trapped on a roof with bridge access washed out.",
    severity: "High",
    incident_type: "Trapped",
    location_text: "Amberpet, Hyderabad",
    latitude: 17.3903,
    longitude: 78.5116,
    confidence: 0.89,
    source_type: "text",
    status: "open",
    reviewed: false,
    demo: true,
    created_at: "2026-10-31T05:29:00+00:00",
  },
  {
    id: "demo-004",
    original_message: "மருத்துவ முகாமில் இன்சுலின் மற்றும் குடிநீர் தேவை. అంబర్‌పేట్.",
    translated_text: "The medical camp needs insulin and drinking water. Amberpet.",
    summary: "Relief camp requests insulin and safe drinking water.",
    severity: "High",
    incident_type: "Supplies",
    location_text: "Amberpet, Hyderabad",
    latitude: 17.3981,
    longitude: 78.5078,
    confidence: 0.84,
    source_type: "text",
    status: "open",
    reviewed: false,
    demo: true,
    created_at: "2026-10-31T05:20:00+00:00",
  },
  {
    id: "demo-005",
    original_message: "Smoke seen from a shop on the first floor, no flames visible yet. Secunderabad.",
    translated_text: "Smoke is visible from a first-floor shop; no flames are visible yet. Secunderabad.",
    summary: "Smoke reported from a first-floor shop; no flames confirmed.",
    severity: "Moderate",
    incident_type: "Fire",
    location_text: "Secunderabad",
    latitude: 17.4399,
    longitude: 78.4983,
    confidence: 0.79,
    source_type: "text",
    status: "open",
    reviewed: false,
    demo: true,
    created_at: "2026-10-31T05:10:00+00:00",
  },
  {
    id: "demo-006",
    original_message: "Need blankets and dry food for 12 families at the school shelter in Tarnaka.",
    translated_text: "Blankets and dry food are needed for 12 families at the school shelter in Tarnaka.",
    summary: "Shelter requests blankets and dry food for 12 families.",
    severity: "Moderate",
    incident_type: "Supplies",
    location_text: "Tarnaka, Hyderabad",
    latitude: 17.4281,
    longitude: 78.5388,
    confidence: 0.82,
    source_type: "text",
    status: "open",
    reviewed: false,
    demo: true,
    created_at: "2026-10-31T04:54:00+00:00",
  },
];

const demoUnits = [
  { id: "unit-01", name: "Ambulance 04", unit_type: "Ambulance", supports: ["Medical"], status: "available", latitude: 17.401, longitude: 78.474 },
  { id: "unit-02", name: "Rescue Boat 02", unit_type: "Boat", supports: ["Flood", "Trapped"], status: "available", latitude: 17.365, longitude: 78.493 },
  { id: "unit-03", name: "Relief Team 07", unit_type: "Relief team", supports: ["Supplies", "Trapped", "Flood"], status: "available", latitude: 17.414, longitude: 78.522 },
  { id: "unit-04", name: "Fire Crew 03", unit_type: "Fire crew", supports: ["Fire"], status: "available", latitude: 17.435, longitude: 78.489 },
  { id: "unit-05", name: "Ambulance 09", unit_type: "Ambulance", supports: ["Medical"], status: "available", latitude: 17.423, longitude: 78.535 },
  { id: "unit-06", name: "Relief Team 11", unit_type: "Relief team", supports: ["Supplies", "Flood"], status: "busy", latitude: 17.389, longitude: 78.459 },
];

let writeQueue = Promise.resolve();

function initialStore() {
  return {
    incidents: structuredClone(demoIncidents),
    units: structuredClone(demoUnits),
    updated_at: new Date().toISOString(),
  };
}

async function writeStore(data, file) {
  await mkdir(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(tempFile, "wx");
    await handle.writeFile(JSON.stringify(data, null, 2), "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(tempFile, file);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await rm(tempFile, { force: true }).catch(() => {});
    throw error;
  }
}

async function readStore(file) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const data = initialStore();
    await writeStore(data, file);
    return data;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`Unable to parse the RescueMind data file at ${file}`, { cause: error });
  }
  if (!data || !Array.isArray(data.incidents) || !Array.isArray(data.units)) {
    throw new Error(`The RescueMind data file at ${file} has an invalid structure`);
  }
  return data;
}

function serialize(operation) {
  const next = writeQueue.then(operation);
  writeQueue = next.catch(() => {});
  return next;
}

export function listData(file = config.dataFile) {
  return serialize(() => readStore(file));
}

export function addIncident(incident, file = config.dataFile) {
  return serialize(async () => {
    const data = await readStore(file);
    data.incidents.push(incident);
    data.updated_at = new Date().toISOString();
    await writeStore(data, file);
    return incident;
  });
}

export function updateIncident(id, changes, file = config.dataFile) {
  return serialize(async () => {
    const data = await readStore(file);
    const incident = data.incidents.find((item) => item.id === id);
    if (!incident) return null;
    Object.assign(incident, changes);
    data.updated_at = new Date().toISOString();
    await writeStore(data, file);
    return incident;
  });
}
