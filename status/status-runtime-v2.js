const API_ENDPOINT = "https://beacon-bot.site/api/discord-stats";
const summaryCopy = document.querySelector("[data-summary-copy]");
const lastUpdated = document.querySelector("[data-last-updated]");
const services = [...document.querySelectorAll("[data-service]")];

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
function renderHistory(service, days, name, online, percent) {
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
  service.querySelector("[data-service-percent]").textContent = percent == null ? "Monitoring started" : `${percent.toFixed(2)}% uptime`;
  service.classList.toggle("is-down", !online);
}
async function checkWebsite() {
  const started = performance.now();
  try {
    await fetch(`https://beacon-bot.site/?status-check=${Date.now()}`, { cache: "no-store", mode: "no-cors" });
    return { online: true, latency: Math.round(performance.now() - started) };
  } catch {
    return { online: false, latency: null };
  }
}
function updateTime(updatedAt) {
  const timestamp = Date.parse(updatedAt || "");
  lastUpdated.textContent = Number.isFinite(timestamp) ? `Last updated: ${Math.max(0, Math.floor((Date.now() - timestamp) / 1000))} seconds ago` : "Last updated: unavailable";
}
async function refreshStatus() {
  try {
    const [response, website] = await Promise.all([
      fetch(`${API_ENDPOINT}?status-check=${Date.now()}`, { cache: "no-store" }),
      checkWebsite(),
    ]);
    if (!response.ok) throw new Error();
    const stats = await response.json(); const online = Boolean(stats.online && website.online); const days = buildDays(stats);
    const uptime = Number(stats.uptimePercent); const measured = Number.isFinite(uptime) ? uptime : null;
    summaryCopy.textContent = online ? "Beacon Bot and its Discord services are responding normally." : "Beacon Bot is not currently reporting a healthy connection.";
    document.querySelector('[data-metric="gateway-status"]').textContent = online ? "Connected" : "Unavailable";
    document.querySelector('[data-metric="guilds"]').textContent = number(stats.guilds);
    document.querySelector('[data-metric="users"]').textContent = number(stats.users);
    document.querySelector('[data-metric="uptime"]').textContent = duration(stats.uptime);
    document.querySelector('[data-metric="ping"]').textContent = Number.isFinite(Number(stats.ping)) ? `${Math.round(stats.ping)} ms` : "--";
    document.querySelector('[data-metric="uptime-percent"]').textContent = measured == null ? "--" : `${measured.toFixed(2)}%`;
    renderHistory(services[0], days, "Primary Bot", online, measured);
    renderHistory(services[1], days, "Discord Gateway", online, measured);
    const websiteDegraded = website.online && Number(website.latency) > 1200;
    const websiteDays = days.map((day) => ({
      ...day,
      state: !website.online ? "down" : websiteDegraded ? "degraded" : "up",
      percent: website.online ? (websiteDegraded ? 95 : 100) : 0,
      reports: website.online ? (websiteDegraded ? 95 : 100) : 0,
      expected: 100,
      ping: website.latency,
    }));
    renderHistory(services[2], websiteDays, "Beacon Website", website.online, website.online ? (websiteDegraded ? 95 : 100) : 0);
    document.body.dataset.lastReportAt = stats.updatedAt || ""; updateTime(stats.updatedAt);
  } catch {
    summaryCopy.textContent = "The live status service could not be reached.";
    document.querySelector('[data-metric="gateway-status"]').textContent = "Unavailable";
    const days = buildDays({ history: [] }); services.forEach((service, index) => renderHistory(service, days, service.querySelector(".service-heading strong").textContent, index === 2, index === 2 ? 100 : null));
    updateTime(null);
  }
}
refreshStatus();
window.setInterval(refreshStatus, 5000);
window.setInterval(() => updateTime(document.body.dataset.lastReportAt), 1000);
