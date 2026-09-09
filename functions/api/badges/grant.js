const VALID_BADGES = new Set([
  "beacon-member", "pioneer", "beacon-developer", "verified", "donator", "prestige",
  "staff", "helper", "bug-hunter", "server-booster", "witness", "the-beacon",
  "beacons-princess", "found-the-light", "not-found", "lost-signal", "night-owl",
  "command-relic", "prismatic-key", "lucky-signal",
]);

function botToken(env) {
  return String(env.DISCORD_BOT_TOKEN || env.DISCORD_TOKEN || env.BOT_TOKEN || env.TOKEN || "").replace(/^Bot\s+/i, "").trim();
}

function authorized(request, env) {
  const tokens = [env.STATS_SECRET, botToken(env)].filter(Boolean).map(String);
  const auth = request.headers.get("authorization") || "";
  const header = request.headers.get("x-stats-secret") || "";
  return tokens.some((token) => auth === `Bearer ${token}` || auth === `Bot ${token}` || header === token);
}

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS badge_unlocks (
      user_id TEXT NOT NULL,
      badge_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, badge_id)
    )
  `).run();
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!env.STATUS_DB) return Response.json({ ok: false, error: "Badge database is unavailable" }, { status: 503 });

  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const userId = String(input?.userId || "");
  const badgeId = String(input?.badgeId || "");
  if (!/^\d{17,22}$/.test(userId) || !VALID_BADGES.has(badgeId)) {
    return Response.json({ ok: false, error: "Invalid userId or badgeId" }, { status: 400 });
  }

  await ensureTable(env.STATUS_DB);
  const result = await env.STATUS_DB.prepare(
    "INSERT OR IGNORE INTO badge_unlocks (user_id, badge_id) VALUES (?, ?)"
  ).bind(userId, badgeId).run();

  return Response.json({
    ok: true,
    awarded: Boolean(result?.meta?.changes),
    userId,
    badgeId,
    source: String(input?.source || "system").slice(0, 80),
    reason: String(input?.reason || "").slice(0, 500),
  }, { headers: { "cache-control": "no-store" } });
}

export async function onRequest({ request, env }) {
  if (request.method === "POST") return onRequestPost({ request, env });
  return Response.json({ ok: false, error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
}
