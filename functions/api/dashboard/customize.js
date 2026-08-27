import { getConfig, getCookie, readSession } from "../auth/discord/_shared.js";

const DISCORD_API = "https://discord.com/api/v10";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BIO_LENGTH = 190;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function isSnowflake(value) {
  return /^\d{17,22}$/.test(String(value || ""));
}

function imageBytes(data) {
  const base64 = String(data || "").split(",", 2)[1] || "";
  return Math.floor((base64.replace(/\s/g, "").length * 3) / 4);
}

function validImageData(data) {
  return typeof data === "string" &&
    /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(data) &&
    imageBytes(data) <= MAX_IMAGE_BYTES;
}

async function discordJson(path, token, options = {}) {
  const response = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

export async function onRequestPost({ request, env }) {
  const { sessionSecret, botToken } = getConfig(env);
  const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
  if (!session?.user || !session.discordAccessToken) return json({ error: "Please log in with Discord again." }, 401);
  if (!botToken) return json({ error: "The Beacon bot token is not configured." }, 503);

  const serverId = new URL(request.url).searchParams.get("server") || "";
  if (!isSnowflake(serverId)) return json({ error: "A valid server is required." }, 400);

  const guilds = await discordJson("/users/@me/guilds", `Bearer ${session.discordAccessToken}`);
  if (!guilds.response.ok) return json({ error: "Discord login expired. Please log in again." }, 401);
  const guild = Array.isArray(guilds.body) ? guilds.body.find((item) => item.id === serverId) : null;
  if (!guild?.owner) return json({ error: "Only the server owner can customize Beacon here." }, 403);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Invalid customization data." }, 400);

  const payload = {};
  if (Object.prototype.hasOwnProperty.call(body, "bio")) {
    if (typeof body.bio !== "string" || body.bio.length > MAX_BIO_LENGTH) {
      return json({ error: `The bio must be ${MAX_BIO_LENGTH} characters or less.` }, 400);
    }
    payload.bio = body.bio;
  }
  for (const field of ["avatar", "banner"]) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    if (body[field] !== null && !validImageData(body[field])) {
      return json({ error: `${field === "avatar" ? "Avatar" : "Banner"} must be a PNG, JPG, GIF or WebP image up to 10 MB.` }, 400);
    }
    payload[field] = body[field];
  }

  if (!Object.keys(payload).length) return json({ error: "No changes were submitted." }, 400);

  const result = await discordJson(`/guilds/${serverId}/members/@me`, `Bot ${botToken}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!result.response.ok) {
    const detail = result.body?.message || "Discord rejected the profile update.";
    return json({ error: detail }, result.response.status >= 500 ? 502 : result.response.status);
  }

  return json({ ok: true, message: "Beacon's server profile was updated." });
}
