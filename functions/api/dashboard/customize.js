import { getConfig, getCookie, readSession } from "../auth/discord/_shared.js";

const DISCORD_API = "https://discord.com/api/v10";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
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
    /^data:image\/(png|jpe?g|gif);base64,[a-z0-9+/=\s]+$/i.test(data) &&
    imageBytes(data) <= MAX_IMAGE_BYTES;
}

function normalizeImageData(data) {
  if (data === null) return null;
  const match = String(data).match(/^data:(image\/(?:png|jpe?g|gif));base64,(.*)$/is);
  return match ? `data:${match[1].toLowerCase()};base64,${match[2].replace(/\s/g, "")}` : data;
}

function avatarRateLimited(body) {
  return JSON.stringify(body || {}).includes("AVATAR_RATE_LIMIT");
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
  if (!session?.user) return json({ error: "Please log in with Discord again." }, 401);
  if (!botToken) return json({ error: "The Beacon bot token is not configured." }, 503);

  const serverId = new URL(request.url).searchParams.get("server") || "";
  if (!isSnowflake(serverId)) return json({ error: "A valid server is required." }, 400);

  let ownerVerified = false;
  if (session.discordAccessToken) {
    const userGuilds = await discordJson("/users/@me/guilds", `Bearer ${session.discordAccessToken}`);
    if (userGuilds.response.ok) {
      const guild = Array.isArray(userGuilds.body) ? userGuilds.body.find((item) => item.id === serverId) : null;
      ownerVerified = Boolean(guild?.owner);
    }
  }
  if (!ownerVerified) {
    const guildResult = await discordJson(`/guilds/${serverId}`, `Bot ${botToken}`);
    if (guildResult.response.ok) ownerVerified = String(guildResult.body?.owner_id || "") === String(session.user.id);
    if (!ownerVerified && guildResult.response.status === 401) return json({ error: "The Cloudflare Discord bot token is invalid or outdated. Update DISCORD_BOT_TOKEN in Pages Production secrets." }, 503);
  }
  if (!ownerVerified) {
    return json({ error: "Only the server owner can customize Beacon here." }, 403);
  }

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
      return json({ error: `${field === "avatar" ? "Avatar" : "Banner"} must be a PNG, JPG or GIF image up to 8 MB.` }, 400);
    }
    payload[field] = normalizeImageData(body[field]);
  }

  if (!Object.keys(payload).length) return json({ error: "No changes were submitted." }, 400);

  let result = await discordJson(`/guilds/${serverId}/members/@me`, `Bot ${botToken}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!result.response.ok && avatarRateLimited(result.body) && Object.keys(payload).some((field) => field !== "avatar")) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.avatar;
    result = await discordJson(`/guilds/${serverId}/members/@me`, `Bot ${botToken}`, {
      method: "PATCH",
      body: JSON.stringify(fallbackPayload),
    });
    if (result.response.ok) return json({ ok: true, avatarRateLimited: true, message: "Bio and banner were updated. Discord temporarily rate-limited the avatar; select it again later." });
  }
  if (!result.response.ok) {
    const fieldErrors = result.body?.errors ? ` ${JSON.stringify(result.body.errors).slice(0, 900)}` : "";
    const detail = `${result.body?.message || "Discord rejected the profile update."}${fieldErrors}`;
    if (result.response.status === 401) return json({ error: "Discord rejected the Cloudflare bot token. Update DISCORD_BOT_TOKEN in Pages Production secrets." }, 503);
    return json({ error: detail }, result.response.status >= 500 ? 502 : result.response.status);
  }

  return json({ ok: true, message: "Beacon's server profile was updated." });
}
