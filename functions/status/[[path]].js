import { statusEvents } from "../../status/events.mjs";
const STALE_AFTER_MS = 3 * 60 * 1000;
const FALLBACK_STATS = {
  guilds: 0,
  users: 0,
  ping: 0,
  uptime: 0,
  online: false,
  updatedAt: null,
  startedAt: null,
  history: [],
  monitoringStartedAt: null,
  uptimePercent: null,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-US") : "--";
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

function formatMonitoringDate(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(timestamp)
    : "the monitoring start date";
}

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function uptimePercent(history, monitoringStartedAt) {
  const startedAt = Date.parse(monitoringStartedAt || "");
  if (!Number.isFinite(startedAt)) return null;

  const now = Date.now();
  if (now - startedAt < 30 * 86400000) return null;
  const windowStart = Math.max(startedAt, now - 30 * 86400000);
  const expectedReports = Math.max(1, Math.floor((now - windowStart) / 60000) + 1);
  const receivedReports = history.reduce((total, entry) => {
    const day = Date.parse(`${entry.date}T00:00:00.000Z`);
    if (!Number.isFinite(day) || day + 86400000 <= windowStart) return total;
    return total + Math.max(0, Number(entry.reports) || 0);
  }, 0);

  return Math.max(0, Math.min(100, receivedReports / expectedReports * 100));
}

async function readStatus(env) {
  let stats = { ...FALLBACK_STATS };
  let history = [];
  let monitoringStartedAt = null;
  let incidents = [];

  if (env.STATUS_DB) {
    try {
      const [stateRow, historyResult, monitoringRow, incidentsRow] = await Promise.all([
        env.STATUS_DB.prepare("SELECT payload FROM status_state WHERE id = 1").first(),
        env.STATUS_DB.prepare(
          "SELECT date, reports, ping_total AS pingTotal, last_minute AS lastMinute, last_report_at AS lastReportAt FROM status_history ORDER BY date DESC LIMIT 30"
        ).all(),
        env.STATUS_DB.prepare("SELECT value FROM status_meta WHERE key = 'monitoring-started-at'").first(),
        env.STATUS_DB.prepare("SELECT value FROM status_meta WHERE key = 'status-incidents'").first(),
      ]);
      if (stateRow?.payload) stats = { ...stats, ...JSON.parse(stateRow.payload) };
      history = (historyResult.results || []).reverse();
      monitoringStartedAt = monitoringRow?.value || null;
      incidents = JSON.parse(incidentsRow?.value || "[]");
    } catch (error) {
      console.error(`[status] Failed to read D1 status: ${error.message}`);
    }
  }

  const updatedAt = Date.parse(stats.updatedAt || "");
  const online = Boolean(stats.online && Number.isFinite(updatedAt) && Date.now() - updatedAt < STALE_AFTER_MS);
  const ageSeconds = Number.isFinite(updatedAt) ? Math.max(0, Math.floor((Date.now() - updatedAt) / 1000)) : null;
  const measuredUptime = hasNumericValue(stats.uptimePercent)
    ? Number(stats.uptimePercent)
    : uptimePercent(history, monitoringStartedAt);

  return {
    ...stats,
    online,
    history,
    monitoringStartedAt,
    ageSeconds,
    uptimePercent: measuredUptime,
    incidents: [...(Array.isArray(incidents) ? incidents : []), ...statusEvents].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)),
    statusState: !Number.isFinite(updatedAt) ? "monitoring-unavailable" : online ? "operational" : "service-outage",
  };
}

function replaceContent(html, selector, value) {
  return html.replace(
    new RegExp(`(<[^>]+${selector}[^>]*>)([\\s\\S]*?)(</[^>]+>)`),
    `$1${escapeHtml(value)}$3`
  );
}

function incidentDate(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "Unknown";
}

function incidentMarkup(incidents) {
  if (!Array.isArray(incidents) || !incidents.length) return "<p>No incidents recorded in the current monitoring window.</p>";
  return incidents.slice(0, 20).map((incident) => {
    const start = Date.parse(incident.startedAt || "");
    const end = Date.parse(incident.resolvedAt || "");
    const duration = Number.isFinite(start) && Number.isFinite(end) ? ` · Duration: ${formatDuration((end - start) / 1000)}` : " · Ongoing";
    return `<article><strong>${incident.resolvedAt ? "Resolved" : "Ongoing"}: ${escapeHtml(incident.title || "Service interruption")}</strong><span>From ${escapeHtml(incidentDate(incident.startedAt))}${incident.resolvedAt ? ` to ${escapeHtml(incidentDate(incident.resolvedAt))}` : ""}${duration}</span></article>`;
  }).join("");
}

function dailyStatsMarkup(history) {
  const today = new Date().toISOString().slice(0, 10);
  const days = (history || []).filter((entry) => entry?.date).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-3);
  if (!days.length) return '<p class="daily-stats-empty">No daily monitoring data recorded yet.</p>';
  return days.map((entry) => {
    const reports = Math.max(0, Number(entry.reports) || 0);
    const expected = entry.date === today ? Math.max(1, Math.floor((Date.now() - Date.parse(`${today}T00:00:00.000Z`)) / 60000) + 1) : 1440;
    const percent = Math.min(100, reports / expected * 100);
    const state = percent >= 99 ? "up" : percent >= 95 ? "degraded" : "down";
    const date = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${entry.date}T12:00:00.000Z`));
    const ping = reports && Number(entry.pingTotal) ? `${Math.round(Number(entry.pingTotal) / reports)} ms` : "--";
    const stateLabel = state === "up" ? "Operational" : state === "degraded" ? "Degraded" : "Outage";
    return `<article class="daily-stat-tile daily-stat-tile--${state}"><div class="daily-stat-heading"><strong>${escapeHtml(date)}</strong><b>${stateLabel}</b></div><div class="daily-stat-metrics"><span><b>${percent.toFixed(2)}%</b><small>Uptime</small></span><span><b>${ping}</b><small>Avg. ping</small></span><span><b>${formatNumber(reports)}</b><small>Checks</small></span></div></article>`;
  }).join("");
}

function historyMarkup(history) {
  const byDate = new Map((history || []).map((entry) => [entry.date, entry]));
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - (29 - index));
    const key = date.toISOString().slice(0, 10);
    const entry = byDate.get(key);
    const reports = Math.max(0, Number(entry?.reports) || 0);
    const expected = key === now.toISOString().slice(0, 10)
      ? Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000) + 1)
      : 1440;
    const percent = reports ? Math.min(100, reports / expected * 100) : null;
    const state = percent === null ? "" : percent >= 99 ? "is-up" : percent >= 95 ? "is-degraded" : "is-down";
    const today = key === now.toISOString().slice(0, 10) ? " is-today" : "";
    const tooltip = percent === null ? `${key}\nNo monitoring data` : `${key}\n${percent.toFixed(2)}% uptime\n${reports}/${expected} checks received`;
    return `<span class="${state}${today}" data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip.replaceAll("\n", ", "))}"></span>`;
  }).join("");
}

function renderStatusHtml(html, stats) {
  const allOnline = Boolean(stats.online);
  const monitoringUnavailable = stats.statusState === "monitoring-unavailable";
  const summaryTitle = monitoringUnavailable ? "Monitoring unavailable" : allOnline ? "Operational" : "Service outage";
  const summaryCopy = allOnline
    ? "Beacon Bot and its public services are responding normally."
    : monitoringUnavailable
      ? "The monitoring service could not provide a fresh report."
      : "At least one Beacon service is not responding normally.";
  const uptimeText = hasNumericValue(stats.uptimePercent)
    ? `${Number(stats.uptimePercent).toFixed(2)}% uptime`
    : "Monitoring started";
  const ageText = Number.isFinite(stats.ageSeconds)
    ? `Last updated: ${stats.ageSeconds} seconds ago`
    : "Last updated: unavailable";
  const apiOnlineText = "Checking...";
  const databaseOnlineText = stats.updatedAt ? "Stored data available" : "Unknown";

  let output = html
    .replace('<body>', `<body data-last-report-at="${escapeHtml(stats.updatedAt || "")}">`)
    .replace('class="status-summary"', `class="status-summary status-summary--${stats.statusState || "service-outage"}${allOnline ? "" : " is-down"}"`)
    .replace('data-status-state>Checking monitoring...</', `data-status-state>${escapeHtml(summaryTitle)}<`)
    .replace("[data-summary-icon]>&#10003;", `[data-summary-icon]>${allOnline ? "&#10003;" : "!"}`)
    .replace("<b data-service-uptime>Checking...</b>", `<b data-service-uptime>${escapeHtml(uptimeText)}</b>`)
    .replace("<p class=\"service-detail\" data-service-detail>Discord gateway and command service</p>", `<p class="service-detail" data-service-detail>${escapeHtml(allOnline ? "Online" : "No fresh bot report received")}</p>`)
    .replace("<b data-service-uptime>Checking...</b>", `<b data-service-uptime>${escapeHtml(uptimeText)}</b>`)
    .replace("<p class=\"service-detail\" data-service-detail>Realtime connection to Discord</p>", `<p class="service-detail" data-service-detail>${escapeHtml(allOnline ? `Connected - ${Math.round(Number(stats.ping) || 0)} ms gateway ping` : "Discord gateway connection unavailable")}</p>`)
    .replace("<b data-service-uptime>Checking...</b>", "<b data-service-uptime>Operational</b>")
    .replace("<p class=\"service-detail\" data-service-detail>Public Beacon website</p>", '<p class="service-detail" data-service-detail>Public Beacon website is reachable</p>')
    .replace("<b data-service-uptime>Checking...</b>", `<b data-service-uptime>${escapeHtml(apiOnlineText)}</b>`)
    .replace("<p class=\"service-detail\" data-service-detail>Dashboard data and authentication services</p>", `<p class="service-detail" data-service-detail>${escapeHtml(apiOnlineText === "Operational" ? "Statistics API is responding" : "Statistics API is unavailable")}</p>`)
    .replace("<b data-service-uptime>Checking...</b>", `<b data-service-uptime>${escapeHtml(databaseOnlineText)}</b>`)
    .replace("<p class=\"service-detail\" data-service-detail>Status and statistics storage</p>", `<p class="service-detail" data-service-detail>${escapeHtml(databaseOnlineText === "Operational" ? "Status data was read successfully" : "No fresh status data is available")}</p>`);

  output = replaceContent(output, "data-summary-title", summaryTitle);
  output = replaceContent(output, "data-summary-copy", summaryCopy);
  output = replaceContent(output, 'data-metric="uptime"', formatDuration(stats.uptime));
  output = replaceContent(output, 'data-metric="ping"', Number(stats.ping) ? `${Math.round(stats.ping)} ms` : "--");
  output = replaceContent(output, 'data-metric="guilds"', formatNumber(stats.guilds));
  output = replaceContent(output, 'data-metric="users"', formatNumber(stats.users));
  output = replaceContent(output, 'data-metric="uptime-percent"', hasNumericValue(stats.uptimePercent) ? formatPercent(stats.uptimePercent) : "Monitoring started");
  output = replaceContent(output, "data-uptime-label", hasNumericValue(stats.uptimePercent) ? "30-Day Uptime" : `Uptime since ${formatMonitoringDate(stats.monitoringStartedAt)}`);
  output = replaceContent(output, "data-incident-title", allOnline ? "No active incidents" : "Active service interruption");
  output = replaceContent(output, "data-incident-copy", allOnline ? "Beacon is operating normally." : "The live monitor is waiting for a healthy Beacon report.");
  output = replaceContent(output, "data-last-updated", ageText);
  output = output.replace(/<div class="updates-list" data-incidents>[\s\S]*?<\/div>/, `<div class="updates-list" data-incidents>${incidentMarkup(stats.incidents)}</div>`);
  output = output.replace(/<div class="daily-stats" data-daily-stats>[\s\S]*?<\/div>/, `<div class="daily-stats" data-daily-stats>${dailyStatsMarkup(stats.history)}</div>`);
  output = output.replace(/(<article class="service" data-service="([^"]+)">)([\s\S]*?)(<\/article>)/g, (_, start, id, content, end) => {
    const hasHistory = id !== "website";
    content = content.replace('<div class="history" data-history></div>', `<div class="history" data-history>${historyMarkup(hasHistory ? stats.history : [])}</div>`);
    if (!hasHistory) content = content.replace('data-service-percent>--', 'data-service-percent>No recorded uptime history');
    return start + content + end;
  });
  return output;
}

function baseStatusHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#050505" />
    <meta name="description" content="Live uptime and service status for Beacon Bot." />
    <title>Beacon Status</title>
    <link rel="icon" type="image/png" href="/assets/beacon-logo.png?v=92" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/status/status.css?v=11" />
  </head>
  <body>
    <a class="return-link" href="https://beacon-bot.site/" aria-label="Back to Beacon">
      <span class="return-content"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg><span>Back</span></span>
    </a>
    <main>
      <section class="status-card" aria-live="polite">
        <div class="card-heading">
          <div><p class="eyebrow">Beacon Bot</p><h1>System Status</h1></div>
        </div>
        <p class="card-copy" data-summary-copy>Live service information from Beacon Bot.</p>
        <div class="status-state status-state--monitoring-unavailable" data-status-state>Checking monitoring...</div>
        <div class="metric-list" aria-label="Live Beacon statistics">
          <div><span>Discord Gateway</span><strong data-metric="gateway-status">Connected</strong></div>
          <div><span>Connected Servers</span><strong><b data-metric="guilds">--</b> servers</strong></div>
          <div><span>Community Members</span><strong data-metric="users">--</strong></div>
          <div><span>Bot Session Uptime</span><strong data-metric="uptime">--</strong></div>
          <div><span>Gateway Latency</span><strong data-metric="ping">--</strong></div>
          <div><span data-uptime-label>Uptime since monitoring started</span><strong data-metric="uptime-percent">--</strong></div>
          <div><span>Sponsored by</span><strong><img class="hosting-logo" src="/assets/header-footer-logo.png" alt="NXTBYTE" /></strong></div>
        </div>
        <div class="card-footer"><span>Automatically updated</span><span data-last-updated>Last updated: waiting</span></div>
      </section>
      <section class="history-panel" aria-labelledby="history-title">
        <div class="panel-heading"><div><p class="eyebrow">Uptime over the past 30 days</p><h2 id="history-title">Service history</h2></div><span>Hover over a bar for details</span></div>
        <article class="service" data-service="bot"><div class="service-heading"><strong>Beacon Bot</strong><b data-service-uptime>Checking...</b></div><p class="service-detail" data-service-detail>Discord gateway and command service</p><div class="history" data-history></div><div class="history-labels"><span>30 days ago</span><span data-service-percent>--</span><span>Today</span></div></article>
        <article class="service" data-service="gateway"><div class="service-heading"><strong>Discord Gateway</strong><b data-service-uptime>Checking...</b></div><p class="service-detail" data-service-detail>Realtime connection to Discord</p><div class="history" data-history></div><div class="history-labels"><span>30 days ago</span><span data-service-percent>--</span><span>Today</span></div></article>
        <article class="service" data-service="website"><div class="service-heading"><strong>Beacon Website</strong><b data-service-uptime>Checking...</b></div><p class="service-detail" data-service-detail>Public Beacon website</p><div class="history" data-history></div><div class="history-labels"><span>30 days ago</span><span data-service-percent>--</span><span>Today</span></div></article>
        <article class="service" data-service="dashboard"><div class="service-heading"><strong>Dashboard / API</strong><b data-service-uptime>Checking...</b></div><p class="service-detail" data-service-detail>Dashboard data and authentication services</p><div class="history" data-history></div><div class="history-labels"><span>30 days ago</span><span data-service-percent>--</span><span>Today</span></div></article>
        <article class="service" data-service="database"><div class="service-heading"><strong>Database</strong><b data-service-uptime>Checking...</b></div><p class="service-detail" data-service-detail>Status and statistics storage</p><div class="history" data-history></div><div class="history-labels"><span>30 days ago</span><span data-service-percent>--</span><span>Today</span></div></article>
      </section>
      <section class="daily-panel" aria-labelledby="daily-title"><div class="panel-heading"><div><p class="eyebrow">Real monitoring data</p><h2 id="daily-title">Last 3 days</h2></div><span>Uptime, average ping and received checks</span></div><div class="daily-stats" data-daily-stats><p class="daily-stats-empty">Loading daily monitoring data...</p></div></section>
      <section class="updates-grid" aria-label="Incidents and maintenance">
        <article class="updates-panel"><div class="panel-heading"><div><p class="eyebrow">Past incidents</p><h2>Past incidents</h2></div></div><div class="updates-list" data-incidents><p>No recent incidents.</p></div></article>
        <article class="updates-panel"><div class="panel-heading"><div><p class="eyebrow">Scheduled maintenance</p><h2>Scheduled maintenance</h2></div></div><div class="updates-list" data-maintenance><p>No maintenance is currently scheduled.</p></div></article>
      </section>
    </main>

    <footer class="status-footer"><span class="footer-brand"><img src="/assets/header-footer-logo.png" alt="NXTBYTE" />Powered by Beacon Bot</span><a href="https://beacon-bot.site/">Back to Beacon</a></footer>
    <footer class="normal-footer"><a href="https://beacon-bot.site/tos/">Terms of Use</a><a href="https://beacon-bot.site/privacy/">Privacy Policy</a><a href="https://beacon-bot.site/copyright/">Copyright Dispute</a><a href="https://beacon-bot.site/gdpr/">GDPR Notice</a><a href="https://beacon-bot.site/cookies/">Cookie Policy</a><a href="https://beacon-bot.site/eula/">EULA</a><a href="https://beacon-bot.site/imprint/">Imprint</a></footer>
    <script src="/status/status-runtime-v2.js?v=16" defer></script>
  </body>
</html>`;
}

function isStatusIndex(url) {
  return url.pathname === "/status" || url.pathname === "/status/" || url.pathname === "/status/index.html";
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (!isStatusIndex(url)) {
    return context.env.ASSETS.fetch(context.request);
  }

  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }

  const stats = await readStatus(context.env);
  const body = renderStatusHtml(baseStatusHtml(), stats);

  return new Response(context.request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
