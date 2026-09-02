import { getConfig, getCookie, readSession } from "./auth/discord/_shared.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
  });
}

function isSnowflake(value) { return /^\d{17,22}$/.test(String(value || "")); }

async function discordJson(path, token) {
  const response = await fetch(`https://discord.com/api/v10${path}`, { headers: { authorization: token } });
  return { response, body: await response.json().catch(() => null) };
}

async function ensureTable(env) {
  if (!env.STATUS_DB) return false;
  await env.STATUS_DB.prepare(`CREATE TABLE IF NOT EXISTS ticket_configs (guild_id TEXT PRIMARY KEY, config_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  return true;
}

async function ownerSession(request, env, guildId) {
  const { sessionSecret, botToken } = getConfig(env);
  const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
  if (!session?.user) return { error: json({ error: "Please log in with Discord again." }, 401) };
  let owner = false;
  if (session.discordAccessToken) {
    const result = await discordJson("/users/@me/guilds", `Bearer ${session.discordAccessToken}`);
    const guild = Array.isArray(result.body) ? result.body.find((item) => String(item.id) === guildId) : null;
    owner = Boolean(guild?.owner);
  }
  if (!owner && botToken) {
    const result = await discordJson(`/guilds/${guildId}`, `Bot ${botToken}`);
    owner = String(result.body?.owner_id || "") === String(session.user.id);
  }
  return owner ? { session } : { error: json({ error: "Only the server owner can configure tickets here." }, 403) };
}

function botAuthorized(request, env) {
  const configured = [env.STATS_SECRET, env.DISCORD_BOT_TOKEN, env.DISCORD_TOKEN, env.BOT_TOKEN, env.TOKEN].filter(Boolean).map(String);
  const authorization = request.headers.get("authorization");
  const statsSecret = request.headers.get("x-stats-secret");
  return configured.some((token) => authorization === `Bearer ${token}` || statsSecret === token);
}

export async function onRequest({ request, env }) {
  const guildId = new URL(request.url).searchParams.get("server") || new URL(request.url).searchParams.get("guildId") || "";
  if (!isSnowflake(guildId)) return json({ error: "A valid server is required." }, 400);
  if (!(await ensureTable(env))) return json({ error: "Ticket storage is not configured." }, 503);

  if (request.method === "GET") {
    if (!botAuthorized(request, env)) return json({ error: "Unauthorized" }, 401);
    const row = await env.STATUS_DB.prepare("SELECT config_json, updated_at FROM ticket_configs WHERE guild_id = ?").bind(guildId).first();
    if (!row) return json({ ok: true, config: null });
    return json({ ok: true, config: JSON.parse(row.config_json), updatedAt: row.updated_at });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = await ownerSession(request, env, guildId);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (!body?.config || typeof body.config !== "object") return json({ error: "Invalid ticket configuration." }, 400);
  const config = JSON.stringify(body.config).slice(0, 100_000);
  await env.STATUS_DB.prepare("INSERT INTO ticket_configs (guild_id, config_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(guild_id) DO UPDATE SET config_json = excluded.config_json, updated_at = CURRENT_TIMESTAMP").bind(guildId, config).run();
  return json({ ok: true, synced: true });
}
