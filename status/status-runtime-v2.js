const API_ENDPOINT = "https://beacon-bot.site/api/discord-stats";
const summaryTitle = document.querySelector("[data-summary-title]");
const summaryCopy = document.querySelector("[data-summary-copy]");
const lastUpdated = document.querySelector("[data-last-updated]");

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

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : "--";
}

function updateLastUpdated(updatedAt) {
  const timestamp = Date.parse(updatedAt || "");
  if (!Number.isFinite(timestamp)) {
    lastUpdated.textContent = "Last updated: unavailable";
    return;
  }
  lastUpdated.textContent = `Last updated: ${Math.max(0, Math.floor((Date.now() - timestamp) / 1000))} seconds ago`;
}

async function refreshStatus() {
  try {
    const response = await fetch(`${API_ENDPOINT}?status-check=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Status API returned ${response.status}`);
    const stats = await response.json();
    const online = Boolean(stats.online);

    summaryTitle.innerHTML = `<span class="status-dot"></span>${online ? "Operational" : "Unavailable"}`;
    summaryCopy.textContent = online
      ? "Beacon Bot and its Discord services are responding normally."
      : "Beacon Bot is not currently reporting a healthy connection.";
    summaryTitle.querySelector(".status-dot").style.background = online ? "var(--green)" : "var(--red)";
    document.body.dataset.lastReportAt = stats.updatedAt || "";

    document.querySelector('[data-metric="gateway-status"]').textContent = online ? "Connected" : "Unavailable";
    document.querySelector('[data-metric="guilds"]').textContent = formatNumber(stats.guilds);
    document.querySelector('[data-metric="users"]').textContent = formatNumber(stats.users);
    document.querySelector('[data-metric="uptime"]').textContent = formatDuration(stats.uptime);
    document.querySelector('[data-metric="ping"]').textContent = Number.isFinite(Number(stats.ping)) ? `${Math.round(stats.ping)} ms` : "--";
    document.querySelector('[data-metric="uptime-percent"]').textContent = formatPercent(stats.uptimePercent);
    updateLastUpdated(stats.updatedAt);
  } catch {
    summaryTitle.innerHTML = '<span class="status-dot"></span>Unavailable';
    summaryCopy.textContent = "The live status service could not be reached.";
    summaryTitle.querySelector(".status-dot").style.background = "var(--red)";
    document.querySelector('[data-metric="gateway-status"]').textContent = "Unavailable";
    updateLastUpdated(null);
  }
}

refreshStatus();
window.setInterval(refreshStatus, 5000);
window.setInterval(() => updateLastUpdated(document.body.dataset.lastReportAt), 1000);
