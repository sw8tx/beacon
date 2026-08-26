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
const CACHE_STATS_URL = "https://beacon-bot.site/__discord-stats-cache";
const DISCORD_API_BASE = "https://discord.com/api/v10";
const KNOWN_GUILD_IDS = [
  "1515797025885524049",
  "1529195462735696053",
  "1532057761557254244",
];

function getBotToken(env) {
  return env.DISCORD_BOT_TOKEN || env.DISCORD_TOKEN || env.BOT_TOKEN || env.TOKEN || "";
}

let memoryStats = { ...FALLBACK_STATS };

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      ...(init.headers || {}),
    },
  });
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
    return total + cleanNumber(entry.reports);
  }, 0);

  return Math.max(0, Math.min(100, receivedReports / expectedReports * 100));
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
      id: cleanText(server?.id, 30) || extractGuildId(server?.iconUrl),
      name: cleanText(server?.name, 80),
      members: cleanNumber(server?.members),
      iconUrl: cleanUrl(server?.iconUrl),
    }))
    .filter((server) => server.name)
    .sort((left, right) => right.members - left.members)
    .slice(0, 100);
}

function extractGuildId(iconUrl) {
  const match = String(iconUrl || "").match(/\/icons\/(\d+)\//);
  return match ? match[1] : "";
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

async function fetchDiscordServers(env) {
  const botToken = getBotToken(env);
  if (!botToken) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`${DISCORD_API_BASE}/users/@me/guilds?with_counts=true`, {
      headers: {
        authorization: `Bot ${botToken}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`[discord-stats] Discord guild fallback returned ${response.status}`);
      return [];
    }

    let guilds = await response.json();
    if (!Array.isArray(guilds)) return [];
    if (!guilds.length) {
      guilds = await Promise.all(KNOWN_GUILD_IDS.map(async (guildId) => {
        const guildResponse = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}?with_counts=true`, {
          headers: {
            authorization: `Bot ${botToken}`,
          },
          signal: controller.signal,
        });
        if (!guildResponse.ok) return null;
        return guildResponse.json();
      }));
    }

    return guilds
      .filter(Boolean)
      .map((guild) => ({
        id: cleanText(guild.id, 30),
        name: cleanText(guild.name, 80),
        members: cleanNumber(guild.approximate_member_count),
        iconUrl: guild.icon
          ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
          : null,
      }))
      .filter((guild) => guild.name)
      .sort((left, right) => right.members - left.members)
      .slice(0, 12);
  } catch (err) {
    console.error(`[discord-stats] Discord guild fallback failed: ${err.message}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function readStats(env) {
  try {
    if (env.STATUS_DB) {
      const row = await env.STATUS_DB.prepare(
        "SELECT payload FROM status_state WHERE id = 1"
      ).first();
      if (row?.payload) return JSON.parse(row.payload);
    }
  } catch (err) {
    console.error(`[discord-stats] Failed to read D1 stats: ${err.message}`);
  }

  try {
    if (typeof caches !== "undefined") {
      const cached = await caches.default.match(CACHE_STATS_URL);
      if (cached) return await cached.json();
    }
  } catch (err) {
    console.error(`[discord-stats] Failed to read cached stats: ${err.message}`);
  }

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

async function writeCachedStats(stats) {
  if (typeof caches === "undefined") return false;
  try {
    await caches.default.put(
      CACHE_STATS_URL,
      new Response(JSON.stringify(stats), {
        headers: {
          "cache-control": "public, max-age=300",
          "content-type": "application/json; charset=utf-8",
        },
      })
    );
    return true;
  } catch (err) {
    console.error(`[discord-stats] Failed to write cached stats: ${err.message}`);
    return false;
  }
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

async function updateD1History(env, stats) {
  if (!env.STATUS_DB) return;

  const date = stats.updatedAt.slice(0, 10);
  const minute = stats.updatedAt.slice(0, 16);
  await env.STATUS_DB.batch([
    env.STATUS_DB.prepare(
      "INSERT OR IGNORE INTO status_meta (key, value) VALUES ('monitoring-started-at', ?)"
    ).bind(stats.updatedAt),
    env.STATUS_DB.prepare(`
      INSERT INTO status_history (date, reports, ping_total, last_minute, last_report_at)
      VALUES (?, 1, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        reports = reports + CASE WHEN last_minute <> excluded.last_minute THEN 1 ELSE 0 END,
        ping_total = ping_total + CASE WHEN last_minute <> excluded.last_minute THEN excluded.ping_total ELSE 0 END,
        last_minute = excluded.last_minute,
        last_report_at = excluded.last_report_at
    `).bind(date, stats.ping, minute, stats.updatedAt),
  ]);
}

async function writeStats(env, stats) {
  const storage = {
    database: false,
    hasBinding: Boolean(env.DISCORD_STATS),
    canPut: Boolean(env.DISCORD_STATS && typeof env.DISCORD_STATS.put === "function"),
    cached: false,
    persisted: false,
    error: null,
  };

  memoryStats = stats;
  storage.cached = await writeCachedStats(stats);

  if (env.STATUS_DB) {
    try {
      await env.STATUS_DB.prepare(`
        INSERT INTO status_state (id, payload, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `).bind(JSON.stringify(stats), stats.updatedAt).run();
      await updateD1History(env, stats);
      storage.database = true;
      storage.persisted = true;
      return storage;
    } catch (err) {
      storage.error = err?.message || "D1 write failed";
      console.error(`[discord-stats] Failed to write D1 stats: ${storage.error}`);
    }
  }

  if (env.DISCORD_STATS && typeof env.DISCORD_STATS.put === "function") {
    try {
      await env.DISCORD_STATS.put("latest", JSON.stringify(stats));
      storage.persisted = true;
    } catch (err) {
      storage.error = err?.message || "KV put failed";
      console.error(`[discord-stats] Failed to write latest stats: ${storage.error}`);
      return storage;
    }

    try {
      await updateHistory(env, stats);
    } catch (err) {
      console.error(`[discord-stats] Failed to update history: ${err.message}`);
    }
  }

  return storage;
}

async function handleGet(env) {
  const stats = await readStats(env);
  const missingServerIds = !Array.isArray(stats.servers) || !stats.servers.length || stats.servers.some((server) => !server.id);
  if (missingServerIds) {
    const discordServers = await fetchDiscordServers(env);
    if (discordServers.length) {
      stats.servers = discordServers;
      const discordUsers = discordServers.reduce((sum, server) => sum + server.members, 0);
      if (discordUsers > cleanNumber(stats.users)) stats.users = discordUsers;
      if (discordServers.length > cleanNumber(stats.guilds)) stats.guilds = discordServers.length;
    }
  }
  const updatedAt = Date.parse(stats.updatedAt || "");
  const online = Boolean(stats.online && Number.isFinite(updatedAt) && Date.now() - updatedAt < STALE_AFTER_MS);
  let history = [];
  let monitoringStartedAt = null;

  if (env.STATUS_DB) {
    try {
      const [historyResult, monitoringRow] = await Promise.all([
        env.STATUS_DB.prepare(
          "SELECT date, reports, ping_total AS pingTotal, last_minute AS lastMinute, last_report_at AS lastReportAt FROM status_history ORDER BY date DESC LIMIT 30"
        ).all(),
        env.STATUS_DB.prepare(
          "SELECT value FROM status_meta WHERE key = 'monitoring-started-at'"
        ).first(),
      ]);
      history = (historyResult.results || []).reverse();
      monitoringStartedAt = monitoringRow?.value || null;
    } catch (err) {
      console.error(`[discord-stats] Failed to read D1 history: ${err.message}`);
    }
  } else if (env.DISCORD_STATS) {
    try {
      [history, monitoringStartedAt] = await Promise.all([
        env.DISCORD_STATS.get(HISTORY_KEY, "json").then((value) => Array.isArray(value) ? value : []),
        env.DISCORD_STATS.get(MONITORING_STARTED_KEY),
      ]);
    } catch (err) {
      console.error(`[discord-stats] Failed to read history: ${err.message}`);
    }
  }

  const ageSeconds = Number.isFinite(updatedAt)
    ? Math.max(0, Math.floor((Date.now() - updatedAt) / 1000))
    : null;

  return json({
    ...stats,
    online,
    history,
    monitoringStartedAt,
    uptimePercent: uptimePercent(history, monitoringStartedAt),
    ageSeconds,
  });
}

async function handlePost(request, env) {
  try {
    const auth = request.headers.get("authorization");
    const statsSecretHeader = request.headers.get("x-stats-secret");
    const allowedTokens = [env.STATS_SECRET, getBotToken(env)].filter(Boolean);

    if (!allowedTokens.length) {
      return new Response("Server missing stats authentication", { status: 503 });
    }

    if (!allowedTokens.some((token) => auth === `Bearer ${token}` || statsSecretHeader === token)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const stats = normalizeStats(payload);
    const storage = await writeStats(env, stats);
    return json({ ok: true, updatedAt: stats.updatedAt, storage });
  } catch (err) {
    const message = err?.message || "Unknown Discord stats error";
    console.error(`[discord-stats] POST failed: ${message}`);
    return json({ ok: false, error: message }, { status: 500 });
  }
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "86400",
      },
    });
  }
  if (request.method === "GET" || request.method === "HEAD") return handleGet(env);
  if (request.method === "POST") return handlePost(request, env);
  return json({ ok: false, error: "Method not allowed" }, {
    status: 405,
    headers: { allow: "GET, HEAD, POST" },
  });
}
