const summary = document.querySelector(".status-summary");
const summaryTitle = document.querySelector("[data-summary-title]");
const summaryCopy = document.querySelector("[data-summary-copy]");
const summaryIcon = document.querySelector("[data-summary-icon]");
const lastUpdated = document.querySelector("[data-last-updated]");
const incident = document.querySelector("[data-incident]");
const incidentTitle = document.querySelector("[data-incident-title]");
const incidentCopy = document.querySelector("[data-incident-copy]");
const services = [...document.querySelectorAll("[data-service]")];
const API_ENDPOINT = "https://beacon-bot.site/api/discord-stats";
let lastReportAt = Number.isFinite(Date.parse(document.body.dataset.lastReportAt || ""))
  ? Date.parse(document.body.dataset.lastReportAt)
  : null;

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : "--";
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function sessionLabel(stats) {
  const startedAt = Date.parse(stats.startedAt || "");
  if (!Number.isFinite(startedAt)) return `current session ${formatDuration(stats.uptime)}`;
  return `started ${new Date(startedAt).toLocaleString()}`;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function dayBounds(key) {
  const start = new Date(`${key}T00:00:00.000Z`).getTime();
  return { start, end: start + 86400000 };
}

function expectedReports(key, monitoringStartedAt) {
  const now = Date.now();
  const bounds = dayBounds(key);
  const monitoringStart = Date.parse(monitoringStartedAt || "");
  const start = Math.max(bounds.start, Number.isFinite(monitoringStart) ? monitoringStart : now);
  const end = Math.min(bounds.end, now);
  return end > start ? Math.max(1, Math.floor((end - start) / 60000) + 1) : 0;
}

function buildDays(stats) {
  const history = new Map((stats.history || []).map((entry) => [entry.date, entry]));
  const monitoringStart = Date.parse(stats.monitoringStartedAt || "");
  const monitoringDay = Number.isFinite(monitoringStart) ? dateKey(new Date(monitoringStart)) : dateKey(new Date());
  const days = [];

  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - offset);
    const key = dateKey(date);
    const entry = history.get(key);
    const expected = expectedReports(key, stats.monitoringStartedAt);
    const rawReports = Number(entry?.reports) || 0;
    const reports = Math.min(expected, rawReports);
    const pingTotal = Number(entry?.pingTotal || entry?.ping_total) || 0;
    let state = "unknown";
    let percent = null;

    if (key >= monitoringDay && expected > 0) {
      percent = Math.max(0, Math.min(100, reports / expected * 100));
      state = percent >= 99 ? "up" : percent >= 95 ? "degraded" : "down";
    }
    if (offset === 0 && !stats.online) {
      state = "down";
      percent = 0;
    }
    days.push({
      key,
      state,
      percent,
      today: offset === 0,
      reports,
      expected,
      avgPing: rawReports && pingTotal ? Math.round(pingTotal / rawReports) : null,
    });
  }
  return days;
}

function overallUptime(days) {
  const known = days.filter((day) => day.percent !== null);
  if (!known.length) return null;
  return known.reduce((sum, day) => sum + day.percent, 0) / known.length;
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : "--";
}

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function updateLastUpdated() {
  if (!Number.isFinite(lastReportAt)) {
    lastUpdated.textContent = "Last updated: unavailable";
    return;
  }
  const seconds = Math.max(0, Math.floor((Date.now() - lastReportAt) / 1000));
  lastUpdated.textContent = `Last updated: ${seconds} seconds ago`;
}

async function fetchStats() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${API_ENDPOINT}?status-check=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Status API returned ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function withCurrentState(days, online) {
  return days.map((day) => day.today
    ? { ...day, state: online ? "up" : "down", percent: online ? 100 : 0, reports: Math.max(1, day.reports || 0), expected: Math.max(1, day.expected || 1) }
    : day);
}

function dayLabel(key) {
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : key;
}

function historyTooltip(serviceName, day) {
  if (day.percent === null) {
    return `${serviceName}\n${dayLabel(day.key)}\nNo monitoring data yet`;
  }

  const stateLabel = day.state === "up" ? "Operational" : day.state === "degraded" ? "Degraded" : "Unavailable";
  const checks = day.expected ? `${day.reports}/${day.expected} checks received` : "Live check pending";
  const ping = day.avgPing ? `${day.avgPing} ms average ping` : "Ping data pending";
  return `${serviceName}\n${formatPercent(day.percent)} uptime\n${stateLabel}\n${checks}\n${ping}`;
}

function renderHistory(container, days, serviceName) {
  container.replaceChildren(...days.map((day) => {
    const bar = document.createElement("span");
    if (day.state !== "unknown") bar.classList.add(`is-${day.state}`);
    if (day.today) bar.classList.add("is-today");
    const tooltip = historyTooltip(serviceName, day);
    bar.dataset.tooltip = tooltip;
    bar.setAttribute("aria-label", tooltip.replace(/\n/g, ", "));
    return bar;
  }));
}

function setService(service, online, label, detail, days) {
  service.classList.toggle("is-down", !online);
  service.querySelector(".service-check").textContent = online ? "\u2713" : "!";
  service.querySelector("[data-service-uptime]").textContent = label;
  service.querySelector("[data-service-detail]").textContent = detail;
  renderHistory(service.querySelector("[data-history]"), days, service.querySelector("h3")?.textContent || "Beacon service");
}

async function checkLandingPage() {
  const started = performance.now();
  try {
    await fetch(`https://beacon-bot.site/?status-check=${Date.now()}`, { cache: "no-store", mode: "no-cors" });
    return { online: true, latency: Math.round(performance.now() - started) };
  } catch {
    return { online: false, latency: null };
  }
}

async function refreshStatus() {
  const landingPromise = checkLandingPage();
  try {
    const stats = await fetchStats();
    const landing = await landingPromise;
    const days = buildDays(stats);
    const uptime = overallUptime(days);
    const measuredUptime = hasNumericValue(stats.uptimePercent) ? Number(stats.uptimePercent) : uptime;
    const uptimeLabel = measuredUptime === null ? "Monitoring started" : `${measuredUptime.toFixed(2)}% uptime`;
    const allOnline = Boolean(stats.online && landing.online);

    summary.classList.toggle("is-down", !allOnline);
    summaryIcon.textContent = allOnline ? "\u2713" : "!";
    summaryTitle.textContent = allOnline ? "All systems optimized" : "Service disruption detected";
    summaryCopy.textContent = allOnline ? "Beacon Bot and its public services are responding normally." : "At least one Beacon service is not responding normally.";
    incident.classList.toggle("is-down", !allOnline);
    incidentTitle.textContent = allOnline ? "No active incidents" : "Active service interruption";
    incidentCopy.textContent = allOnline ? "Beacon is operating normally." : "The live monitor is waiting for a healthy Beacon report.";

    document.querySelector('[data-metric="uptime"]').textContent = formatDuration(stats.uptime);
    document.querySelector('[data-metric="ping"]').textContent = Number(stats.ping) ? `${Math.round(stats.ping)} ms` : "--";
    document.querySelector('[data-metric="guilds"]').textContent = formatNumber(stats.guilds);
    document.querySelector('[data-metric="users"]').textContent = formatNumber(stats.users);
    document.querySelector('[data-metric="uptime-percent"]').textContent = formatPercent(measuredUptime);

    const bot = services.find((service) => service.dataset.service === "bot");
    const gateway = services.find((service) => service.dataset.service === "gateway");
    const website = services.find((service) => service.dataset.service === "website");
    setService(bot, stats.online, uptimeLabel, stats.online ? `Online \u00b7 ${sessionLabel(stats)}` : "No fresh bot report received", days);
    setService(gateway, stats.online, uptimeLabel, stats.online ? `Connected \u00b7 ${Math.round(stats.ping)} ms gateway ping` : "Discord gateway connection unavailable", days);
    setService(website, landing.online, landing.online ? "Operational" : "Unavailable", landing.online ? `Responding \u00b7 ${landing.latency} ms browser check` : "Landing page check failed", withCurrentState(days, landing.online));

    lastReportAt = Date.parse(stats.updatedAt || "");
    document.body.dataset.lastReportAt = stats.updatedAt || "";
    updateLastUpdated();
  } catch {
    const landing = await landingPromise;
    summary.classList.add("is-down");
    summaryIcon.textContent = "!";
    summaryTitle.textContent = "Status currently unavailable";
    summaryCopy.textContent = "The monitoring API could not be reached within 5 seconds.";
    incident.classList.add("is-down");
    incidentTitle.textContent = "Monitoring data unavailable";
    incidentCopy.textContent = "The status API could not complete its latest check.";
    const emptyDays = buildDays({ online: false, history: [], monitoringStartedAt: null });
    services.forEach((service) => setService(service, false, "Unavailable", "No live status data", emptyDays));
    if (landing.online) {
      const website = services.find((service) => service.dataset.service === "website");
      setService(website, true, "Operational", `Responding \u00b7 ${landing.latency} ms browser check`, withCurrentState(emptyDays, true));
    }
    lastReportAt = null;
    lastUpdated.textContent = "Last updated: unavailable";
  }
}

updateLastUpdated();
refreshStatus();
window.setInterval(refreshStatus, 5_000);
window.setInterval(updateLastUpdated, 1_000);
window.addEventListener("focus", refreshStatus);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshStatus();
});
