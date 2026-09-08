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

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function uptimePercent(history, monitoringStartedAt) {
  const startedAt = Date.parse(monitoringStartedAt || "");
  if (!Number.isFinite(startedAt)) return null;

  const now = Date.now();
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

  if (env.STATUS_DB) {
    try {
      const [stateRow, historyResult, monitoringRow] = await Promise.all([
        env.STATUS_DB.prepare("SELECT payload FROM status_state WHERE id = 1").first(),
        env.STATUS_DB.prepare(
          "SELECT date, reports, ping_total AS pingTotal, last_minute AS lastMinute, last_report_at AS lastReportAt FROM status_history ORDER BY date DESC LIMIT 30"
        ).all(),
        env.STATUS_DB.prepare("SELECT value FROM status_meta WHERE key = 'monitoring-started-at'").first(),
      ]);
      if (stateRow?.payload) stats = { ...stats, ...JSON.parse(stateRow.payload) };
      history = (historyResult.results || []).reverse();
      monitoringStartedAt = monitoringRow?.value || null;
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
  };
}

function replaceContent(html, selector, value) {
  return html.replace(
    new RegExp(`(<[^>]+${selector}[^>]*>)([\\s\\S]*?)(</[^>]+>)`),
    `$1${escapeHtml(value)}$3`
  );
}

function renderStatusHtml(html, stats) {
  const allOnline = Boolean(stats.online);
  const summaryTitle = allOnline ? "All systems optimized" : "Service disruption detected";
  const summaryCopy = allOnline
    ? "Beacon Bot and its public services are responding normally."
    : "At least one Beacon service is not responding normally.";
  const uptimeText = hasNumericValue(stats.uptimePercent)
    ? `${Number(stats.uptimePercent).toFixed(2)}% uptime`
    : "Monitoring started";
  const ageText = Number.isFinite(stats.ageSeconds)
    ? `Last updated: ${stats.ageSeconds} seconds ago`
    : "Last updated: unavailable";

  let output = html
    .replace('<body>', `<body data-last-report-at="${escapeHtml(stats.updatedAt || "")}">`)
    .replace('class="status-summary"', `class="status-summary${allOnline ? "" : " is-down"}"`)
    .replace("[data-summary-icon]>&#10003;", `[data-summary-icon]>${allOnline ? "&#10003;" : "!"}`)
    .replace("<strong data-service-uptime>Checking...</strong>", `<strong data-service-uptime>${escapeHtml(uptimeText)}</strong>`)
    .replace("<p class=\"service-detail\" data-service-detail>Discord gateway and command service</p>", `<p class="service-detail" data-service-detail>${escapeHtml(allOnline ? "Online" : "No fresh bot report received")}</p>`)
    .replace("<strong data-service-uptime>Checking...</strong>", `<strong data-service-uptime>${escapeHtml(uptimeText)}</strong>`)
    .replace("<p class=\"service-detail\" data-service-detail>Realtime connection to Discord</p>", `<p class="service-detail" data-service-detail>${escapeHtml(allOnline ? `Connected - ${Math.round(Number(stats.ping) || 0)} ms gateway ping` : "Discord gateway connection unavailable")}</p>`)
    .replace("<strong data-service-uptime>Checking...</strong>", "<strong data-service-uptime>Operational</strong>")
    .replace("<p class=\"service-detail\" data-service-detail>Public Beacon website</p>", '<p class="service-detail" data-service-detail>Public Beacon website is reachable</p>');

  output = replaceContent(output, "data-summary-title", summaryTitle);
  output = replaceContent(output, "data-summary-copy", summaryCopy);
  output = replaceContent(output, 'data-metric="uptime"', formatDuration(stats.uptime));
  output = replaceContent(output, 'data-metric="ping"', Number(stats.ping) ? `${Math.round(stats.ping)} ms` : "--");
  output = replaceContent(output, 'data-metric="guilds"', formatNumber(stats.guilds));
  output = replaceContent(output, 'data-metric="users"', formatNumber(stats.users));
  output = replaceContent(output, 'data-metric="uptime-percent"', formatPercent(stats.uptimePercent));
  output = replaceContent(output, "data-incident-title", allOnline ? "No active incidents" : "Active service interruption");
  output = replaceContent(output, "data-incident-copy", allOnline ? "Beacon is operating normally." : "The live monitor is waiting for a healthy Beacon report.");
  output = replaceContent(output, "data-last-updated", ageText);
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
    <link rel="stylesheet" href="/status/status.css?v=5" />
  </head>
  <body>
    <header class="status-header">
      <a class="status-brand" href="https://beacon-bot.site/">
        <img src="/assets/beacon-logo.png?v=92" width="34" height="34" alt="" />
        <strong>Beacon</strong><span>Status</span>
      </a>
      <a class="back-link" href="https://beacon-bot.site/">Back to Beacon</a>
    </header>

    <main>
      <section class="status-summary" aria-live="polite">
        <div class="summary-icon" data-summary-icon>&#10003;</div>
        <div>
          <p class="eyebrow">Current status</p>
          <h1 data-summary-title>All systems optimized</h1>
          <p data-summary-copy>Beacon Bot and its public services are responding normally.</p>
        </div>
      </section>

      <section class="live-metrics" aria-label="Live Beacon metrics">
        <div><span>Bot session uptime</span><strong data-metric="uptime">--</strong></div>
        <div><span>Gateway ping</span><strong data-metric="ping">--</strong></div>
        <div><span>Connected servers</span><strong data-metric="guilds">--</strong></div>
        <div><span>Community members</span><strong data-metric="users">--</strong></div>
        <div><span>30-day uptime</span><strong data-metric="uptime-percent">--</strong></div>
      </section>

      <section class="services" aria-labelledby="services-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">30-day service history</p>
            <h2 id="services-title">Beacon services</h2>
          </div>
          <p>Monitoring starts with the first recorded report. Gray days have no data yet.</p>
        </div>

        <article class="service" data-service="bot">
          <div class="service-heading">
            <div><span class="service-check">&#10003;</span><h3>Beacon Bot</h3></div>
            <strong data-service-uptime>Checking...</strong>
          </div>
          <p class="service-detail" data-service-detail>Discord gateway and command service</p>
          <div class="history" data-history aria-label="Beacon Bot 30-day uptime history"></div>
          <div class="history-labels"><span>30 days ago</span><span>Today</span></div>
        </article>

        <article class="service" data-service="gateway">
          <div class="service-heading">
            <div><span class="service-check">&#10003;</span><h3>Discord Gateway</h3></div>
            <strong data-service-uptime>Checking...</strong>
          </div>
          <p class="service-detail" data-service-detail>Realtime connection to Discord</p>
          <div class="history" data-history aria-label="Discord Gateway 30-day uptime history"></div>
          <div class="history-labels"><span>30 days ago</span><span>Today</span></div>
        </article>

        <article class="service" data-service="website">
          <div class="service-heading">
            <div><span class="service-check">&#10003;</span><h3>Landing Page</h3></div>
            <strong data-service-uptime>Checking...</strong>
          </div>
          <p class="service-detail" data-service-detail>Public Beacon website</p>
          <div class="history" data-history aria-label="Landing Page 30-day uptime history"></div>
          <div class="history-labels"><span>30 days ago</span><span>Today</span></div>
        </article>
      </section>

      <section class="incident-history" data-incident>
        <p class="eyebrow">Incident history</p>
        <div><span class="status-dot"></span><strong data-incident-title>No active incidents</strong><span data-incident-copy>Beacon is operating normally.</span></div>
      </section>
    </main>

    <footer><span>Beacon status</span><span data-last-updated>Last updated: waiting</span></footer>
    <script src="/status/status-runtime-v2.js?v=5" defer></script>
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
