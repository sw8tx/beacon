import { BEACON_BADGES } from "../../../badges/badge-data.js";

const VALID_BADGES = new Set([
  "beacon-member", "pioneer", "beacon-developer", "verified", "donator", "prestige",
  "staff", "helper", "bug-hunter", "golden-bug-hunter", "server-booster", "witness", "the-beacon",
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

async function sendBadgeDm(env, userId, badgeId, reason) {
  const token = botToken(env);
  if (!token) return false;
  const badge = BEACON_BADGES.find((item) => item.id === badgeId) || { name: badgeId, summary: "A new Beacon badge was added to your profile." };
  try {
    const dmResponse = await fetch("https://discord.com/api/v10/users/@me/channels", { method: "POST", headers: { authorization: `Bot ${token}`, "content-type": "application/json" }, body: JSON.stringify({ recipient_id: userId }) });
    if (!dmResponse.ok) return false;
    const dm = await dmResponse.json();
    const assetId = badge.assetId || badge.id;
    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: "POST",
      headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ embeds: [{ color: 0xff9c1b, title: "Badge achieved", description: `## ${badge.name}\n${badge.summary}\n\n*${reason || "A new badge was added to your Beacon profile."}*`, thumbnail: { url: `https://badges.beacon-bot.site/assets/badges/${assetId}.png?v=2` }, footer: { text: "Beacon · Community OS" } }], components: [{ type: 1, components: [{ type: 2, style: 5, label: "View dashboard", url: "https://beacon-bot.site/dashboard" }, { type: 2, style: 5, label: "View all badges", url: "https://badges.beacon-bot.site/" }] }] }),
    });
    return messageResponse.ok;
  } catch (_) {
    return false;
  }
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
  const confirmedBugCount = Math.max(0, Math.min(1000, Math.floor(Number(input?.confirmedBugCount) || 0)));
  const effectiveBadgeId = badgeId === "bug-hunter" && confirmedBugCount >= 3 ? "golden-bug-hunter" : badgeId;

  await ensureTable(env.STATUS_DB);
  const result = await env.STATUS_DB.prepare(
    "INSERT OR IGNORE INTO badge_unlocks (user_id, badge_id) VALUES (?, ?)"
  ).bind(userId, effectiveBadgeId).run();
  const awarded = Boolean(result?.meta?.changes);
  const notify = input?.notify !== false;
  const dmSent = awarded && notify ? await sendBadgeDm(env, userId, effectiveBadgeId, String(input?.reason || (effectiveBadgeId === "golden-bug-hunter" ? "Three or more genuine Beacon bug reports were confirmed." : "A genuine Beacon bug report was confirmed.")).slice(0, 500)) : false;

  return Response.json({
    ok: true,
    awarded,
    dmSent,
    userId,
    badgeId: effectiveBadgeId,
    confirmedBugCount,
    source: String(input?.source || "system").slice(0, 80),
    reason: String(input?.reason || "").slice(0, 500),
  }, { headers: { "cache-control": "no-store" } });
}

export async function onRequest({ request, env }) {
  if (request.method === "POST") return onRequestPost({ request, env });
  return Response.json({ ok: false, error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
}
