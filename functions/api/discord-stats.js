const FALLBACK_STATS = {
  guilds: 0,
  users: 0,
  commands: 0,
  ping: 0,
  uptime: 0,
  servers: [],
  online: false,
  updatedAt: null
};
const HISTORY_KEY = "daily-history";
const MONITORING_STARTED_KEY = "monitoring-started-at";
const STALE_AFTER_MS = 3 * 60 * 1000;

let memoryStats = { ...FALLBACK_STATS };

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...(init.headers || {})
    }
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
    online: true,
    updatedAt: new Date().toISOString()
  };
}

async function readStats(env) {
  if (env.DISCORD_STATS) {
    const stored = await env.DISCORD_STATS.get("latest", "json");
    return stored || FALLBACK_STATS;
  }

  return memoryStats;
}

async function updateHistory(env, stats) {
  let monitoringStartedAt = await env.DISCORD_STATS.get(MONITORING_STARTED_KEY);
  if (!monitoringStartedAt) {
    monitoringStartedAt = stats.updatedAt;
    await env.DISCORD_STATS.put(MONITORING_STARTED_KEY, monitoringStartedAt);
  }

  const history = await env.DISCORD_STATS.get(HISTORY_KEY, "json") || [];
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
  if (env.DISCORD_STATS) {
    await env.DISCORD_STATS.put("latest", JSON.stringify(stats));
    await updateHistory(env, stats);
  }

  memoryStats = stats;
}

export async function onRequestGet({ env }) {
  const stats = await readStats(env);
  const updatedAt = Date.parse(stats.updatedAt || "");
  const online = Boolean(stats.online && Number.isFinite(updatedAt) && Date.now() - updatedAt < STALE_AFTER_MS);
  let history = [];
  let monitoringStartedAt = null;

  if (env.DISCORD_STATS) {
    [history, monitoringStartedAt] = await Promise.all([
      env.DISCORD_STATS.get(HISTORY_KEY, "json").then((value) => value || []),
      env.DISCORD_STATS.get(MONITORING_STARTED_KEY),
    ]);
  }

  return json({ ...stats, online, history, monitoringStartedAt });
}

export async function onRequestPost({ request, env }) {
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
}
