const summary = document.querySelector(".status-summary");
const summaryTitle = document.querySelector("[data-summary-title]");
const summaryCopy = document.querySelector("[data-summary-copy]");
const summaryIcon = document.querySelector("[data-summary-icon]");
const lastUpdated = document.querySelector("[data-last-updated]");
const incident = document.querySelector("[data-incident]");
const incidentTitle = document.querySelector("[data-incident-title]");
const incidentCopy = document.querySelector("[data-incident-copy]");
const services = [...document.querySelectorAll("[data-service]")];

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
    let state = "unknown";
    let percent = null;

    if (key >= monitoringDay && expected > 0) {
      const reports = Math.min(expected, Number(entry?.reports) || 0);
      percent = Math.max(0, Math.min(100, reports / expected * 100));
      state = percent >= 99 ? "up" : percent >= 95 ? "degraded" : "down";
    }
    if (offset === 0 && !stats.online) {
      state = "down";
      percent = 0;
    }
    days.push({ key, state, percent, today: offset === 0 });
  }
  return days;
}

function overallUptime(days) {
  const known = days.filter((day) => day.percent !== null);
  if (!known.length) return null;
  return known.reduce((sum, day) => sum + day.percent, 0) / known.length;
}

function withCurrentState(days, online) {
  return days.map((day) => day.today
    ? { ...day, state: online ? "up" : "down", percent: online ? 100 : 0 }
    : day);
}

function renderHistory(container, days) {
  container.replaceChildren(...days.map((day) => {
    const bar = document.createElement("span");
    if (day.state !== "unknown") bar.classList.add(`is-${day.state}`);
    if (day.today) bar.classList.add("is-today");
    bar.title = `${day.key}: ${day.percent === null ? "No data" : `${day.percent.toFixed(2)}%`}`;
    return bar;
  }));
}

function setService(service, online, label, detail, days) {
  service.classList.toggle("is-down", !online);
  service.querySelector(".service-check").textContent = online ? "\u2713" : "!";
  service.querySelector("[data-service-uptime]").textContent = label;
  service.querySelector("[data-service-detail]").textContent = detail;
  renderHistory(service.querySelector("[data-history]"), days);
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
    const response = await fetch(`/api/discord-stats?status-check=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Status API unavailable");
    const stats = await response.json();
    const landing = await landingPromise;
    const days = buildDays(stats);
    const uptime = overallUptime(days);
    const uptimeLabel = uptime === null ? "Monitoring started" : `${uptime.toFixed(2)}% uptime`;
    const allOnline = Boolean(stats.online && landing.online);

    summary.classList.toggle("is-down", !allOnline);
    summaryIcon.textContent = allOnline ? "\u2713" : "!";
    summaryTitle.textContent = allOnline ? "All systems operational" : "Service disruption detected";
    summaryCopy.textContent = allOnline ? "Beacon Bot and its public services are responding normally." : "At least one Beacon service is not responding normally.";
    incident.classList.toggle("is-down", !allOnline);
    incidentTitle.textContent = allOnline ? "No active incidents" : "Active service interruption";
    incidentCopy.textContent = allOnline ? "Beacon is operating normally." : "The live monitor is waiting for a healthy Beacon report.";

    document.querySelector('[data-metric="uptime"]').textContent = formatDuration(stats.uptime);
    document.querySelector('[data-metric="ping"]').textContent = Number(stats.ping) ? `${Math.round(stats.ping)} ms` : "--";
    document.querySelector('[data-metric="guilds"]').textContent = formatNumber(stats.guilds);
    document.querySelector('[data-metric="users"]').textContent = formatNumber(stats.users);

    const bot = services.find((service) => service.dataset.service === "bot");
    const gateway = services.find((service) => service.dataset.service === "gateway");
    const website = services.find((service) => service.dataset.service === "website");
    const api = services.find((service) => service.dataset.service === "api");
    setService(bot, stats.online, uptimeLabel, stats.online ? `Online \u00b7 current session ${formatDuration(stats.uptime)}` : "No fresh bot report received", days);
    setService(gateway, stats.online, uptimeLabel, stats.online ? `Connected \u00b7 ${Math.round(stats.ping)} ms gateway ping` : "Discord gateway connection unavailable", days);
    setService(website, landing.online, landing.online ? "Operational" : "Unavailable", landing.online ? `Responding \u00b7 ${landing.latency} ms browser check` : "Landing page check failed", withCurrentState(days, landing.online));
    setService(api, true, "Operational", "Live metrics API is responding", withCurrentState(days, true));

    const updated = new Date(stats.updatedAt || Date.now());
    lastUpdated.textContent = `Last bot report ${updated.toLocaleString()}`;
  } catch {
    const landing = await landingPromise;
    summary.classList.add("is-down");
    summaryIcon.textContent = "!";
    summaryTitle.textContent = "Status data unavailable";
    summaryCopy.textContent = "The monitoring API could not be reached. Beacon may still be operating.";
    incident.classList.add("is-down");
    incidentTitle.textContent = "Monitoring data unavailable";
    incidentCopy.textContent = "The status API could not complete its latest check.";
    const emptyDays = buildDays({ online: false, history: [], monitoringStartedAt: null });
    services.forEach((service) => setService(service, false, "Unavailable", "No live status data", emptyDays));
    if (landing.online) {
      const website = services.find((service) => service.dataset.service === "website");
      setService(website, true, "Operational", `Responding \u00b7 ${landing.latency} ms browser check`, withCurrentState(emptyDays, true));
    }
    lastUpdated.textContent = "Live status check failed";
  }
}

refreshStatus();
window.setInterval(refreshStatus, 60_000);
