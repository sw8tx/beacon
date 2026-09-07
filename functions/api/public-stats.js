const API_PATH = "/api/discord-stats";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
}

function botToken(env) {
  return env.DISCORD_BOT_TOKEN || env.DISCORD_TOKEN || env.BOT_TOKEN || env.TOKEN || "";
}

export async function onRequestGet({ request, env }) {
  const token = env.STATS_SECRET || botToken(env);
  if (!token) return json({ error: "Public stats are not configured." }, 503);
  try {
    const response = await fetch(new URL(API_PATH, request.url), {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
    if (!response.ok) return json({ error: "Stats are temporarily unavailable." }, 503);
    const stats = await response.json();
    return json({
      guilds: stats.guilds,
      users: stats.users,
      commands: stats.commands,
      ping: stats.ping,
      uptime: stats.uptime,
      status: stats.status,
      online: stats.online,
      updatedAt: stats.updatedAt,
      servers: Array.isArray(stats.servers) ? stats.servers.map((server) => ({ name: server.name, members: server.members, iconUrl: server.iconUrl })) : [],
      history: Array.isArray(stats.history) ? stats.history : [],
      monitoringStartedAt: stats.monitoringStartedAt || null,
      uptimePercent: stats.uptimePercent ?? null,
      ageSeconds: stats.ageSeconds ?? null,
      incidents: Array.isArray(stats.incidents) ? stats.incidents : [],
    });
  } catch (_) {
    return json({ error: "Stats are temporarily unavailable." }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET" || context.request.method === "HEAD") return onRequestGet(context);
  return json({ error: "Method not allowed" }, 405);
}
