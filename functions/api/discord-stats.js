const FALLBACK_STATS = {
  guilds: 0,
  users: 0,
  commands: 0,
  ping: 0,
  uptime: 0,
  servers: [],
  status: "offline",
  startedAt: null,
  sessionId: null,
  online: false,
  updatedAt: null
};
const HISTORY_KEY = "daily-history";
const MONITORING_STARTED_KEY = "monitoring-started-at";
const STALE_AFTER_MS = 3 * 60 * 1000;

let memoryStats = { ...FALLBACK_STATS };

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function cleanText(value, maxLength = 80) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanUrl(value) {
  const text = cleanText(value, 240);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeServers(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((server) => ({
      name: cleanText(server?.name, 80),
      members: cleanNumber(server?.members),
      iconUrl: cleanUrl(server?.iconUrl),
    }))
    .filter((server) => server.name)
    .sort((left, right) => right.members - left.members)
    .slice(0, 12);
}

function normalizeStats(input) {
  return {
    guilds: cleanNumber(input.guilds),
    users: cleanNumber(input.users),
    commands: cleanNumber(input.commands),
    ping: cleanNumber(input.ping),
    uptime: cleanNumber(input.uptime),
    servers: normalizeServers(input.servers),
    status: cleanText(input.status, 24) || "online",
    startedAt: cleanText(input.startedAt, 40) || null,
    sessionId: cleanText(input.sessionId, 80) || null,
    online: true,
    updatedAt: new Date().toISOString()
  };
}

async function readStats(env) {
  try {
    if (env.DISCORD_STATS) {
      const stored = await env.DISCORD_STATS.get("latest", "json");
      return stored || FALLBACK_STATS;
    }
  } catch (err) {
    console.error(`[discord-stats] Failed to read latest stats: ${err.message}`);
  }

  return memoryStats;
}

async function updateHistory(env, stats) {
  if (!env.DISCORD_STATS) return;

  let monitoringStartedAt = await env.DISCORD_STATS.get(MONITORING_STARTED_KEY);
  if (!monitoringStartedAt) {
    monitoringStartedAt = stats.updatedAt;
    await env.DISCORD_STATS.put(MONITORING_STARTED_KEY, monitoringStartedAt);
  }

  const storedHistory = await env.DISCORD_STATS.get(HISTORY_KEY, "json").catch(() => []);
  const history = Array.isArray(storedHistory) ? storedHistory : [];
  const date = stats.updatedAt.slice(0, 10);
  const minute = stats.updatedAt.slice(0, 16);
  let entry = history.find((item) => item.date === date);
  if (!entry) {
    entry = { date, reports: 0, pingTotal: 0, lastMinute: null, lastReportAt: stats.updatedAt };
    history.push(entry);
  }

  if (entry.lastMinute !== minute) {
    entry.reports += 1;
    entry.pingTotal += stats.ping;
    entry.lastMinute = minute;
  }
  entry.lastReportAt = stats.updatedAt;

  const recentHistory = history
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-30);
  await env.DISCORD_STATS.put(HISTORY_KEY, JSON.stringify(recentHistory));
}

async function writeStats(env, stats) {
  memoryStats = stats;

  if (env.DISCORD_STATS && typeof env.DISCORD_STATS.put === "function") {
    try {
      await env.DISCORD_STATS.put("latest", JSON.stringify(stats));
    } catch (err) {
      console.error(`[discord-stats] Failed to write latest stats: ${err.message}`);
      return;
    }

    try {
      await updateHistory(env, stats);
    } catch (err) {
      console.error(`[discord-stats] Failed to update history: ${err.message}`);
    }
  }
}

async function handleGet(env) {
  const stats = await readStats(env);
  const updatedAt = Date.parse(stats.updatedAt || "");
  const online = Boolean(stats.online && Number.isFinite(updatedAt) && Date.now() - updatedAt < STALE_AFTER_MS);
  let history = [];
  let monitoringStartedAt = null;

  if (env.DISCORD_STATS) {
    try {
      [history, monitoringStartedAt] = await Promise.all([
        env.DISCORD_STATS.get(HISTORY_KEY, "json").then((value) => Array.isArray(value) ? value : []),
        env.DISCORD_STATS.get(MONITORING_STARTED_KEY),
      ]);
    } catch (err) {
      console.error(`[discord-stats] Failed to read history: ${err.message}`);
    }
  }

  return json({ ...stats, online, history, monitoringStartedAt });
}

async function handlePost(request, env) {
  try {
    const auth = request.headers.get("authorization");
    const allowedTokens = [env.STATS_SECRET, env.DISCORD_BOT_TOKEN].filter(Boolean);

    if (!allowedTokens.length) {
      return new Response("Server missing stats authentication", { status: 503 });
    }

    if (!allowedTokens.some((token) => auth === `Bearer ${token}`)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const stats = normalizeStats(payload);
    await writeStats(env, stats);
    return json({ ok: true, updatedAt: stats.updatedAt });
  } catch (err) {
    const message = err?.message || "Unknown Discord stats error";
    console.error(`[discord-stats] POST failed: ${message}`);
    return json({ ok: false, error: message }, { status: 500 });
  }
}

export async function onRequest({ request, env }) {
  if (request.method === "GET" || request.method === "HEAD") return handleGet(env);
  if (request.method === "POST") return handlePost(request, env);
  return json({ ok: false, error: "Method not allowed" }, {
    status: 405,
    headers: { allow: "GET, HEAD, POST" },
  });
}
