import { getConfig, getCookie, readSession } from "../auth/discord/_shared.js";

const DISCORD_API = "https://discord.com/api/v10";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
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

function profileUrls(serverId, userId, profile) {
  const base = `https://cdn.discordapp.com/guilds/${serverId}/users/${userId}`;
  return {
    bio: profile?.bio || "",
    avatar: profile?.avatar || null,
    banner: profile?.banner || null,
    avatarUrl: profile?.avatar ? `${base}/avatars/${profile.avatar}.png?size=1024` : null,
    bannerUrl: profile?.banner ? `${base}/banners/${profile.banner}.png?size=1024` : null,
  };
}

function rateLimitedField(body) {
  const text = JSON.stringify(body || {});
  if (text.includes("AVATAR_RATE_LIMIT")) return "avatar";
  if (text.includes("BANNER_RATE_LIMIT")) return "banner";
  return null;
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

async function updateServerProfile({ request, env }) {
  const { sessionSecret, botToken, profileSyncEndpoint, profileSyncSecret } = getConfig(env);
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
      return json({ error: `${field === "avatar" ? "Avatar" : "Banner"} must be a PNG, JPG or GIF image up to 5 MB.` }, 400);
    }
    payload[field] = normalizeImageData(body[field]);
  }

  if (!Object.keys(payload).length) return json({ error: "No changes were submitted." }, 400);

  const botProfileEndpoint = profileSyncEndpoint && !/bot\.beacon-bot\.site/i.test(profileSyncEndpoint)
    ? profileSyncEndpoint
    : "http://148.251.79.27:27497";
  const profileSyncAuth = profileSyncSecret || botToken;
  if (!profileSyncAuth) return json({ error: "No bot sync authentication is configured." }, 503);
  {
    let botResponse;
    let botBody;
    try {
      botResponse = await fetch(botProfileEndpoint.replace(/\/$/, "") + "/api/profile-sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${profileSyncAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: serverId, ...payload }),
      });
      const botText = await botResponse.text();
      try { botBody = JSON.parse(botText); } catch (_) { botBody = null; }
      if (!botResponse.ok) return json({ error: botBody?.error || `Bot sync failed with HTTP ${botResponse.status}: ${botText.slice(0, 400)}` }, botResponse.status >= 500 ? 502 : botResponse.status);
    } catch (error) {
      return json({ error: `Bot endpoint could not be reached: ${error?.message || "network error"}` }, 502);
    }
    const profile = botBody?.profile || {};
    const base = `https://cdn.discordapp.com/guilds/${serverId}/users/${profile.userId || "0"}`;
    return json({ ok: true, message: botBody.message || "Beacon's server profile was updated by the bot.", profile: {
      bio: profile.bio || payload.bio || "", avatar: profile.avatar || null, banner: profile.banner || null,
      avatarUrl: profile.avatar ? `${base}/avatars/${profile.avatar}.png?size=1024` : null,
      bannerUrl: profile.banner ? `${base}/banners/${profile.banner}.png?size=1024` : null,
    } });
  }

  let result = await discordJson(`/guilds/${serverId}/members/@me`, `Bot ${botToken}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  const skippedRateLimitedFields = [];
  while (!result.response.ok) {
    const limitedField = rateLimitedField(result.body);
    if (!limitedField || !Object.keys(payload).some((field) => field !== limitedField)) break;
    skippedRateLimitedFields.push(limitedField);
    delete payload[limitedField];
    result = await discordJson(`/guilds/${serverId}/members/@me`, `Bot ${botToken}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }
  if (result.response.ok && skippedRateLimitedFields.length) {
    const skipped = skippedRateLimitedFields.join(" and ");
    return json({ ok: true, skippedRateLimitedFields, message: `Other changes were saved. Discord temporarily rate-limited the ${skipped}; try that image again later.` });
  }
  if (!result.response.ok) {
    const fieldErrors = result.body?.errors ? ` ${JSON.stringify(result.body.errors).slice(0, 900)}` : "";
    const detail = `${result.body?.message || "Discord rejected the profile update."}${fieldErrors}`;
    if (result.response.status === 401) return json({ error: "Discord rejected the Cloudflare bot token. Update DISCORD_BOT_TOKEN in Pages Production secrets." }, 503);
    return json({ error: detail }, result.response.status >= 500 ? 502 : result.response.status);
  }

  const profile = result.body || {};
  const botUser = await discordJson("/users/@me", `Bot ${botToken}`);
  return json({ ok: true, message: "Beacon's server profile was saved in this server.", profile: profileUrls(
    serverId,
    profile.user?.id || botUser.body?.id || "0",
    { ...profile, bio: profile.bio ?? payload.bio }
  ) });
}

export async function onRequestGet({ request, env }) {
  try {
    const { sessionSecret, botToken } = getConfig(env);
    const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
    if (!session?.user) return json({ error: "Please log in with Discord again." }, 401);
    if (!botToken) return json({ error: "The Beacon bot token is not configured." }, 503);
    const serverId = new URL(request.url).searchParams.get("server") || "";
    if (!isSnowflake(serverId)) return json({ error: "A valid server is required." }, 400);
    const member = await discordJson(`/guilds/${serverId}/members/@me`, `Bot ${botToken}`);
    if (!member.response.ok) return json({ error: member.body?.message || "Could not load the server profile." }, member.response.status);
    const userId = member.body?.user?.id;
    if (!userId) return json({ error: "Discord returned an incomplete server profile." }, 502);
    return json({ ok: true, profile: profileUrls(serverId, userId, member.body) });
  } catch (error) {
    console.error("[profile-read] unexpected error", error);
    return json({ error: `Profile load failed: ${error?.message || "Cloudflare function error"}` }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    return await updateServerProfile(context);
  } catch (error) {
    console.error("[profile-update] unexpected error", error);
    return json({ error: `Profile update failed: ${error?.message || "Cloudflare function error"}` }, 500);
  }
}
