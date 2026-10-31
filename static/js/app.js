const state = { map: null, markers: null, data: null, apiKey: sessionStorage.getItem("rescuemind-api-key") || "" };

const severityColor = {
  Critical: "#ef6964",
  High: "#f6a84b",
  Moderate: "#38bdf8",
  Low: "#8da0a1",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

async function api(url, options = {}, canPrompt = true) {
  const headers = new Headers(options.headers || {});
  if (state.apiKey) headers.set("X-Dashboard-Key", state.apiKey);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 && canPrompt) {
    const entered = window.prompt("Enter the RescueMind dashboard API key configured by your administrator:");
    if (entered === null || !entered.trim()) throw new Error("Dashboard key is required to access incident data.");
    state.apiKey = entered.trim();
    sessionStorage.setItem("rescuemind-api-key", state.apiKey);
    return api(url, options, false);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `Request failed (${response.status}).`);
  return payload;
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Time not recorded";
  const minutes = Math.max(0, Math.floor((Date.now() - date.valueOf()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function initializeMap(base) {
  if (state.map) return;
  const center = base ? [base.latitude, base.longitude] : [17.385, 78.4867];
  state.map = L.map("map", { scrollWheelZoom: false, zoomControl: true }).setView(center, 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.map);
  state.markers = L.layerGroup().addTo(state.map);
}

function renderMap(incidents, base) {
  if (typeof L === "undefined") {
    document.getElementById("map-empty").textContent = "Interactive map unavailable; report locations remain available in the priority queue.";
    document.getElementById("map-empty").classList.remove("hidden");
    document.getElementById("map-location-label").textContent = "MAP OFFLINE";
    return;
  }
  initializeMap(base);
  state.markers.clearLayers();
  const located = incidents.filter((item) => item.latitude !== null && item.longitude !== null);
  document.getElementById("map-empty").classList.toggle("hidden", located.length > 0);
  for (const incident of located) {
    const color = severityColor[incident.severity] || severityColor.Low;
    const marker = L.circleMarker([incident.latitude, incident.longitude], {
      radius: incident.severity === "Critical" ? 9 : 7,
      color,
      fillColor: color,
      fillOpacity: 0.86,
      weight: 2,
    });
    marker.bindPopup(`<strong>${escapeHtml(incident.incident_type)} · ${escapeHtml(incident.severity)}</strong><br>${escapeHtml(incident.location_text)}<br><span>${escapeHtml(incident.summary)}</span>`);
    marker.addTo(state.markers);
  }
  if (base) {
    L.circleMarker([base.latitude, base.longitude], {
      radius: 5, color: "#6bd4b0", fillColor: "#6bd4b0", fillOpacity: 1, weight: 2,
    }).bindPopup("Configured dispatch centre").addTo(state.markers);
  }
  document.getElementById("map-location-label").textContent = base
    ? `${base.latitude.toFixed(3)}, ${base.longitude.toFixed(3)}`
    : "NO CENTRE SET";
  window.setTimeout(() => state.map.invalidateSize(), 50);
}

function incidentCard(item) {
  const color = severityColor[item.severity] || severityColor.Low;
  const coordinates = item.latitude === null || item.longitude === null
    ? "Coordinates not confirmed"
    : `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`;
  const coordinate = item.distance_km === null ? coordinates : `${coordinates} · ${item.distance_km.toFixed(1)} km`;
  const badge = item.demo ? '<span class="ml-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-muted">SAMPLE</span>' : "";
  const review = item.reviewed ? "Reviewed" : "Needs review";
  return `<article class="px-4 py-3.5 sm:px-5">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-1.5"><span class="rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide" style="color:${color};background:${color}1c">${escapeHtml(item.severity)}</span><span class="text-xs text-muted">${escapeHtml(item.incident_type)}</span>${badge}</div>
        <h3 class="mt-2 truncate text-sm font-medium">${escapeHtml(item.location_text || "Location not confirmed")}</h3>
        <p class="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">${escapeHtml(item.summary)}</p>
        <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted"><span>${escapeHtml(coordinate)}</span><span>${relativeTime(item.created_at)}</span><span>${escapeHtml(review)}</span></div>
      </div>
      <div class="shrink-0 text-right"><strong class="font-mono text-lg" style="color:${color}">${escapeHtml(item.priority_score)}</strong><span class="block text-[9px] uppercase text-muted">priority</span>
      ${item.reviewed ? "" : `<button class="review-button mt-2 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:border-mint/50 hover:text-mint" data-id="${escapeHtml(item.id)}" type="button">Mark reviewed</button>`}</div>
    </div>
  </article>`;
}

function dispatchCard(item) {
  const unit = item.unit;
  const assignment = unit
    ? `<strong class="text-sm text-slate-100">${escapeHtml(unit.name)}</strong><span class="mt-1 block text-xs text-muted">${escapeHtml(unit.unit_type)}${item.distance_km === null ? "" : ` · ${item.distance_km.toFixed(1)} km`}</span>`
    : '<strong class="text-sm text-signal">No unit matched</strong><span class="mt-1 block text-xs text-muted">Confirm location or unit availability</span>';
  return `<article class="bg-panel p-4">
    <div class="flex items-start justify-between gap-3"><div class="min-w-0"><span class="font-mono text-[10px] uppercase tracking-wide text-signal">${escapeHtml(item.severity)} · ${escapeHtml(item.incident_type)}</span><p class="mt-1 truncate text-xs text-muted">${escapeHtml(item.incident_summary)}</p></div><span class="rounded-full border border-signal/20 px-2 py-1 text-[9px] uppercase text-signal">Proposed</span></div>
    <div class="mt-4 border-t border-white/[0.07] pt-3">${assignment}</div>
    <p class="mt-2 text-[10px] leading-4 text-muted">${escapeHtml(item.reason)}</p>
  </article>`;
}

function render(data) {
  state.data = data;
  const open = data.incidents.filter((item) => item.status === "open");
  const critical = open.filter((item) => item.severity === "Critical").length;
  const availableUnits = data.units.filter((unit) => unit.status === "available").length;
  const awaiting = open.filter((item) => !item.reviewed).length;
  document.getElementById("metric-open").textContent = String(open.length).padStart(2, "0");
  document.getElementById("metric-critical").textContent = String(critical).padStart(2, "0");
  document.getElementById("metric-units").textContent = String(availableUnits).padStart(2, "0");
  document.getElementById("metric-review").textContent = String(awaiting).padStart(2, "0");
  document.getElementById("incident-list").innerHTML = open.length
    ? open.map(incidentCard).join("")
    : '<div class="px-5 py-8 text-center text-sm text-muted">No open reports. Incoming messages will appear here.</div>';
  document.getElementById("dispatch-list").innerHTML = data.recommendations.length
    ? data.recommendations.map(dispatchCard).join("")
    : '<div class="col-span-full bg-panel px-5 py-6 text-sm text-muted">No dispatch suggestions while the queue is empty.</div>';
  document.getElementById("updated-at").textContent = `Synced ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  renderMap(open, data.base_location);
  document.querySelectorAll(".review-button").forEach((button) => {
    button.addEventListener("click", () => markReviewed(button.dataset.id));
  });
}

async function loadDashboard() {
  const pill = document.getElementById("connection-pill");
  const label = document.getElementById("connection-label");
  try {
    const [health, dashboard] = await Promise.all([api("/api/health"), api("/api/dashboard")]);
    label.textContent = health.ai_provider === "demo" ? "Demo triage" : health.ai_ready ? health.model : "AI not configured";
    pill.querySelector("span").className = `h-2 w-2 rounded-full ${health.ai_ready ? "bg-mint" : "bg-danger"}`;
    pill.title = health.ai_provider === "demo"
      ? "Local rules active. Sample records are simulated."
      : health.ai_ready ? `Provider: ${health.ai_provider}; model: ${health.model}` : "Set GEMINI_API_KEY to enable triage.";
    render(dashboard);
  } catch (error) {
    label.textContent = "Connection issue";
    pill.querySelector("span").className = "h-2 w-2 rounded-full bg-danger";
    document.getElementById("incident-list").innerHTML = `<div class="px-5 py-8 text-sm text-danger">${escapeHtml(error.message)}</div>`;
  }
}

async function markReviewed(id) {
  try {
    await api(`/api/incidents/${encodeURIComponent(id)}/review`, { method: "PATCH" });
    await loadDashboard();
  } catch (error) {
    window.alert(error.message);
  }
}

const dialog = document.getElementById("report-dialog");
document.getElementById("new-report-button").addEventListener("click", () => dialog.showModal());
document.getElementById("close-dialog").addEventListener("click", () => dialog.close());
document.getElementById("refresh-button").addEventListener("click", loadDashboard);

document.getElementById("report-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById("submit-report");
  const errorBox = document.getElementById("form-error");
  const successBox = document.getElementById("form-success");
  errorBox.classList.add("hidden");
  successBox.classList.add("hidden");
  button.disabled = true;
  button.textContent = "Analyzing…";
  try {
    const formData = new FormData(form);
    const result = await api("/api/incidents", { method: "POST", body: formData });
    successBox.textContent = `Added ${result.incident.severity} ${result.incident.incident_type} report. Operator review required${result.incident.demo ? " · demo rules used" : ""}.`;
    successBox.classList.remove("hidden");
    form.reset();
    await loadDashboard();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = "Analyze & add report";
  }
});

loadDashboard();
window.setInterval(loadDashboard, 30000);
