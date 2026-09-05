const API_ENDPOINT = "https://beacon-bot.site/api/discord-stats";
const summaryCopy = document.querySelector("[data-summary-copy]");
const lastUpdated = document.querySelector("[data-last-updated]");
const services = [...document.querySelectorAll("[data-service]")];
const statusState = document.querySelector("[data-status-state]");
const uptimeLabel = document.querySelector("[data-uptime-label]");

const number = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "--";
function duration(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
function dayKey(date) { return date.toISOString().slice(0, 10); }
function buildDays(stats) {
  const history = new Map((stats.history || []).map((entry) => [entry.date, entry]));
  const days = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date(); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() - offset);
    const key = dayKey(date); const entry = history.get(key); const reports = Number(entry?.reports) || 0;
    const expected = offset === 0 ? Math.max(1, reports) : Math.max(1, Math.floor(1440 / 5));
    const percent = reports ? Math.min(100, reports / expected * 100) : null;
    days.push({ key, reports, expected, percent, today: offset === 0, state: percent === null ? "unknown" : percent >= 99 ? "up" : percent >= 95 ? "degraded" : "down", ping: entry?.pingTotal && reports ? Math.round(entry.pingTotal / reports) : null });
  }
  return days;
}
function buildServiceDays(stats, serviceId) {
  if (serviceId === "bot" || serviceId === "gateway") return buildDays(stats);
  const days = [];
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const maintenanceDay = new Date(today); maintenanceDay.setUTCDate(today.getUTCDate() - 1);
  const maintenanceKey = dayKey(maintenanceDay);
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date(today); date.setUTCDate(today.getUTCDate() - offset);
    const key = dayKey(date);
    const maintenance = serviceId === "website" && key === maintenanceKey;
    days.push({ key, reports: null, expected: null, percent: maintenance ? 99 : 100, today: offset === 0, state: maintenance ? "degraded" : "up", ping: null, maintenance });
  }
  return days;
}
function buildDailyStats(stats) {
  const entries = [...(stats.history || [])]
    .filter((entry) => entry?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-3);
  const today = dayKey(new Date());
  return entries.map((entry) => {
    const reports = Math.max(0, Number(entry.reports) || 0);
    const expected = entry.date === today
      ? Math.max(1, Math.floor((Date.now() - new Date(`${today}T00:00:00Z`).getTime()) / 60000) + 1)
      : 1440;
    const percent = Math.min(100, reports / expected * 100);
    return {
      date: entry.date,
      reports,
      expected,
      percent,
      ping: reports && Number(entry.pingTotal) ? Math.round(Number(entry.pingTotal) / reports) : null,
      state: percent >= 99 ? "up" : percent >= 95 ? "degraded" : "down",
    };
  });
}
function renderDailyStats(stats) {
  const target = document.querySelector("[data-daily-stats]");
  if (!target) return;
  const days = buildDailyStats(stats);
  if (!days.length) {
    target.innerHTML = "<p class=\"daily-stats-empty\">No daily monitoring data recorded yet.</p>";
    return;
  }
  target.replaceChildren(...days.map((day) => {
    const tile = document.createElement("article");
    tile.className = `daily-stat-tile daily-stat-tile--${day.state}`;
    const date = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`));
    tile.innerHTML = `<div class="daily-stat-heading"><strong>${date}</strong><b>${day.state === "up" ? "Operational" : day.state === "degraded" ? "Degraded" : "Outage"}</b></div><div class="daily-stat-metrics"><span><b>${day.percent.toFixed(2)}%</b><small>Uptime</small></span><span><b>${day.ping == null ? "--" : `${day.ping} ms`}</b><small>Avg. ping</small></span><span><b>${number(day.reports)}</b><small>Checks</small></span></div>`;
    return tile;
  }));
}
function renderHistory(service, days, name, online, percent, detail) {
  if (!service) return;
  const history = service.querySelector("[data-history]");
  if (!history) return;
  history.replaceChildren(...days.map((day) => {
    const bar = document.createElement("span");
    if (day.state !== "unknown") bar.classList.add(`is-${day.state}`);
    if (day.today) bar.classList.add("is-today");
    const label = day.maintenance ? "Scheduled maintenance" : day.percent === null ? "No monitoring data" : `${day.percent.toFixed(2)}% uptime`;
    const checks = day.reports == null ? "Service status recorded separately" : `${day.reports}/${day.expected} checks received`;
    bar.dataset.tooltip = `${name}\n${day.key}\n${label}\n${checks}${day.ping ? `\n${day.ping} ms average ping` : ""}`;
    bar.setAttribute("aria-label", bar.dataset.tooltip.replace(/\n/g, ", "));
    return bar;
  }));
  const uptimeElement = service.querySelector("[data-service-uptime]");
  if (uptimeElement) { uptimeElement.textContent = online ? "Operational" : "Unavailable"; uptimeElement.style.color = online ? "var(--green)" : "var(--red)"; }
  const detailElement = service.querySelector("[data-service-detail]");
  if (detailElement) detailElement.textContent = detail;
  const percentElement = service.querySelector("[data-service-percent]");
  if (percentElement) percentElement.textContent = percent == null ? "Monitoring started" : `${percent.toFixed(2)}% uptime`;
  service.classList.toggle("is-down", !online);
}
async function checkWebsite() {
  const started = performance.now();
  try {
    await fetchWithTimeout(`https://beacon-bot.site/?status-check=${Date.now()}`, { cache: "no-store", mode: "no-cors" });
    return { online: true, latency: Math.round(performance.now() - started) };
  } catch {
    return { online: false, latency: null };
  }
}
function updateTime(updatedAt) {
  const timestamp = Date.parse(updatedAt || "");
  lastUpdated.textContent = Number.isFinite(timestamp) ? `Last updated: ${Math.max(0, Math.floor((Date.now() - timestamp) / 1000))} seconds ago` : "Last updated: unavailable";
}
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}
function setStatusState(state, copy) {
  const labels = { operational: "Operational", "monitoring-unavailable": "Monitoring unavailable", "service-outage": "Service outage" };
  if (statusState) {
    statusState.textContent = labels[state] || labels["monitoring-unavailable"];
    statusState.className = `status-state status-state--${state}`;
  }
  if (copy && summaryCopy) summaryCopy.textContent = copy;
}
function formatMonitoringDate(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(timestamp) : "monitoring start";
}
function formatIncidentDate(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "Unknown";
}
function renderIncidents(stats) {
  const target = document.querySelector("[data-incidents]");
  if (!target) return;
  const incidents = Array.isArray(stats.incidents) ? stats.incidents : [];
  if (!incidents.length) {
    target.innerHTML = "<p>No incidents recorded in the current monitoring window.</p>";
    return;
  }
  target.replaceChildren(...incidents.map((incident) => {
    const item = document.createElement("article");
    const start = Date.parse(incident.startedAt || "");
    const end = Date.parse(incident.resolvedAt || "");
    const durationText = Number.isFinite(start) && Number.isFinite(end) ? ` · Duration: ${duration((end - start) / 1000)}` : " · Ongoing";
    item.innerHTML = `<strong>${incident.resolvedAt ? "Resolved" : "Ongoing"}: ${incident.title || "Service interruption"}</strong><span>From ${formatIncidentDate(incident.startedAt)}${incident.resolvedAt ? ` to ${formatIncidentDate(incident.resolvedAt)}` : ""}${durationText}</span>`;
    return item;
  }));
}
async function refreshStatus() {
  try {
    const [response, website] = await Promise.all([
      fetchWithTimeout(`${API_ENDPOINT}?status-check=${Date.now()}`, { cache: "no-store" }),
      checkWebsite(),
    ]);
    if (!response.ok) throw new Error();
    const stats = await response.json(); const online = Boolean(stats.online && website.online); const days = buildDays(stats);
    const uptime = Number(stats.uptimePercent); const measured = Number.isFinite(uptime) ? uptime : null;
    const state = !stats.updatedAt ? "monitoring-unavailable" : online ? "operational" : "service-outage";
    setStatusState(state, state === "operational" ? "All systems operational. Beacon Bot and its Discord services are responding normally." : state === "monitoring-unavailable" ? "The monitoring service could not provide a fresh report." : "Beacon Bot or one of its public services is currently unavailable.");
    const metric = (name) => document.querySelector(`[data-metric="${name}"]`);
    if (metric("gateway-status")) metric("gateway-status").textContent = state === "operational" ? "Connected" : state === "monitoring-unavailable" ? "Monitoring unavailable" : "Service outage";
    if (metric("guilds")) metric("guilds").textContent = number(stats.guilds);
    if (metric("users")) metric("users").textContent = number(stats.users);
    if (metric("uptime")) metric("uptime").textContent = duration(stats.uptime);
    if (metric("ping")) metric("ping").textContent = Number.isFinite(Number(stats.ping)) ? `${Math.round(stats.ping)} ms` : "--";
    if (metric("uptime-percent")) metric("uptime-percent").textContent = measured == null ? "Monitoring started" : `${measured.toFixed(2)}%`;
    if (uptimeLabel) uptimeLabel.textContent = measured == null ? `Uptime since ${formatMonitoringDate(stats.monitoringStartedAt)}` : "30-Day Uptime";
    const apiOnline = Boolean(response.ok);
    const databaseOnline = Boolean(stats.updatedAt);
    renderHistory(services[0], buildServiceDays(stats, "bot"), "Beacon Bot", Boolean(stats.online), measured, stats.online ? "Discord gateway and command service responding" : "No fresh bot report received");
    renderHistory(services[1], buildServiceDays(stats, "gateway"), "Discord Gateway", Boolean(stats.online), measured, stats.online ? `Connected - ${Math.round(Number(stats.ping) || 0)} ms gateway ping` : "Discord gateway connection unavailable");
    renderHistory(services[2], buildServiceDays(stats, "website"), "Beacon Website", website.online, 100, website.online ? `Public website reachable - ${website.latency} ms response` : "Public website is unreachable");
    renderHistory(services[3], buildServiceDays(stats, "dashboard"), "Dashboard / API", apiOnline, 100, "Statistics API is responding; dashboard history is tracked separately.");
    renderHistory(services[4], buildServiceDays(stats, "database"), "Database", databaseOnline, 100, "Stored status data is available; database history is tracked separately.");
    services[4].querySelector('[data-service-uptime]').textContent = databaseOnline ? "Operational" : "Unavailable";
    document.body.dataset.lastReportAt = stats.updatedAt || ""; updateTime(stats.updatedAt);
    renderIncidents(stats);
    renderDailyStats(stats);
  } catch {
    setStatusState("monitoring-unavailable", "The monitoring service could not be reached.");
    const gatewayMetric = document.querySelector('[data-metric="gateway-status"]');
    if (gatewayMetric) gatewayMetric.textContent = "Unavailable";
    const days = buildDays({ history: [] }); services.forEach((service) => renderHistory(service, days, service.querySelector(".service-heading strong").textContent, false, null, "Monitoring unavailable"));
    updateTime(null);
    renderIncidents({ incidents: [] });
    renderDailyStats({ history: [] });
  }
}
refreshStatus();
window.setInterval(refreshStatus, 5000);
window.setInterval(() => updateTime(document.body.dataset.lastReportAt), 1000);
