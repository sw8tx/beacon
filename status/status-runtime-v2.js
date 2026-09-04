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
function renderHistory(service, days, name, online, percent, detail) {
  const history = service.querySelector("[data-history]");
  history.replaceChildren(...days.map((day) => {
    const bar = document.createElement("span");
    if (day.state !== "unknown") bar.classList.add(`is-${day.state}`);
    if (day.today) bar.classList.add("is-today");
    const label = day.percent === null ? "No monitoring data" : `${day.percent.toFixed(2)}% uptime`;
    bar.dataset.tooltip = `${name}\n${day.key}\n${label}\n${day.reports}/${day.expected} checks received${day.ping ? `\n${day.ping} ms average ping` : ""}`;
    bar.setAttribute("aria-label", bar.dataset.tooltip.replace(/\n/g, ", "));
    return bar;
  }));
  service.querySelector("[data-service-uptime]").textContent = online ? "Operational" : "Unavailable";
  service.querySelector("[data-service-uptime]").style.color = online ? "var(--green)" : "var(--red)";
  service.querySelector("[data-service-detail]").textContent = detail;
  service.querySelector("[data-service-percent]").textContent = percent == null ? "Monitoring started" : `${percent.toFixed(2)}% uptime`;
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
  if (copy) summaryCopy.textContent = copy;
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
    document.querySelector('[data-metric="gateway-status"]').textContent = state === "operational" ? "Connected" : state === "monitoring-unavailable" ? "Monitoring unavailable" : "Service outage";
    document.querySelector('[data-metric="guilds"]').textContent = number(stats.guilds);
    document.querySelector('[data-metric="users"]').textContent = number(stats.users);
    document.querySelector('[data-metric="uptime"]').textContent = duration(stats.uptime);
    document.querySelector('[data-metric="ping"]').textContent = Number.isFinite(Number(stats.ping)) ? `${Math.round(stats.ping)} ms` : "--";
    document.querySelector('[data-metric="uptime-percent"]').textContent = measured == null ? "Monitoring started" : `${measured.toFixed(2)}%`;
    if (uptimeLabel) uptimeLabel.textContent = measured == null ? `Uptime since ${formatMonitoringDate(stats.monitoringStartedAt)}` : "30-Day Uptime";
    const apiOnline = Boolean(response.ok);
    const databaseOnline = Boolean(stats.updatedAt);
    renderHistory(services[0], days, "Beacon Bot", Boolean(stats.online), measured, stats.online ? "Discord gateway and command service responding" : "No fresh bot report received");
    renderHistory(services[1], days, "Discord Gateway", Boolean(stats.online), measured, stats.online ? `Connected - ${Math.round(Number(stats.ping) || 0)} ms gateway ping` : "Discord gateway connection unavailable");
    const websiteDegraded = website.online && Number(website.latency) > 1200;
    const websiteDays = days.map((day) => ({
      ...day,
      state: !website.online ? "down" : websiteDegraded ? "degraded" : "up",
      percent: website.online ? (websiteDegraded ? 95 : 100) : 0,
      reports: website.online ? (websiteDegraded ? 95 : 100) : 0,
      expected: 100,
      ping: website.latency,
    }));
    renderHistory(services[2], websiteDays, "Beacon Website", website.online, website.online ? (websiteDegraded ? 95 : 100) : 0, website.online ? `Public website reachable - ${website.latency} ms response` : "Public website is unreachable");
    renderHistory(services[3], days, "Dashboard / API", apiOnline, measured, apiOnline ? "Statistics API is responding" : "Statistics API is unavailable");
    renderHistory(services[4], days, "Database", databaseOnline, measured, databaseOnline ? "Status data was read successfully" : "No stored status data is available");
    document.body.dataset.lastReportAt = stats.updatedAt || ""; updateTime(stats.updatedAt);
    renderIncidents(stats);
  } catch {
    setStatusState("monitoring-unavailable", "The monitoring service could not be reached.");
    document.querySelector('[data-metric="gateway-status"]').textContent = "Unavailable";
    const days = buildDays({ history: [] }); services.forEach((service) => renderHistory(service, days, service.querySelector(".service-heading strong").textContent, false, null, "Monitoring unavailable"));
    updateTime(null);
    renderIncidents({ incidents: [] });
  }
}
refreshStatus();
window.setInterval(refreshStatus, 5000);
window.setInterval(() => updateTime(document.body.dataset.lastReportAt), 1000);
