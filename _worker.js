var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/auth/discord/_shared.js
var CLIENT_ID = "1529195963787251784";
var DEFAULT_REDIRECT_URI = "https://beacon-bot.site/api/auth/discord/callback";
var encoder = new TextEncoder();
var decoder = new TextDecoder();
function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
__name(base64UrlDecode, "base64UrlDecode");
async function sessionCryptoKey(secret, usage) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [usage]);
}
__name(sessionCryptoKey, "sessionCryptoKey");
async function encryptSessionPayload(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await sessionCryptoKey(secret, "encrypt");
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value)));
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv);
  combined.set(encrypted, iv.length);
  return base64UrlEncode(combined);
}
__name(encryptSessionPayload, "encryptSessionPayload");
async function decryptSessionPayload(value, secret) {
  const combined = base64UrlDecode(value);
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const key = await sessionCryptoKey(secret, "decrypt");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return decoder.decode(decrypted);
}
__name(decryptSessionPayload, "decryptSessionPayload");
async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64UrlEncode(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}
__name(sign, "sign");
function getCookie(request, name) {
  const prefix = `${name}=`;
  const entry = (request.headers.get("cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}
__name(getCookie, "getCookie");
function createCookie(name, value, { maxAge = 0, path = "/", httpOnly = true, domain = "" } = {}) {
  const parts = [`${name}=${value}`, `Path=${path}`, "Secure", "SameSite=Lax"];
  if (domain) parts.push(`Domain=${domain}`);
  if (httpOnly) parts.push("HttpOnly");
  if (maxAge >= 0) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}
__name(createCookie, "createCookie");
function randomState() {
  const value = new Uint8Array(24);
  crypto.getRandomValues(value);
  return base64UrlEncode(value);
}
__name(randomState, "randomState");
function cleanEnv(value) {
  if (value == null) return "";
  const text = String(value).trim();
  if (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).trim();
  }
  return text;
}
__name(cleanEnv, "cleanEnv");
async function createOauthState(secret) {
  const issuedAt = Math.floor(Date.now() / 1e3).toString(36);
  const nonce = randomState();
  const body = `${nonce}.${issuedAt}`;
  return `${body}.${await sign(body, secret)}`;
}
__name(createOauthState, "createOauthState");
async function verifyOauthState(value, secret, maxAgeSeconds = 600) {
  if (!value || !secret) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [nonce, issuedAt, signature] = parts;
  if (!nonce || !issuedAt || !signature) return false;
  const body = `${nonce}.${issuedAt}`;
  if (signature !== await sign(body, secret)) return false;
  const issuedAtSeconds = Number.parseInt(issuedAt, 36);
  if (!Number.isFinite(issuedAtSeconds)) return false;
  return Math.floor(Date.now() / 1e3) - issuedAtSeconds <= maxAgeSeconds;
}
__name(verifyOauthState, "verifyOauthState");
function getConfig(env) {
  const configuredBotToken = cleanEnv(env.DISCORD_BOT_TOKEN || env.DISCORD_TOKEN || env.BOT_TOKEN || env.TOKEN).replace(/^Bot\s+/i, "").trim();
  return {
    clientId: cleanEnv(env.DISCORD_CLIENT_ID || CLIENT_ID),
    clientSecret: cleanEnv(env.DISCORD_CLIENT_SECRET || env.CLIENT_SECRET),
    botToken: configuredBotToken,
    supportGuildId: cleanEnv(env.DISCORD_SUPPORT_GUILD_ID || env.SUPPORT_GUILD_ID || env.DEV_GUILD_ID),
    sessionSecret: cleanEnv(env.AUTH_SESSION_SECRET),
    redirectUri: cleanEnv(env.DISCORD_REDIRECT_URI || env.REDIRECT_URI || DEFAULT_REDIRECT_URI)
  };
}
__name(getConfig, "getConfig");
async function createSession(user, secret, sessionData = {}) {
  const payload = await encryptSessionPayload(JSON.stringify({
    user,
    ...sessionData,
    exp: Math.floor(Date.now() / 1e3) + 60 * 60 * 24 * 7
  }), secret);
  return `${payload}.${await sign(payload, secret)}`;
}
__name(createSession, "createSession");
async function readSession(value, secret) {
  if (!value || !secret) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || signature !== await sign(payload, secret)) return null;
  try {
    let session;
    try {
      session = JSON.parse(decoder.decode(base64UrlDecode(payload)));
    } catch {
      session = JSON.parse(await decryptSessionPayload(payload, secret));
    }
    return session.exp > Math.floor(Date.now() / 1e3) ? session : null;
  } catch {
    return null;
  }
}
__name(readSession, "readSession");
function avatarUrl(user) {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=128`;
  const index = Number((BigInt(user.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
__name(avatarUrl, "avatarUrl");
function errorResponse(message, status = 500) {
  const loginHref = "/api/auth/discord/login";
  const html3 = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <title>Beacon Login</title>
    <style>
      *{box-sizing:border-box}body{min-height:100vh;margin:0;background:#000;color:#f6f4ec;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;padding:24px}.box{width:min(100%,520px);border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#0b0c10;padding:28px}.eyebrow{margin:0 0 10px;color:#ffc31c;font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h1{margin:0 0 10px;font-size:1.55rem}p{margin:0 0 20px;color:#b7bbc8;line-height:1.55}a{display:inline-flex;min-height:42px;align-items:center;justify-content:center;border-radius:7px;background:#ffc31c;color:#070707;padding:0 16px;font-weight:800;text-decoration:none}
    </style>
  </head>
  <body>
    <main class="box">
      <p class="eyebrow">Beacon Login</p>
      <h1>Discord login needs a fresh start.</h1>
      <p>${message}</p>
      <a href="${loginHref}">Start login again</a>
    </main>
  </body>
</html>`;
  return new Response(html3, { status, headers: { "cache-control": "no-store", "content-type": "text/html; charset=utf-8" } });
}
__name(errorResponse, "errorResponse");

// api/auth/discord/callback.js
var DISCORD_API = "https://discord.com/api/v10";
var DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
function tokenErrorMessage(details) {
  let parsed = null;
  try {
    parsed = JSON.parse(details || "{}");
  } catch {
    parsed = null;
  }
  const code = String(parsed?.error || "").toLowerCase();
  const description = String(parsed?.error_description || parsed?.message || "").slice(0, 180);
  if (code === "invalid_client") {
    return "Discord rejected the Client Secret. Regenerate the OAuth2 Client Secret in the Discord Developer Portal and update DISCORD_CLIENT_SECRET in Cloudflare.";
  }
  if (code === "invalid_grant") {
    return `Discord rejected this login code. Start a fresh login and make sure the Discord redirect URL is exactly https://beacon-bot.site/api/auth/discord/callback.${description ? ` Discord said: ${description}` : ""}`;
  }
  if (code === "invalid_request") {
    return `Discord rejected the login request.${description ? ` Discord said: ${description}` : " Please start the login again."}`;
  }
  return `Discord could not finish the login.${description ? ` Discord said: ${description}` : " Please start the login again."}`;
}
__name(tokenErrorMessage, "tokenErrorMessage");
function restartLogin(request) {
  const loginUrl = new URL("/api/auth/discord/login", request.url);
  loginUrl.searchParams.set("fresh", Date.now().toString(36));
  const headers = new Headers({ Location: loginUrl.toString() });
  headers.append("Set-Cookie", createCookie("discord_oauth_state", "", { maxAge: 0, path: "/" }));
  headers.append("Set-Cookie", createCookie("discord_oauth_state", "", { maxAge: 0, path: "/api/auth/discord/callback" }));
  return new Response(null, { status: 302, headers });
}
__name(restartLogin, "restartLogin");
async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const { clientId, clientSecret, sessionSecret, redirectUri } = getConfig(env);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = getCookie(request, "discord_oauth_state");
  if (url.searchParams.has("error")) return errorResponse("Discord login was cancelled.", 400);
  if (!clientSecret || !sessionSecret) return errorResponse("Discord login is not configured yet. Add the required Cloudflare secrets.", 503);
  const hasCookieState = Boolean(expectedState && state && state === expectedState);
  const hasSignedState = await verifyOauthState(state, sessionSecret);
  if (!code || !state || !hasCookieState && !hasSignedState) return restartLogin(request);
  try {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    });
    const basicAuth = btoa(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`);
    const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: tokenBody.toString()
    });
    if (!tokenResponse.ok) {
      const details = await tokenResponse.text().catch(() => "");
      console.error(`[discord-oauth] Token exchange failed: ${tokenResponse.status} ${details.slice(0, 240)}`);
      return errorResponse(tokenErrorMessage(details), 400);
    }
    const token = await tokenResponse.json();
    const userResponse = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!userResponse.ok) return errorResponse("Discord profile could not be loaded.", 400);
    const discordUser = await userResponse.json();
    const user = {
      id: String(discordUser.id),
      username: String(discordUser.global_name || discordUser.username || "Discord user").slice(0, 80),
      avatar: avatarUrl(discordUser)
    };
    const session = await createSession(user, sessionSecret, { discordAccessToken: token.access_token });
    const next = getCookie(request, "beacon_login_next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    const headers = new Headers({ Location: new URL(safeNext, request.url).toString() });
    headers.append("Set-Cookie", createCookie("beacon_session", session, { maxAge: 60 * 60 * 24 * 7, domain: ".beacon-bot.site" }));
    headers.append("Set-Cookie", createCookie("beacon_session", session, { maxAge: 60 * 60 * 24 * 7 }));
    headers.append("Set-Cookie", createCookie("discord_oauth_state", "", { maxAge: 0, path: "/" }));
    headers.append("Set-Cookie", createCookie("beacon_login_next", "", { maxAge: 0, path: "/" }));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error(`[discord-oauth] Callback failed: ${error instanceof Error ? error.message : String(error)}`);
    return errorResponse("Discord login could not be completed. Please try again.", 400);
  }
}
__name(onRequestGet, "onRequestGet");

// api/auth/discord/login.js
var CANONICAL_HOST = "beacon-bot.site";
async function onRequestGet2({ request, env }) {
  const requestUrl = new URL(request.url);
  const requestHost = request.headers.get("host") || requestUrl.hostname;
  if (requestHost !== CANONICAL_HOST) {
    const canonicalUrl = new URL(requestUrl.pathname, `https://${CANONICAL_HOST}`);
    canonicalUrl.search = requestUrl.search;
    return Response.redirect(canonicalUrl.toString(), 302);
  }
  const { clientId, redirectUri, sessionSecret } = getConfig(env);
  const state = sessionSecret ? await createOauthState(sessionSecret) : randomState();
  const next = requestUrl.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next.slice(0, 180) : "/";
  const authorizationUrl = new URL("https://discord.com/oauth2/authorize");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("scope", "identify guilds");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("prompt", "consent");
  const response = new Response(null, {
    status: 302,
    headers: {
      Location: authorizationUrl.toString(),
      "Set-Cookie": createCookie("discord_oauth_state", state, { maxAge: 600, path: "/" })
    }
  });
  response.headers.append("Set-Cookie", createCookie("beacon_login_next", safeNext, { maxAge: 600, path: "/" }));
  return response;
}
__name(onRequestGet2, "onRequestGet");

// api/auth/discord/logout.js
async function onRequestPost() {
  const headers = new Headers();
  headers.append("Set-Cookie", createCookie("beacon_session", "", { maxAge: 0, domain: ".beacon-bot.site" }));
  headers.append("Set-Cookie", createCookie("beacon_session", "", { maxAge: 0 }));
  return new Response(null, { status: 204, headers });
}
__name(onRequestPost, "onRequestPost");

// api/auth/discord/session.js
async function onRequestGet3({ request, env }) {
  const { sessionSecret } = getConfig(env);
  const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
  if (!session) {
    return Response.json({ user: null, signedIn: false }, {
      status: 401,
      headers: { "cache-control": "no-store" }
    });
  }
  return Response.json({ user: session.user }, { headers: { "cache-control": "no-store" } });
}
__name(onRequestGet3, "onRequestGet");

// api/dashboard/customize.js
var DISCORD_API2 = "https://discord.com/api/v10";
var MAX_IMAGE_BYTES = 8 * 1024 * 1024;
var MAX_BIO_LENGTH = 190;
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8"
    }
  });
}
__name(json, "json");
function isSnowflake(value) {
  return /^\d{17,22}$/.test(String(value || ""));
}
__name(isSnowflake, "isSnowflake");
function imageBytes(data) {
  const base64 = String(data || "").split(",", 2)[1] || "";
  return Math.floor(base64.replace(/\s/g, "").length * 3 / 4);
}
__name(imageBytes, "imageBytes");
function validImageData(data) {
  return typeof data === "string" && /^data:image\/(png|jpe?g|gif);base64,[a-z0-9+/=\s]+$/i.test(data) && imageBytes(data) <= MAX_IMAGE_BYTES;
}
__name(validImageData, "validImageData");
function normalizeImageData(data) {
  if (data === null) return null;
  const match2 = String(data).match(/^data:(image\/(?:png|jpe?g|gif));base64,(.*)$/is);
  return match2 ? `data:${match2[1].toLowerCase()};base64,${match2[2].replace(/\s/g, "")}` : data;
}
__name(normalizeImageData, "normalizeImageData");
function rateLimitedField(body) {
  const text = JSON.stringify(body || {});
  if (text.includes("AVATAR_RATE_LIMIT")) return "avatar";
  if (text.includes("BANNER_RATE_LIMIT")) return "banner";
  return null;
}
__name(rateLimitedField, "rateLimitedField");
async function discordJson(path, token, options = {}) {
  const response = await fetch(`${DISCORD_API2}${path}`, {
    ...options,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      ...options.headers || {}
    }
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}
__name(discordJson, "discordJson");
async function updateServerProfile({ request, env }) {
  const { sessionSecret, botToken: botToken2 } = getConfig(env);
  const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
  if (!session?.user) return json({ error: "Please log in with Discord again." }, 401);
  if (!botToken2) return json({ error: "The Beacon bot token is not configured." }, 503);
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
    const guildResult = await discordJson(`/guilds/${serverId}`, `Bot ${botToken2}`);
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
  let result = await discordJson(`/guilds/${serverId}/members/@me`, `Bot ${botToken2}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  const skippedRateLimitedFields = [];
  while (!result.response.ok) {
    const limitedField = rateLimitedField(result.body);
    if (!limitedField || !Object.keys(payload).some((field) => field !== limitedField)) break;
    skippedRateLimitedFields.push(limitedField);
    delete payload[limitedField];
    result = await discordJson(`/guilds/${serverId}/members/@me`, `Bot ${botToken2}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
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
  return json({ ok: true, message: "Beacon's server profile was saved in this server.", profile: {
    bio: profile.bio || payload.bio || "",
    avatar: profile.avatar || null,
    banner: profile.banner || null
  } });
}
__name(updateServerProfile, "updateServerProfile");
async function onRequestPost2(context) {
  try {
    return await updateServerProfile(context);
  } catch (error) {
    console.error("[profile-update] unexpected error", error);
    return json({ error: `Profile update failed: ${error?.message || "Cloudflare function error"}` }, 500);
  }
}
__name(onRequestPost2, "onRequestPost");

// api/public-stats.js
var API_PATH = "/api/discord-stats";
function json2(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }
  });
}
__name(json2, "json");
function botToken(env) {
  return env.DISCORD_BOT_TOKEN || env.DISCORD_TOKEN || env.BOT_TOKEN || env.TOKEN || "";
}
__name(botToken, "botToken");
async function onRequestGet4({ request, env }) {
  const token = env.STATS_SECRET || botToken(env);
  if (!token) return json2({ error: "Public stats are not configured." }, 503);
  try {
    const response = await fetch(new URL(API_PATH, request.url), {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" }
    });
    if (!response.ok) return json2({ error: "Stats are temporarily unavailable." }, 503);
    const stats = await response.json();
    return json2({
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
      incidents: Array.isArray(stats.incidents) ? stats.incidents : []
    });
  } catch (_) {
    return json2({ error: "Stats are temporarily unavailable." }, 503);
  }
}
__name(onRequestGet4, "onRequestGet");
async function onRequest(context) {
  if (context.request.method === "GET" || context.request.method === "HEAD") return onRequestGet4(context);
  return json2({ error: "Method not allowed" }, 405);
}
__name(onRequest, "onRequest");

// api/discord-stats.js
var statusEvents = [{ id: "website-improvements-2026-09-05", title: "Website improvements (maintenance)", startedAt: "2026-09-05T11:15:00+02:00", resolvedAt: "2026-09-05T11:30:00+02:00", durationSeconds: 900 }];
var FALLBACK_STATS = {
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
var HISTORY_KEY = "daily-history";
var MONITORING_STARTED_KEY = "monitoring-started-at";
var INCIDENTS_KEY = "status-incidents";
var STALE_AFTER_MS = 3 * 60 * 1e3;
var CACHE_STATS_URL = "https://beacon-bot.site/__discord-stats-cache";
var DISCORD_API_BASE = "https://discord.com/api/v10";
var KNOWN_GUILD_IDS = [
  "1515797025885524049",
  "1529195462735696053",
  "1532057761557254244"
];
function getBotToken(env) {
  return env.DISCORD_BOT_TOKEN || env.DISCORD_TOKEN || env.BOT_TOKEN || env.TOKEN || "";
}
__name(getBotToken, "getBotToken");
var memoryStats = { ...FALLBACK_STATS };
function json3(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      ...init.headers || {}
    }
  });
}
__name(json3, "json");
function uptimePercent(history, monitoringStartedAt) {
  const startedAt = Date.parse(monitoringStartedAt || "");
  if (!Number.isFinite(startedAt)) return null;
  const now = Date.now();
  if (now - startedAt < 30 * 864e5) return null;
  const windowStart = Math.max(startedAt, now - 30 * 864e5);
  const expectedReports = Math.max(1, Math.floor((now - windowStart) / 6e4) + 1);
  const receivedReports = history.reduce((total, entry) => {
    const day = Date.parse(`${entry.date}T00:00:00.000Z`);
    if (!Number.isFinite(day) || day + 864e5 <= windowStart) return total;
    return total + cleanNumber(entry.reports);
  }, 0);
  return Math.max(0, Math.min(100, receivedReports / expectedReports * 100));
}
__name(uptimePercent, "uptimePercent");
function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}
__name(cleanNumber, "cleanNumber");
function cleanText(value, maxLength = 80) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
__name(cleanText, "cleanText");
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
__name(cleanUrl, "cleanUrl");
function normalizeServers(input) {
  if (!Array.isArray(input)) return [];
  return input.map((server) => ({
    id: cleanText(server?.id, 30) || extractGuildId(server?.iconUrl),
    name: cleanText(server?.name, 80),
    members: cleanNumber(server?.members),
    bots: cleanNumber(server?.bots),
    channels: cleanNumber(server?.channels),
    roles: cleanNumber(server?.roles),
    categories: cleanNumber(server?.categories),
    shardId: cleanNumber(server?.shardId),
    iconUrl: cleanUrl(server?.iconUrl)
  })).filter((server) => server.name).sort((left, right) => right.members - left.members).slice(0, 100);
}
__name(normalizeServers, "normalizeServers");
function extractGuildId(iconUrl) {
  const match2 = String(iconUrl || "").match(/\/icons\/(\d+)\//);
  return match2 ? match2[1] : "";
}
__name(extractGuildId, "extractGuildId");
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
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(normalizeStats, "normalizeStats");
async function fetchDiscordServers(env) {
  const botToken2 = getBotToken(env);
  if (!botToken2) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`${DISCORD_API_BASE}/users/@me/guilds?with_counts=true`, {
      headers: {
        authorization: `Bot ${botToken2}`
      },
      signal: controller.signal
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
            authorization: `Bot ${botToken2}`
          },
          signal: controller.signal
        });
        if (!guildResponse.ok) return null;
        return guildResponse.json();
      }));
    }
    return guilds.filter(Boolean).map((guild) => ({
      id: cleanText(guild.id, 30),
      name: cleanText(guild.name, 80),
      members: cleanNumber(guild.approximate_member_count),
      iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null
    })).filter((guild) => guild.name).sort((left, right) => right.members - left.members).slice(0, 12);
  } catch (err) {
    console.error(`[discord-stats] Discord guild fallback failed: ${err.message}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
__name(fetchDiscordServers, "fetchDiscordServers");
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
__name(readStats, "readStats");
async function writeCachedStats(stats) {
  if (typeof caches === "undefined") return false;
  try {
    await caches.default.put(
      CACHE_STATS_URL,
      new Response(JSON.stringify(stats), {
        headers: {
          "cache-control": "public, max-age=300",
          "content-type": "application/json; charset=utf-8"
        }
      })
    );
    return true;
  } catch (err) {
    console.error(`[discord-stats] Failed to write cached stats: ${err.message}`);
    return false;
  }
}
__name(writeCachedStats, "writeCachedStats");
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
  const recentHistory = history.sort((left, right) => left.date.localeCompare(right.date)).slice(-30);
  await env.DISCORD_STATS.put(HISTORY_KEY, JSON.stringify(recentHistory));
}
__name(updateHistory, "updateHistory");
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
    `).bind(date, stats.ping, minute, stats.updatedAt)
  ]);
}
__name(updateD1History, "updateD1History");
function trustedStatsRequest(request, env) {
  const tokens = [env.STATS_SECRET, getBotToken(env)].filter(Boolean).map(String);
  const authorization = request.headers.get("authorization");
  const statsSecret = request.headers.get("x-stats-secret");
  return tokens.some((token) => authorization === `Bearer ${token}` || authorization === `Bot ${token}` || statsSecret === token);
}
__name(trustedStatsRequest, "trustedStatsRequest");
function publicStats(stats) {
  return {
    guilds: stats.guilds,
    users: stats.users,
    commands: stats.commands,
    ping: stats.ping,
    uptime: stats.uptime,
    status: stats.status,
    online: stats.online,
    startedAt: stats.startedAt,
    updatedAt: stats.updatedAt,
    servers: (Array.isArray(stats.servers) ? stats.servers : []).map((server) => ({
      name: server.name,
      members: server.members,
      iconUrl: server.iconUrl
    }))
  };
}
__name(publicStats, "publicStats");
async function readIncidents(env) {
  try {
    if (env.STATUS_DB) {
      const row = await env.STATUS_DB.prepare("SELECT value FROM status_meta WHERE key = ?").bind(INCIDENTS_KEY).first();
      const parsed = JSON.parse(row?.value || "[]");
      return Array.isArray(parsed) ? parsed : [];
    }
    if (env.DISCORD_STATS) {
      const stored = await env.DISCORD_STATS.get(INCIDENTS_KEY, "json");
      return Array.isArray(stored) ? stored : [];
    }
  } catch (err) {
    console.error(`[discord-stats] Failed to read incidents: ${err.message}`);
  }
  return [];
}
__name(readIncidents, "readIncidents");
async function writeIncidents(env, incidents) {
  const value = JSON.stringify(incidents.slice(0, 20));
  try {
    if (env.STATUS_DB) {
      await env.STATUS_DB.prepare("INSERT INTO status_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(INCIDENTS_KEY, value).run();
      return;
    }
    if (env.DISCORD_STATS) await env.DISCORD_STATS.put(INCIDENTS_KEY, value);
  } catch (err) {
    console.error(`[discord-stats] Failed to write incidents: ${err.message}`);
  }
}
__name(writeIncidents, "writeIncidents");
async function writeStats(env, stats) {
  const previous = await readStats(env);
  const previousAt = Date.parse(previous.updatedAt || "");
  const currentAt = Date.parse(stats.updatedAt || "");
  const incidents = await readIncidents(env);
  if (Number.isFinite(previousAt) && Number.isFinite(currentAt) && currentAt - previousAt >= STALE_AFTER_MS) {
    incidents.unshift({
      id: `incident_${currentAt}`,
      startedAt: new Date(previousAt).toISOString(),
      resolvedAt: new Date(currentAt).toISOString(),
      durationSeconds: Math.floor((currentAt - previousAt) / 1e3),
      title: "Beacon monitoring interruption"
    });
    await writeIncidents(env, incidents);
  }
  const storage = {
    database: false,
    hasBinding: Boolean(env.DISCORD_STATS),
    canPut: Boolean(env.DISCORD_STATS && typeof env.DISCORD_STATS.put === "function"),
    cached: false,
    persisted: false,
    error: null
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
__name(writeStats, "writeStats");
async function handleGet(request, env) {
  if (!trustedStatsRequest(request, env)) return json3({ error: "Unauthorized" }, { status: 401 });
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
        ).first()
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
        env.DISCORD_STATS.get(MONITORING_STARTED_KEY)
      ]);
    } catch (err) {
      console.error(`[discord-stats] Failed to read history: ${err.message}`);
    }
  }
  const ageSeconds = Number.isFinite(updatedAt) ? Math.max(0, Math.floor((Date.now() - updatedAt) / 1e3)) : null;
  const incidents = await readIncidents(env);
  const currentIncident = !online && Number.isFinite(updatedAt) ? [{ id: "active_monitoring", startedAt: new Date(updatedAt).toISOString(), resolvedAt: null, title: "Beacon monitoring interruption" }] : [];
  const responseStats = trustedStatsRequest(request, env) ? stats : publicStats(stats);
  return json3({
    ...responseStats,
    online,
    history,
    monitoringStartedAt,
    uptimePercent: uptimePercent(history, monitoringStartedAt),
    ageSeconds,
    incidents: [...currentIncident, ...incidents, ...statusEvents].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 20)
  });
}
__name(handleGet, "handleGet");
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
    return json3({ ok: true, updatedAt: stats.updatedAt, storage });
  } catch (err) {
    const message = err?.message || "Unknown Discord stats error";
    console.error(`[discord-stats] POST failed: ${message}`);
    return json3({ ok: false, error: message }, { status: 500 });
  }
}
__name(handlePost, "handlePost");
async function onRequest2({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "86400"
      }
    });
  }
  if (request.method === "GET" || request.method === "HEAD") return handleGet(request, env);
  if (request.method === "POST") return handlePost(request, env);
  return json3({ ok: false, error: "Method not allowed" }, {
    status: 405,
    headers: { allow: "GET, HEAD, POST" }
  });
}
__name(onRequest2, "onRequest");

// api/ticket-config.js
function json4(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" }
  });
}
__name(json4, "json");
function isSnowflake2(value) {
  return /^\d{17,22}$/.test(String(value || ""));
}
__name(isSnowflake2, "isSnowflake");
async function discordJson2(path, token) {
  const response = await fetch(`https://discord.com/api/v10${path}`, { headers: { authorization: token } });
  return { response, body: await response.json().catch(() => null) };
}
__name(discordJson2, "discordJson");
async function ensureTable(env) {
  if (!env.STATUS_DB) return false;
  await env.STATUS_DB.prepare(`CREATE TABLE IF NOT EXISTS ticket_configs (guild_id TEXT PRIMARY KEY, config_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  return true;
}
__name(ensureTable, "ensureTable");
async function ownerSession(request, env, guildId) {
  const { sessionSecret, botToken: botToken2 } = getConfig(env);
  const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
  if (!session?.user) return { error: json4({ error: "Please log in with Discord again." }, 401) };
  let owner = false;
  if (session.discordAccessToken) {
    const result = await discordJson2("/users/@me/guilds", `Bearer ${session.discordAccessToken}`);
    const guild = Array.isArray(result.body) ? result.body.find((item) => String(item.id) === guildId) : null;
    owner = Boolean(guild?.owner);
  }
  if (!owner && botToken2) {
    const result = await discordJson2(`/guilds/${guildId}`, `Bot ${botToken2}`);
    owner = String(result.body?.owner_id || "") === String(session.user.id);
  }
  return owner ? { session } : { error: json4({ error: "Only the server owner can configure tickets here." }, 403) };
}
__name(ownerSession, "ownerSession");
function botAuthorized(request, env) {
  const configured = [env.STATS_SECRET, env.DISCORD_BOT_TOKEN, env.DISCORD_TOKEN, env.BOT_TOKEN, env.TOKEN].filter(Boolean).map(String);
  const authorization = request.headers.get("authorization");
  const statsSecret = request.headers.get("x-stats-secret");
  return configured.some((token) => authorization === `Bearer ${token}` || statsSecret === token);
}
__name(botAuthorized, "botAuthorized");
async function onRequest3({ request, env }) {
  const guildId = new URL(request.url).searchParams.get("server") || new URL(request.url).searchParams.get("guildId") || "";
  if (!isSnowflake2(guildId)) return json4({ error: "A valid server is required." }, 400);
  if (!await ensureTable(env)) return json4({ error: "Ticket storage is not configured." }, 503);
  if (request.method === "GET") {
    if (!botAuthorized(request, env)) return json4({ error: "Unauthorized" }, 401);
    const row = await env.STATUS_DB.prepare("SELECT config_json, updated_at FROM ticket_configs WHERE guild_id = ?").bind(guildId).first();
    if (!row) return json4({ ok: true, config: null });
    return json4({ ok: true, config: JSON.parse(row.config_json), updatedAt: row.updated_at });
  }
  if (request.method !== "POST") return json4({ error: "Method not allowed" }, 405);
  const auth = await ownerSession(request, env, guildId);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (!body?.config || typeof body.config !== "object") return json4({ error: "Invalid ticket configuration." }, 400);
  const config = JSON.stringify(body.config).slice(0, 1e5);
  await env.STATUS_DB.prepare("INSERT INTO ticket_configs (guild_id, config_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(guild_id) DO UPDATE SET config_json = excluded.config_json, updated_at = CURRENT_TIMESTAMP").bind(guildId, config).run();
  return json4({ ok: true, synced: true });
}
__name(onRequest3, "onRequest");

// api/[[path]].js
async function onRequest4(context) {
  const pathname = new URL(context.request.url).pathname;
  if (pathname === "/api/discord-stats") return onRequest2(context);
  if (pathname === "/api/public-stats") return onRequest(context);
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
__name(onRequest4, "onRequest");

// docs/[[path]].js
function onRequest5() {
  return new Response(null, {
    status: 404,
    headers: { "cache-control": "no-store" }
  });
}
__name(onRequest5, "onRequest");

// status/[[path]].js
var statusEvents2 = [{ id: "website-improvements-2026-09-05", title: "Website improvements (maintenance)", startedAt: "2026-09-05T11:15:00+02:00", resolvedAt: "2026-09-05T11:30:00+02:00", durationSeconds: 900 }];
var STALE_AFTER_MS2 = 3 * 60 * 1e3;
var FALLBACK_STATS2 = {
  guilds: 0,
  users: 0,
  ping: 0,
  uptime: 0,
  online: false,
  updatedAt: null,
  startedAt: null,
  history: [],
  monitoringStartedAt: null,
  uptimePercent: null
};
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
__name(escapeHtml, "escapeHtml");
function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-US") : "--";
}
__name(formatNumber, "formatNumber");
function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
__name(formatDuration, "formatDuration");
function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : "--";
}
__name(formatPercent, "formatPercent");
function formatMonitoringDate(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(timestamp) : "the monitoring start date";
}
__name(formatMonitoringDate, "formatMonitoringDate");
function hasNumericValue(value) {
  return value !== null && value !== void 0 && value !== "" && Number.isFinite(Number(value));
}
__name(hasNumericValue, "hasNumericValue");
function uptimePercent2(history, monitoringStartedAt) {
  const startedAt = Date.parse(monitoringStartedAt || "");
  if (!Number.isFinite(startedAt)) return null;
  const now = Date.now();
  if (now - startedAt < 30 * 864e5) return null;
  const windowStart = Math.max(startedAt, now - 30 * 864e5);
  const expectedReports = Math.max(1, Math.floor((now - windowStart) / 6e4) + 1);
  const receivedReports = history.reduce((total, entry) => {
    const day = Date.parse(`${entry.date}T00:00:00.000Z`);
    if (!Number.isFinite(day) || day + 864e5 <= windowStart) return total;
    return total + Math.max(0, Number(entry.reports) || 0);
  }, 0);
  return Math.max(0, Math.min(100, receivedReports / expectedReports * 100));
}
__name(uptimePercent2, "uptimePercent");
async function readStatus(env) {
  let stats = { ...FALLBACK_STATS2 };
  let history = [];
  let monitoringStartedAt = null;
  let incidents = [];
  if (env.STATUS_DB) {
    try {
      const [stateRow, historyResult, monitoringRow, incidentsRow] = await Promise.all([
        env.STATUS_DB.prepare("SELECT payload FROM status_state WHERE id = 1").first(),
        env.STATUS_DB.prepare(
          "SELECT date, reports, ping_total AS pingTotal, last_minute AS lastMinute, last_report_at AS lastReportAt FROM status_history ORDER BY date DESC LIMIT 30"
        ).all(),
        env.STATUS_DB.prepare("SELECT value FROM status_meta WHERE key = 'monitoring-started-at'").first(),
        env.STATUS_DB.prepare("SELECT value FROM status_meta WHERE key = 'status-incidents'").first()
      ]);
      if (stateRow?.payload) stats = { ...stats, ...JSON.parse(stateRow.payload) };
      history = (historyResult.results || []).reverse();
      monitoringStartedAt = monitoringRow?.value || null;
      incidents = JSON.parse(incidentsRow?.value || "[]");
    } catch (error) {
      console.error(`[status] Failed to read D1 status: ${error.message}`);
    }
  }
  const updatedAt = Date.parse(stats.updatedAt || "");
  const online = Boolean(stats.online && Number.isFinite(updatedAt) && Date.now() - updatedAt < STALE_AFTER_MS2);
  const ageSeconds = Number.isFinite(updatedAt) ? Math.max(0, Math.floor((Date.now() - updatedAt) / 1e3)) : null;
  const measuredUptime = hasNumericValue(stats.uptimePercent) ? Number(stats.uptimePercent) : uptimePercent2(history, monitoringStartedAt);
  return {
    ...stats,
    online,
    history,
    monitoringStartedAt,
    ageSeconds,
    uptimePercent: measuredUptime,
    incidents: [...Array.isArray(incidents) ? incidents : [], ...statusEvents2].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)),
    statusState: !Number.isFinite(updatedAt) ? "monitoring-unavailable" : online ? "operational" : "service-outage"
  };
}
__name(readStatus, "readStatus");
function replaceContent(html3, selector, value) {
  return html3.replace(
    new RegExp(`(<[^>]+${selector}[^>]*>)([\\s\\S]*?)(</[^>]+>)`),
    `$1${escapeHtml(value)}$3`
  );
}
__name(replaceContent, "replaceContent");
function incidentDate(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "Unknown";
}
__name(incidentDate, "incidentDate");
function incidentMarkup(incidents) {
  if (!Array.isArray(incidents) || !incidents.length) return "<p>No incidents recorded in the current monitoring window.</p>";
  return incidents.slice(0, 20).map((incident) => {
    const start = Date.parse(incident.startedAt || "");
    const end = Date.parse(incident.resolvedAt || "");
    const duration = Number.isFinite(start) && Number.isFinite(end) ? ` \xB7 Duration: ${formatDuration((end - start) / 1e3)}` : " \xB7 Ongoing";
    return `<article><strong>${incident.resolvedAt ? "Resolved" : "Ongoing"}: ${escapeHtml(incident.title || "Service interruption")}</strong><span>From ${escapeHtml(incidentDate(incident.startedAt))}${incident.resolvedAt ? ` to ${escapeHtml(incidentDate(incident.resolvedAt))}` : ""}${duration}</span></article>`;
  }).join("");
}
__name(incidentMarkup, "incidentMarkup");
function dailyStatsMarkup(history) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const days = (history || []).filter((entry) => entry?.date).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-3);
  if (!days.length) return '<p class="daily-stats-empty">No daily monitoring data recorded yet.</p>';
  return days.map((entry) => {
    const reports = Math.max(0, Number(entry.reports) || 0);
    const expected = entry.date === today ? Math.max(1, Math.floor((Date.now() - Date.parse(`${today}T00:00:00.000Z`)) / 6e4) + 1) : 1440;
    const percent = Math.min(100, reports / expected * 100);
    const state = percent >= 99 ? "up" : percent >= 95 ? "degraded" : "down";
    const date = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${entry.date}T12:00:00.000Z`));
    const ping = reports && Number(entry.pingTotal) ? `${Math.round(Number(entry.pingTotal) / reports)} ms` : "--";
    const stateLabel = state === "up" ? "Operational" : state === "degraded" ? "Degraded" : "Outage";
    return `<article class="daily-stat-tile daily-stat-tile--${state}"><div class="daily-stat-heading"><strong>${escapeHtml(date)}</strong><b>${stateLabel}</b></div><div class="daily-stat-metrics"><span><b>${percent.toFixed(2)}%</b><small>Uptime</small></span><span><b>${ping}</b><small>Avg. ping</small></span><span><b>${formatNumber(reports)}</b><small>Checks</small></span></div></article>`;
  }).join("");
}
__name(dailyStatsMarkup, "dailyStatsMarkup");
function historyMarkup(history, serviceId) {
  const byDate = new Map((history || []).map((entry) => [entry.date, entry]));
  const now = /* @__PURE__ */ new Date();
  now.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - (29 - index));
    const key = date.toISOString().slice(0, 10);
    const entry = byDate.get(key);
    const reports = Math.max(0, Number(entry?.reports) || 0);
    const expected = key === now.toISOString().slice(0, 10) ? Math.max(1, Math.floor((Date.now() - date.getTime()) / 6e4) + 1) : 1440;
    const maintenance = serviceId === "website" && key === new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
    const independent = serviceId === "website" || serviceId === "dashboard" || serviceId === "database";
    const percent = independent ? maintenance ? 99 : 100 : reports ? Math.min(100, reports / expected * 100) : null;
    const state = percent === null ? "" : percent >= 99 && !maintenance ? "is-up" : percent >= 95 ? "is-degraded" : "is-down";
    const today = key === now.toISOString().slice(0, 10) ? " is-today" : "";
    const tooltip = maintenance ? `${key}
Scheduled website maintenance` : percent === null ? `${key}
No monitoring data` : independent ? `${key}
${percent.toFixed(2)}% uptime
Service status recorded separately` : `${key}
${percent.toFixed(2)}% uptime
${reports}/${expected} checks received`;
    return `<span class="${state}${today}" data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip.replaceAll("\n", ", "))}"></span>`;
  }).join("");
}
__name(historyMarkup, "historyMarkup");
function renderStatusHtml(html3, stats) {
  const allOnline = Boolean(stats.online);
  const monitoringUnavailable = stats.statusState === "monitoring-unavailable";
  const summaryTitle = monitoringUnavailable ? "Monitoring unavailable" : allOnline ? "Operational" : "Service outage";
  const summaryCopy = allOnline ? "Beacon Bot and its public services are responding normally." : monitoringUnavailable ? "The monitoring service could not provide a fresh report." : "At least one Beacon service is not responding normally.";
  const uptimeText = hasNumericValue(stats.uptimePercent) ? `${Number(stats.uptimePercent).toFixed(2)}% uptime` : "Monitoring started";
  const ageText = Number.isFinite(stats.ageSeconds) ? `Last updated: ${stats.ageSeconds} seconds ago` : "Last updated: unavailable";
  const apiOnlineText = stats.online ? "Operational" : "Unavailable";
  const databaseOnlineText = stats.online ? "Operational" : "Unavailable";
  let output = html3.replace("<body>", `<body data-last-report-at="${escapeHtml(stats.updatedAt || "")}">`).replace('class="status-summary"', `class="status-summary status-summary--${stats.statusState || "service-outage"}${allOnline ? "" : " is-down"}"`).replace("data-status-state>Checking monitoring...</", `data-status-state>${escapeHtml(summaryTitle)}<`).replace("[data-summary-icon]>&#10003;", `[data-summary-icon]>${allOnline ? "&#10003;" : "!"}`).replace("<b data-service-uptime>Checking...</b>", `<b data-service-uptime>${escapeHtml(uptimeText)}</b>`).replace('<p class="service-detail" data-service-detail>Discord gateway and command service</p>', `<p class="service-detail" data-service-detail>${escapeHtml(allOnline ? "Online" : "No fresh bot report received")}</p>`).replace("<b data-service-uptime>Checking...</b>", `<b data-service-uptime>${escapeHtml(uptimeText)}</b>`).replace('<p class="service-detail" data-service-detail>Realtime connection to Discord</p>', `<p class="service-detail" data-service-detail>${escapeHtml(allOnline ? `Connected - ${Math.round(Number(stats.ping) || 0)} ms gateway ping` : "Discord gateway connection unavailable")}</p>`).replace("<b data-service-uptime>Checking...</b>", "<b data-service-uptime>Operational</b>").replace('<p class="service-detail" data-service-detail>Public Beacon website</p>', '<p class="service-detail" data-service-detail>Public Beacon website is reachable</p>').replace("<b data-service-uptime>Checking...</b>", `<b data-service-uptime>${escapeHtml(apiOnlineText)}</b>`).replace('<p class="service-detail" data-service-detail>Dashboard data and authentication services</p>', `<p class="service-detail" data-service-detail>${escapeHtml(apiOnlineText === "Operational" ? "Statistics API is responding" : "Statistics API is unavailable")}</p>`).replace("<b data-service-uptime>Checking...</b>", `<b data-service-uptime>${escapeHtml(databaseOnlineText)}</b>`).replace('<p class="service-detail" data-service-detail>Status and statistics storage</p>', `<p class="service-detail" data-service-detail>${escapeHtml(databaseOnlineText === "Operational" ? "Status data was read successfully" : "No fresh status data is available")}</p>`);
  output = replaceContent(output, "data-summary-title", summaryTitle);
  output = replaceContent(output, "data-summary-copy", summaryCopy);
  output = replaceContent(output, 'data-metric="uptime"', formatDuration(stats.uptime));
  output = replaceContent(output, 'data-metric="ping"', Number(stats.ping) ? `${Math.round(stats.ping)} ms` : "--");
  output = replaceContent(output, 'data-metric="guilds"', formatNumber(stats.guilds));
  output = replaceContent(output, 'data-metric="users"', formatNumber(stats.users));
  output = replaceContent(output, 'data-metric="uptime-percent"', hasNumericValue(stats.uptimePercent) ? formatPercent(stats.uptimePercent) : "Monitoring started");
  output = replaceContent(output, "data-uptime-label", hasNumericValue(stats.uptimePercent) ? "30-Day Uptime" : `Uptime since ${formatMonitoringDate(stats.monitoringStartedAt)}`);
  output = replaceContent(output, "data-incident-title", allOnline ? "No active incidents" : "Active service interruption");
  output = replaceContent(output, "data-incident-copy", allOnline ? "Beacon is operating normally." : "The live monitor is waiting for a healthy Beacon report.");
  output = replaceContent(output, "data-last-updated", ageText);
  output = output.replace(/<div class="updates-list" data-incidents>[\s\S]*?<\/div>/, `<div class="updates-list" data-incidents>${incidentMarkup(stats.incidents)}</div>`);
  output = output.replace(/<div class="daily-stats" data-daily-stats>[\s\S]*?<\/div>/, `<div class="daily-stats" data-daily-stats>${dailyStatsMarkup(stats.history)}</div>`);
  output = output.replace(/(<article class="service" data-service="([^"]+)">)([\s\S]*?)(<\/article>)/g, (_, start, id, content, end) => {
    const hasHistory = id !== "website";
    content = content.replace('<div class="history" data-history></div>', `<div class="history" data-history>${historyMarkup(hasHistory ? stats.history : [], id)}</div>`);
    return start + content + end;
  });
  return output;
}
__name(renderStatusHtml, "renderStatusHtml");
function baseStatusHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#050505" />
    <meta name="description" content="Live uptime and service status for Beacon Bot." />
    <title>Beacon Status</title>
    <link rel="icon" type="image/png" href="/assets/beacon-logo.png?v=92" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/status/status.css?v=11" />
  </head>
  <body>
    <a class="return-link" href="https://beacon-bot.site/" aria-label="Back to Beacon">
      <span class="return-content"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg><span>Back</span></span>
    </a>
    <main>
      <section class="status-card" aria-live="polite">
        <div class="card-heading">
          <div><p class="eyebrow">Beacon Bot</p><h1>System Status</h1></div>
        </div>
        <p class="card-copy" data-summary-copy>Live service information from Beacon Bot.</p>
        <div class="status-state status-state--monitoring-unavailable" data-status-state>Checking monitoring...</div>
        <div class="metric-list" aria-label="Live Beacon statistics">
          <div><span>Discord Gateway</span><strong data-metric="gateway-status">Connected</strong></div>
          <div><span>Connected Servers</span><strong><b data-metric="guilds">--</b> servers</strong></div>
          <div><span>Community Members</span><strong data-metric="users">--</strong></div>
          <div><span>Bot Session Uptime</span><strong data-metric="uptime">--</strong></div>
          <div><span>Gateway Latency</span><strong data-metric="ping">--</strong></div>
          <div><span data-uptime-label>Uptime since monitoring started</span><strong data-metric="uptime-percent">--</strong></div>
          <div class="sponsor-row"><span>Sponsored by</span><strong><a class="sponsor-link" href="https://nxtbyte.de" target="_blank" rel="noopener noreferrer"><img class="hosting-logo" src="/assets/header-footer-logo.png" alt="NXTBYTE \u2013 visit nxtbyte.de" /></a></strong></div>
        </div>
        <div class="card-footer"><span>Automatically updated</span><span data-last-updated>Last updated: waiting</span></div>
      </section>
      <section class="history-panel" aria-labelledby="history-title">
        <div class="panel-heading"><div><p class="eyebrow">Uptime over the past 30 days</p><h2 id="history-title">Service history</h2></div><span>Hover over a bar for details</span></div>
        <article class="service" data-service="bot"><div class="service-heading"><strong>Beacon Bot</strong><b data-service-uptime>Checking...</b></div><p class="service-detail" data-service-detail>Discord gateway and command service</p><div class="history" data-history></div><div class="history-labels"><span>30 days ago</span><span data-service-percent>--</span><span>Today</span></div></article>
        <article class="service" data-service="gateway"><div class="service-heading"><strong>Discord Gateway</strong><b data-service-uptime>Checking...</b></div><p class="service-detail" data-service-detail>Realtime connection to Discord</p><div class="history" data-history></div><div class="history-labels"><span>30 days ago</span><span data-service-percent>--</span><span>Today</span></div></article>
        <article class="service" data-service="website"><div class="service-heading"><strong>Beacon Website</strong><b data-service-uptime>Checking...</b></div><p class="service-detail" data-service-detail>Public Beacon website</p><div class="history" data-history></div><div class="history-labels"><span>30 days ago</span><span data-service-percent>--</span><span>Today</span></div></article>
        <article class="service" data-service="dashboard"><div class="service-heading"><strong>Dashboard / API</strong><b data-service-uptime>Checking...</b></div><p class="service-detail" data-service-detail>Dashboard data and authentication services</p><div class="history" data-history></div><div class="history-labels"><span>30 days ago</span><span data-service-percent>--</span><span>Today</span></div></article>
        <article class="service" data-service="database"><div class="service-heading"><strong>Database</strong><b data-service-uptime>Checking...</b></div><p class="service-detail" data-service-detail>Status and statistics storage</p><div class="history" data-history></div><div class="history-labels"><span>30 days ago</span><span data-service-percent>--</span><span>Today</span></div></article>
      </section>
      <section class="daily-panel" aria-labelledby="daily-title"><div class="panel-heading"><div><p class="eyebrow">Real monitoring data</p><h2 id="daily-title">Last 3 days</h2></div><span>Uptime, average ping and received checks</span></div><div class="daily-stats" data-daily-stats><p class="daily-stats-empty">Loading daily monitoring data...</p></div></section>
      <section class="updates-grid" aria-label="Incidents and maintenance">
        <article class="updates-panel"><div class="panel-heading"><div><p class="eyebrow">Past incidents</p><h2>Past incidents</h2></div></div><div class="updates-list" data-incidents><p>No recent incidents.</p></div></article>
        <article class="updates-panel"><div class="panel-heading"><div><p class="eyebrow">Scheduled maintenance</p><h2>Scheduled maintenance</h2></div></div><div class="updates-list" data-maintenance><p>No maintenance is currently scheduled.</p></div></article>
      </section>
    </main>

    <footer class="status-footer"><span class="footer-brand"><img src="/assets/header-footer-logo.png" alt="NXTBYTE" />Powered by Beacon Bot</span><a href="https://beacon-bot.site/">Back to Beacon</a></footer>
    <footer class="normal-footer"><a href="https://beacon-bot.site/tos/">Terms of Use</a><a href="https://beacon-bot.site/privacy/">Privacy Policy</a><a href="https://beacon-bot.site/copyright/">Copyright Dispute</a><a href="https://beacon-bot.site/gdpr/">GDPR Notice</a><a href="https://beacon-bot.site/cookies/">Cookie Policy</a><a href="https://beacon-bot.site/eula/">EULA</a><a href="https://beacon-bot.site/imprint/">Imprint</a></footer>
    <script src="/status/status-runtime-v2.js?v=19" defer><\/script>
  </body>
</html>`;
}
__name(baseStatusHtml, "baseStatusHtml");
function isStatusIndex(url) {
  return url.pathname === "/status" || url.pathname === "/status/" || url.pathname === "/status/index.html";
}
__name(isStatusIndex, "isStatusIndex");
async function onRequest6(context) {
  const url = new URL(context.request.url);
  if (!isStatusIndex(url)) {
    return context.env.ASSETS.fetch(context.request);
  }
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const stats = await readStatus(context.env);
  const body = renderStatusHtml(baseStatusHtml(), stats);
  return new Response(context.request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
__name(onRequest6, "onRequest");

// ../badges/badge-data.js
var BEACON_BADGES = [
  {
    id: "beacon-member",
    name: "Beacon Member",
    tag: "Starter",
    tone: "gold",
    icon: "BM",
    summary: "Created a Beacon account and joined the dashboard.",
    hint: "Log in with Discord once. This is the first mark every real Beacon profile gets."
  },
  {
    id: "pioneer",
    name: "Pioneer",
    tag: "Legacy",
    tone: "gold",
    icon: "01",
    summary: "For the first wave of Beacon members, early accounts and early servers.",
    hint: "This combines the old earliest-days, Beacon 100 and first-server marks into one clean legacy badge."
  },
  {
    id: "beacon-developer",
    name: "Beacon Developer",
    tag: "Official",
    tone: "orange",
    icon: "</>",
    summary: "Official developer badge for people who helped build Beacon itself.",
    hint: "Ship code, design, systems or infrastructure that becomes part of Beacon."
  },
  {
    id: "verified",
    name: "Verified",
    tag: "Trusted",
    tone: "blue",
    icon: "OK",
    summary: "For known creators, community figures or trusted Beacon partners.",
    hint: "Be a public creator, Beacon CC, known partner or someone the team can verify manually."
  },
  {
    id: "donator",
    name: "Donator",
    tag: "Supporter",
    tone: "green",
    icon: "$",
    summary: "Supported Beacon directly with a donation.",
    hint: "Donate to Beacon. Bigger support may unlock stronger donor tiers later."
  },
  {
    id: "premium",
    name: "Premium",
    tag: "Paid",
    tone: "violet",
    icon: "PR",
    summary: "Bought Beacon Premium for a server.",
    hint: "Purchase Premium or Prestige on a server connected to your Beacon account."
  },
  {
    id: "staff",
    name: "Staff",
    tag: "Team",
    tone: "blue",
    icon: "ST",
    summary: "Member of the Beacon staff team.",
    hint: "Reserved for people helping run support, moderation or community operations."
  },
  {
    id: "helper",
    name: "Helper",
    tag: "Community",
    tone: "gold",
    icon: "HP",
    summary: "Helped other users enough for the team to notice.",
    hint: "Be useful in the community without farming it. Real help counts more than volume."
  },
  {
    id: "bug-hunter",
    name: "Bug Hunter",
    tag: "Report",
    tone: "green",
    icon: "BH",
    summary: "Reported a real Beacon bug that got confirmed.",
    hint: "Send a clear report with steps, screenshots or logs so the issue can be fixed."
  },
  {
    id: "server-booster",
    name: "Server Booster",
    tag: "Boost",
    tone: "orange",
    icon: "SB",
    summary: "Boosted the Beacon Discord server.",
    hint: "Boost the official Beacon server while your Discord account is connected."
  },
  {
    id: "witness",
    name: "Witness",
    tag: "Event",
    tone: "blue",
    icon: "EV",
    summary: "Was present during a special launch, test or major Beacon moment.",
    hint: "Some badges only exist when something happens live. Be there when it does."
  },
  {
    id: "the-beacon",
    name: "The Beacon",
    tag: "Rare",
    tone: "orange",
    icon: "BC",
    summary: "A rare manual badge for people who genuinely help Beacon stand out.",
    hint: "This one is noticed, not grinded."
  },
  {
    id: "beacons-princess",
    name: "Beacon's Princess",
    tag: "???",
    tone: "gold",
    icon: "??",
    summary: "???",
    hint: "???"
  },
  {
    id: "found-the-light",
    name: "Found the Light",
    tag: "Easter Egg",
    tone: "green",
    icon: "FL",
    summary: "Found a hidden interaction somewhere on Beacon.",
    hint: "Watch small details on Beacon pages. Some things answer only after you notice the pattern."
  },
  {
    id: "not-found",
    name: "404",
    tag: "Secret",
    tone: "orange",
    icon: "404",
    summary: "Found something that should not be there.",
    hint: "A wrong turn can still count, but only if you do more than stare at the error."
  },
  {
    id: "lost-signal",
    name: "Lost Signal",
    tag: "Hidden",
    tone: "violet",
    icon: "LS",
    summary: "Discovered a hidden command, page or state most users never see.",
    hint: "A command exists where most people stop typing. Find the silence after the signal."
  },
  {
    id: "night-owl",
    name: "Night Owl",
    tag: "Activity",
    tone: "blue",
    icon: "NO",
    summary: "Kept building late when everyone else was asleep.",
    hint: "Beacon remembers the quiet hours. Not every night counts, and not every action matters."
  },
  {
    id: "command-relic",
    name: "Command Relic",
    tag: "Hidden",
    tone: "green",
    icon: "CR",
    summary: "Used Beacon commands in a very specific long-term pattern.",
    hint: "It is not about spam. It is about the right commands, in the right rhythm, for long enough."
  },
  {
    id: "prismatic-key",
    name: "Prismatic Key",
    tag: "Secret",
    tone: "violet",
    icon: "PK",
    summary: "A secret badge connected to multiple parts of Beacon.",
    hint: "One feature is not enough. The key only forms when different systems line up."
  },
  {
    id: "lucky-signal",
    name: "Lucky Signal",
    tag: "Drop",
    tone: "gold",
    icon: "LU",
    summary: "A rare random drop that appears during normal Beacon use.",
    hint: "You cannot force it, but you can be there when it happens."
  }
];

// ../badges/badge-icons.js
var svg = /* @__PURE__ */ __name((body) => `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`, "svg");
var BADGE_ICONS = {
  verified: svg(`
    <defs><linearGradient id="verified-g" x1="8" y1="8" x2="56" y2="56"><stop stop-color="#58a6ff"/><stop offset="1" stop-color="#1769ff"/></linearGradient></defs>
    <path fill="url(#verified-g)" d="M32 4l6.4 5 8.1-1 3.1 7.5 7.3 3.8-2 7.9 3.6 7.3-6.4 5-.9 8.1-8.1 1.6-5.6 5.9-7.5-3.2-7.5 3.2-5.6-5.9-8.1-1.6-.9-8.1-6.4-5 3.6-7.3-2-7.9 7.3-3.8L17.5 8l8.1 1z"/>
    <path fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" d="M20 33l8 8 17-19"/>
  `),
  "beacon-member": svg(`
    <defs><linearGradient id="member-g" x1="18" y1="6" x2="46" y2="58"><stop stop-color="#ffe17a"/><stop offset=".45" stop-color="#ffc31c"/><stop offset="1" stop-color="#b66a00"/></linearGradient></defs>
    <path fill="url(#member-g)" d="M32 7l8 20-8 8-8-8z"/>
    <path fill="#6f4200" d="M32 35l10 12-10 11-10-11z"/>
    <path fill="#ffc31c" d="M32 35l10 12H22z"/>
    <path stroke="#ffc31c" stroke-width="4" stroke-linecap="round" d="M32 3v9M15 14l6 7M49 14l-6 7M10 31h9M54 31h-9"/>
  `),
  pioneer: svg(`
    <defs><linearGradient id="pioneer-g" x1="8" y1="8" x2="56" y2="56"><stop stop-color="#ffe17a"/><stop offset="1" stop-color="#ffae00"/></linearGradient></defs>
    <path fill="url(#pioneer-g)" d="M13 24h11a16 16 0 0 1 16 0h11l-6 8 6 8H40a16 16 0 0 1-16 0H13l6-8z"/>
    <circle cx="32" cy="32" r="21" fill="none" stroke="#ffc31c" stroke-width="5"/>
    <circle cx="32" cy="32" r="14" fill="#ffb000"/>
    <text x="32" y="41" text-anchor="middle" font-size="21" font-weight="900" fill="#fff" font-family="Arial, sans-serif">01</text>
  `),
  "beacon-developer": svg(`
    <defs><linearGradient id="dev-g" x1="8" y1="8" x2="56" y2="56"><stop stop-color="#ff8a00"/><stop offset="1" stop-color="#ff4b00"/></linearGradient></defs>
    <path fill="none" stroke="url(#dev-g)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" d="M24 18L10 32l14 14M40 18l14 14-14 14"/>
    <path fill="none" stroke="#ffb000" stroke-width="5" stroke-linecap="round" d="M36 11L28 53"/>
  `),
  donator: svg(`
    <defs><linearGradient id="donor-g" x1="10" y1="8" x2="54" y2="56"><stop stop-color="#5edb54"/><stop offset="1" stop-color="#14821e"/></linearGradient></defs>
    <circle cx="32" cy="32" r="25" fill="url(#donor-g)"/>
    <path fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" d="M39 20h-9c-5 0-8 3-8 7s3 7 8 7h5c5 0 8 3 8 7s-3 8-9 8h-10M32 14v8M32 50v-8"/>
  `),
  premium: svg(`
    <defs><linearGradient id="premium-g" x1="11" y1="8" x2="53" y2="55"><stop stop-color="#a66bff"/><stop offset="1" stop-color="#7432e6"/></linearGradient></defs>
    <path fill="url(#premium-g)" d="M11 43h42l-4 10H15zM13 39l5-26 12 15 11-20 7 21 9-12-6 22z"/>
    <circle cx="18" cy="13" r="4" fill="#8f5bff"/><circle cx="41" cy="8" r="4" fill="#8f5bff"/><circle cx="57" cy="17" r="4" fill="#8f5bff"/>
  `),
  staff: svg(`
    <defs><linearGradient id="staff-g" x1="16" y1="8" x2="48" y2="56"><stop stop-color="#455463"/><stop offset="1" stop-color="#17202a"/></linearGradient></defs>
    <rect x="17" y="13" width="30" height="44" rx="6" fill="url(#staff-g)"/>
    <rect x="26" y="7" width="12" height="12" rx="4" fill="#455463"/><circle cx="32" cy="13" r="3" fill="#fff"/>
    <path stroke="#ffc31c" stroke-width="2.5" stroke-linecap="round" d="M32 24v7M25 29l5 4M39 29l-5 4"/>
    <text x="32" y="48" text-anchor="middle" font-size="13" font-weight="900" fill="#fff" font-family="Arial, sans-serif">STAFF</text>
  `),
  helper: svg(`
    <defs><linearGradient id="helper-a" x1="8" y1="8" x2="56" y2="56"><stop stop-color="#ffd34d"/><stop offset="1" stop-color="#ff9f00"/></linearGradient><linearGradient id="helper-b" x1="25" y1="18" x2="52" y2="47"><stop stop-color="#3f4a56"/><stop offset="1" stop-color="#161d25"/></linearGradient></defs>
    <path fill="url(#helper-a)" d="M8 30l13-17 12 7-13 20z"/><path fill="url(#helper-b)" d="M31 18l9-5 16 11-12 16-11-2-8 7-9-7 11-12z"/>
    <path stroke="#ffd34d" stroke-width="5" stroke-linecap="round" d="M22 42l7 8M16 39l7 9M36 40l-8 10"/>
  `),
  "bug-hunter": svg(`
    <defs><linearGradient id="bug-g" x1="12" y1="8" x2="52" y2="56"><stop stop-color="#3ea83a"/><stop offset="1" stop-color="#155c17"/></linearGradient></defs>
    <circle cx="28" cy="28" r="17" fill="none" stroke="url(#bug-g)" stroke-width="6"/><path stroke="url(#bug-g)" stroke-width="7" stroke-linecap="round" d="M41 41l12 12"/>
    <ellipse cx="28" cy="28" rx="8" ry="11" fill="#176a19"/><path stroke="#1f8a22" stroke-width="3" stroke-linecap="round" d="M20 28h16M22 20l-6-5M34 20l6-5M22 36l-6 5M34 36l6 5M28 17v22"/>
  `),
  "server-booster": svg(`
    <defs><linearGradient id="boost-g" x1="14" y1="8" x2="50" y2="56"><stop stop-color="#ff63cf"/><stop offset="1" stop-color="#e13ba8"/></linearGradient></defs>
    <path fill="url(#boost-g)" d="M32 5l18 14v26L32 59 14 45V19z"/>
    <path fill="#fff" opacity=".9" d="M32 14l10 9v20L32 50l-10-7V23z"/>
    <path fill="url(#boost-g)" d="M32 20l6 5v15l-6 4-6-4V25z"/>
  `),
  "the-beacon": svg(`
    <defs><linearGradient id="beacon-g" x1="15" y1="5" x2="49" y2="57"><stop stop-color="#ffe17a"/><stop offset="1" stop-color="#ffad00"/></linearGradient></defs>
    <path fill="none" stroke="url(#beacon-g)" stroke-width="4" stroke-linecap="round" d="M12 47c5 6 12 9 20 9s15-3 20-9M12 17c5-6 12-9 20-9s15 3 20 9"/>
    <path fill="url(#beacon-g)" d="M32 8l8 20-8 8-8-8zM32 36l8 12-8 9-8-9z"/>
    <path stroke="#ffc31c" stroke-width="3" stroke-linecap="round" d="M32 3v8M18 13l5 6M46 13l-5 6"/>
  `),
  "beacons-princess": svg(`
    <defs><linearGradient id="princess-g" x1="8" y1="10" x2="56" y2="54"><stop stop-color="#ff80d1"/><stop offset="1" stop-color="#ec3fa3"/></linearGradient></defs>
    <path fill="url(#princess-g)" d="M8 43c8-11 12-11 17-3 4-14 10-18 14 0 5-8 9-8 17 3v8H8z"/>
    <path fill="none" stroke="url(#princess-g)" stroke-width="4" stroke-linecap="round" d="M13 43c5-13 10-19 18-23 8 4 14 10 20 23M20 34c-7-6-4-14 4-10M44 34c7-6 4-14-4-10"/>
    <path fill="#fff0fb" d="M32 29c5-6 12 1 0 10-12-9-5-16 0-10z"/>
  `),
  "not-found": svg(`
    <defs><linearGradient id="err-g" x1="12" y1="8" x2="52" y2="56"><stop stop-color="#ff3030"/><stop offset="1" stop-color="#d71920"/></linearGradient></defs>
    <path fill="url(#err-g)" d="M32 6l27 48H5z"/>
    <path stroke="#fff" stroke-width="6" stroke-linecap="round" d="M32 22v15"/><circle cx="32" cy="46" r="3.5" fill="#fff"/>
  `),
  "lost-signal": svg(`
    <defs><linearGradient id="lost-g" x1="10" y1="10" x2="54" y2="54"><stop stop-color="#8b51ff"/><stop offset="1" stop-color="#5b25be"/></linearGradient></defs>
    <path fill="none" stroke="url(#lost-g)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" d="M8 32c10-17 38-17 48 0-10 17-38 17-48 0zM19 48L49 16"/>
    <circle cx="32" cy="32" r="9" fill="url(#lost-g)" opacity=".9"/>
  `),
  "night-owl": svg(`
    <defs><linearGradient id="owl-g" x1="13" y1="7" x2="51" y2="57"><stop stop-color="#2c85ff"/><stop offset="1" stop-color="#0058c7"/></linearGradient></defs>
    <path fill="url(#owl-g)" d="M17 19l8-8 7 8 7-8 8 8v20c0 12-7 19-15 19S17 51 17 39z"/>
    <circle cx="25" cy="32" r="7" fill="#fff"/><circle cx="39" cy="32" r="7" fill="#fff"/><circle cx="25" cy="32" r="3" fill="#1d63c9"/><circle cx="39" cy="32" r="3" fill="#1d63c9"/><path fill="#fff" d="M32 40l5 6H27z"/>
  `),
  "command-relic": svg(`
    <defs><linearGradient id="cmd-g" x1="12" y1="8" x2="52" y2="56"><stop stop-color="#4b5a66"/><stop offset="1" stop-color="#19222b"/></linearGradient></defs>
    <rect x="13" y="11" width="38" height="42" rx="5" fill="url(#cmd-g)"/><rect x="9" y="8" width="46" height="9" rx="4" fill="#34424e"/><rect x="9" y="47" width="46" height="9" rx="4" fill="#34424e"/>
    <path stroke="#65e84d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M24 27l8 6-8 6M36 41h10"/>
  `),
  "prismatic-key": svg(`
    <defs><linearGradient id="key-g" x1="14" y1="10" x2="50" y2="56"><stop stop-color="#a66bff"/><stop offset="1" stop-color="#5e25c9"/></linearGradient></defs>
    <circle cx="42" cy="19" r="11" fill="none" stroke="url(#key-g)" stroke-width="7"/><path stroke="url(#key-g)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" d="M34 27L13 48M22 39l7 7M28 33l6 6"/>
    <path stroke="#fff" stroke-width="3" stroke-linecap="round" d="M38 19h8"/>
  `),
  "lucky-signal": svg(`
    <defs><linearGradient id="luck-g" x1="12" y1="8" x2="52" y2="56"><stop stop-color="#ffd34d"/><stop offset="1" stop-color="#ffb000"/></linearGradient></defs>
    <path fill="url(#luck-g)" d="M32 6l21 12v28L32 58 11 46V18z"/><path fill="#fff7dc" d="M32 10l17 10-17 10-17-10z" opacity=".42"/>
    <text x="23" y="43" font-size="20" font-weight="900" fill="#fff" font-family="Arial, sans-serif">?</text><text x="38" y="43" font-size="20" font-weight="900" fill="#fff" font-family="Arial, sans-serif">?</text>
  `),
  "found-the-light": svg(`
    <defs><linearGradient id="light-g" x1="13" y1="7" x2="51" y2="57"><stop stop-color="#65ca48"/><stop offset="1" stop-color="#22851f"/></linearGradient></defs>
    <path fill="url(#light-g)" d="M32 7c13 0 22 11 22 25 0 14-9 24-22 24S10 46 10 32C10 18 19 7 32 7z"/>
    <path fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" d="M17 27l5 4 5-4 5 4 5-4 5 4 5-4M18 43l5-4 5 4 5-4 5 4 5-4"/>
    <path fill="#fff" d="M32 18l5 12-5 5-5-5zM32 35l5 8-5 6-5-6z"/>
  `),
  witness: svg(`
    <defs><linearGradient id="witness-g" x1="11" y1="8" x2="53" y2="56"><stop stop-color="#4b83d5"/><stop offset="1" stop-color="#123b7a"/></linearGradient></defs>
    <path fill="url(#witness-g)" d="M32 6l22 9v17c0 14-8 23-22 27-14-4-22-13-22-27V15z"/>
    <circle cx="32" cy="27" r="8" fill="#fff"/><path fill="#fff" d="M20 50c2-10 7-15 12-15s10 5 12 15z"/>
    <path fill="none" stroke="#dbe9ff" stroke-width="3" d="M20 17l12-5 12 5"/>
  `)
};
function iconForBadge(id) {
  return BADGE_ICONS[id] || BADGE_ICONS["beacon-member"];
}
__name(iconForBadge, "iconForBadge");

// dashboard.js
function escapeHtml2(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}
__name(escapeHtml2, "escapeHtml");
async function getDashboardServers(env, discordAccessToken, request) {
  const { botToken: botToken2 } = getConfig(env);
  if (!discordAccessToken) return [];
  let beaconServerIds = /* @__PURE__ */ new Set();
  let syncedServers = /* @__PURE__ */ new Map();
  try {
    const statsResponse = await fetch(new URL("/api/discord-stats", request.url), { headers: { accept: "application/json", authorization: botToken2 ? `Bot ${botToken2}` : "" } });
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      if (Array.isArray(stats.servers)) {
        syncedServers = new Map(stats.servers.filter((server) => server?.id).map((server) => [String(server.id), server]));
        beaconServerIds = new Set(syncedServers.keys());
      }
    }
  } catch (_) {
  }
  try {
    const response = await fetch("https://discord.com/api/v10/users/@me/guilds?with_counts=true", {
      headers: { authorization: `Bearer ${discordAccessToken}` }
    });
    if (!response.ok) return [];
    const userGuilds = await response.json();
    if (!Array.isArray(userGuilds)) return [];
    const servers = await Promise.all(userGuilds.map(async (guild) => {
      let withBeacon = beaconServerIds.has(String(guild.id));
      let channels = [];
      if (botToken2) {
        try {
          const botGuildResponse = await fetch(`https://discord.com/api/v10/guilds/${guild.id}`, {
            headers: { authorization: `Bot ${botToken2}` }
          });
          if (botGuildResponse.ok || botGuildResponse.status === 404) withBeacon = botGuildResponse.ok;
          if (botGuildResponse.ok) {
            const channelsResponse = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/channels`, {
              headers: { authorization: `Bot ${botToken2}` }
            });
            let channelData = channelsResponse.ok ? await channelsResponse.json() : null;
            if (!Array.isArray(channelData) && discordAccessToken) {
              const userChannelsResponse = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/channels`, {
                headers: { authorization: `Bearer ${discordAccessToken}` }
              });
              channelData = userChannelsResponse.ok ? await userChannelsResponse.json() : null;
            }
            channels = Array.isArray(channelData) ? channelData.filter((channel) => [0, 4].includes(channel?.type)).map((channel) => ({ id: String(channel.id), name: String(channel.name || "channel"), type: Number(channel.type) })) : [];
          }
        } catch (_) {
        }
      }
      return {
        id: String(guild.id),
        name: guild.name || "Discord server",
        owner: guild.owner ? "Server owner" : "Member",
        isOwner: Boolean(guild.owner),
        members: Number(guild.approximate_member_count) || 0,
        bots: Number(syncedServers.get(String(guild.id))?.bots) || 0,
        channels: Number(syncedServers.get(String(guild.id))?.channels) || 0,
        roles: Number(syncedServers.get(String(guild.id))?.roles) || 0,
        categories: Number(syncedServers.get(String(guild.id))?.categories) || 0,
        shardId: Number(syncedServers.get(String(guild.id))?.shardId) || 0,
        iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256` : "",
        channelOptions: channels,
        withBeacon
      };
    }));
    return [...new Map(servers.map((server) => [server.id, server])).values()].filter((server) => server.isOwner).sort((left, right) => Number(right.withBeacon) - Number(left.withBeacon));
  } catch (_) {
    return [];
  }
}
__name(getDashboardServers, "getDashboardServers");
async function getUnlockedBadgeIds(env, userId) {
  const defaults = /* @__PURE__ */ new Set(["beacon-member"]);
  if (!env.STATUS_DB || !userId) return defaults;
  await env.STATUS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS badge_unlocks (
      user_id TEXT NOT NULL,
      badge_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, badge_id)
    )
  `).run();
  await env.STATUS_DB.prepare(`
    INSERT OR IGNORE INTO badge_unlocks (user_id, badge_id) VALUES (?, ?)
  `).bind(userId, "beacon-member").run();
  const rows = await env.STATUS_DB.prepare(`
    SELECT badge_id FROM badge_unlocks WHERE user_id = ?
  `).bind(userId).all();
  return new Set((rows.results || []).map((row) => row.badge_id));
}
__name(getUnlockedBadgeIds, "getUnlockedBadgeIds");
function renderBadgeCard(badge, unlocked) {
  const stateClass = unlocked ? " is-unlocked" : " is-locked";
  const stateLabel = unlocked ? "Unlocked" : "Locked";
  const png = `/assets/badges/${escapeHtml2(badge.id)}.png`;
  return `
    <article class="dash-badge dash-badge--${escapeHtml2(badge.tone)}${stateClass}">
      <div class="dash-badge-icon" aria-hidden="true">
        <img class="dash-badge-img" src="${png}" alt="" loading="lazy" decoding="async" />
        <span class="dash-badge-fallback">${iconForBadge(badge.id)}</span>
      </div>
      <div class="dash-badge-copy">
        <div class="dash-badge-top">
          <h3>${escapeHtml2(badge.name)}</h3>
          <span>${escapeHtml2(badge.tag)}</span>
        </div>
        <p>${escapeHtml2(badge.summary)}</p>
        <small>${escapeHtml2(badge.hint)}</small>
      </div>
      <strong class="dash-badge-state">${stateLabel}</strong>
    </article>
  `;
}
__name(renderBadgeCard, "renderBadgeCard");
async function onRequestGet5({ request, env }) {
  const { sessionSecret, clientId } = getConfig(env);
  const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
  if (!session?.user) {
    return Response.redirect(new URL("/?login_required=1", request.url).toString(), 302);
  }
  if (!session.discordAccessToken) {
    return Response.redirect(new URL("/api/auth/discord/login?next=/dashboard", request.url).toString(), 302);
  }
  const username = escapeHtml2(session.user.username || "Discord user");
  const avatar = session.user.avatar ? escapeHtml2(session.user.avatar) : "/assets/beacon-logo.png?v=92";
  const serverName = `${username}'s server`;
  const selectionServers = [
    { name: "//", owner: "Eigent\xFCmer", tone: "red", icon: "/assets/beacon-logo.png?v=92" },
    { name: "Beacon", owner: "Eigent\xFCmer", tone: "gold", icon: "/assets/beacon-logo.png?v=92" },
    { name: "smm2.org", owner: "Bot Master", tone: "green", icon: "/assets/beacon-logo.png?v=92" },
    { name: "Sparkle Stock Reborn", owner: "Eigent\xFCmer", tone: "gray", icon: "/assets/beacon-logo.png?v=92" },
    { name: "test", owner: "Eigent\xFCmer", tone: "dark", icon: "" }
  ];
  const liveSelectionServers = await getDashboardServers(env, session.discordAccessToken, request);
  const requestedServerParam = new URL(request.url).searchParams.get("server") || "";
  const requestedServerId = requestedServerParam.split("/")[0];
  const requestedSection = requestedServerParam.split("/")[1] || "";
  const requestedServer = liveSelectionServers.find((server) => server.id === requestedServerId && server.withBeacon && server.isOwner);
  const selectedServer = requestedServer || liveSelectionServers[0];
  const hasActiveServer = Boolean(selectedServer?.withBeacon && selectedServer?.isOwner);
  const resolvedServerName = selectedServer?.name || serverName;
  const resolvedServerIcon = selectedServer?.iconUrl || "";
  const dashboardAvatar = resolvedServerIcon ? escapeHtml2(resolvedServerIcon) : avatar;
  const dashboardSelectionServers = liveSelectionServers.map((server, index) => ({ ...server, tone: ["red", "gold", "green", "gray", "dark"][index % 5], icon: server.iconUrl }));
  const hasRequestedServer = Boolean(requestedServer);
  const initialDashboardSection = ["server-info", "customize-bot", "command-configs", "server-configs", "dashboard-history", "statistics", "badges"].includes(requestedSection) ? requestedSection : "server-info";
  const canManageResolvedServer = Boolean(liveSelectionServers[0]?.withBeacon && liveSelectionServers[0]?.isOwner);
  const renderServerChoices = /* @__PURE__ */ __name((servers, actionLabel) => servers.length ? servers.map((server) => `
              <article class="server-choice">
                <div class="server-choice-card server-choice-card--${escapeHtml2(server.tone)}">
                  ${server.icon ? `<img src="${escapeHtml2(server.icon)}" alt="" onerror="this.onerror=null;this.src='/assets/beacon-mark-gold.png?v=1'" />` : `<span class="server-choice-initial">${escapeHtml2(String(server.name || "S").slice(0, 1).toUpperCase())}</span>`}
                </div>
                <div class="server-choice-copy">
                  <div><strong>${escapeHtml2(server.name)}</strong><small>${server.withBeacon ? "Beacon is active" : "Server owner"}</small></div>
                  ${server.withBeacon ? `<a class="server-choice-button" href="/dashboard?server=${encodeURIComponent(server.id || "")}#server-info" data-can-manage="true" data-server-id="${escapeHtml2(server.id || "")}" data-server-name="${escapeHtml2(server.name)}" data-server-members="${Number(server.members) || 0}" data-server-bots="${Number(server.bots) || 0}" data-server-channels="${Number(server.channels) || 0}" data-server-roles="${Number(server.roles) || 0}" data-server-categories="${Number(server.categories) || 0}" data-server-shard="${Number(server.shardId) || 0}">${actionLabel}</a>` : `<a class="server-choice-button server-choice-button--invite" href="https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&amp;scope=bot%20applications.commands&amp;guild_id=${encodeURIComponent(server.id || "")}&amp;disable_guild_select=true">Add Beacon</a>`}
                </div>
              </article>
            `).join("") : `<p class="server-choice-empty">No servers in this group yet.</p>`, "renderServerChoices");
  const serversWithBeacon = dashboardSelectionServers.filter((server) => server.withBeacon && server.isOwner);
  const serversWithoutBeacon = dashboardSelectionServers.filter((server) => !server.withBeacon && server.isOwner);
  const unlockedIds = await getUnlockedBadgeIds(env, session.user.id);
  const unlockedBadges = BEACON_BADGES.filter((badge) => unlockedIds.has(badge.id));
  const lockedBadges = BEACON_BADGES.filter((badge) => !unlockedIds.has(badge.id));
  const navItems = [
    "Server Info",
    "Customize Bot",
    "Command Configs",
    "Server Configs",
    "Dashboard History",
    "Statistics",
    "Badges"
  ];
  const navHtml = navItems.map((label, index) => {
    const id = label.toLowerCase().replace(/\s+/g, "-");
    const active = index === 0 ? " is-active" : "";
    return `<a class="dash-side-link${active}" href="#${id}" data-dashboard-tab="${id}"><span class="nav-mark"></span>${label}</a>`;
  }).join("");
  const botBio = "Beacon Community OS\nhttps://beacon-bot.site";
  const ticketChannelOptions = (selectedServer?.channelOptions || []).map(
    (channel) => `<option value="${escapeHtml2(channel.id)}">${escapeHtml2(channel.type === 4 ? "Category \xB7 " : "# ")}${escapeHtml2(channel.name)}</option>`
  ).join("");
  const ticketPanelHtml = `
        <section class="dash-content-section" id="server-configs" data-dashboard-section="server-configs">
          <div class="dash-panel ticket-config-panel">
            <div class="ticket-config-top">
              <div>
                <span class="ticket-overline">Server Configs \xB7 Tickets</span>
                <h2>Ticket Panels</h2>
                <p>Create a clean panel that members can use to open a private ticket.</p>
              </div>
              <button class="ticket-add-panel" type="button" data-ticket-add aria-label="Create a new ticket panel">+</button>
            </div>
            <div class="ticket-panel-list" data-ticket-panel-list>
              <button class="ticket-panel-row is-selected" type="button" data-ticket-panel-row="default">
                <span><strong>1</strong> Ticket Panel</span><span class="ticket-panel-chevron">\u203A</span>
              </button>
            </div>
            <div class="ticket-panel-editor" data-ticket-editor>
              <div class="ticket-editor-heading">
                <div>
                  <span class="ticket-overline">Panel Editor</span>
                  <h3 data-ticket-editor-title>Ticket Panel</h3>
                </div>
                <span class="ticket-draft-pill">Draft</span>
              </div>
              <label class="ticket-field">
                <span>Panel message</span>
                <textarea data-ticket-message maxlength="2000">Click the button below to open a private ticket with the Beacon support team.</textarea>
              </label>
              <div class="ticket-emoji-tools">
                <label class="ticket-field"><span>Custom emoji by ID</span><input data-ticket-emoji-id inputmode="numeric" placeholder="Emoji ID, e.g. 123456789012345678" /></label>
                <button class="ticket-emoji-add" type="button" data-ticket-emoji-add>Insert emoji</button>
              </div>
              <div class="ticket-settings-grid">
                <label class="ticket-field"><span>Panel layout</span><select data-ticket-layout><option value="buttons">Buttons</option><option value="dropdown">Dropdown menu</option></select></label>
                <label class="ticket-field"><span>Ticket buttons</span><select data-ticket-button-count><option value="1">1 button</option><option value="2">2 buttons</option><option value="3">3 buttons</option><option value="4">4 buttons</option><option value="5">5 buttons</option></select></label>
                <label class="ticket-field"><span>Ticket category</span><select data-ticket-channel="category"><option value="">Not set</option>${ticketChannelOptions}</select></label>
                <label class="ticket-field"><span>Log channel</span><select data-ticket-channel="log"><option value="">Not set</option>${ticketChannelOptions}</select></label>
                <label class="ticket-field"><span>Review channel</span><select data-ticket-channel="review"><option value="">Not set</option>${ticketChannelOptions}</select></label>
                <label class="ticket-field"><span>Archive category</span><select data-ticket-channel="archive"><option value="">Not set</option>${ticketChannelOptions}</select></label>
              </div>
              <div class="ticket-layout-config" data-ticket-config="dropdown" hidden>
                <div class="ticket-config-label">Dropdown options</div>
                <div class="ticket-option-grid">
                  <input data-ticket-option-label="1" placeholder="Option 1 label" />
                  <input data-ticket-option-description="1" placeholder="Option 1 description" />
                  <input data-ticket-option-label="2" placeholder="Option 2 label" />
                  <input data-ticket-option-description="2" placeholder="Option 2 description" />
                  <input data-ticket-option-label="3" placeholder="Option 3 label" />
                  <input data-ticket-option-description="3" placeholder="Option 3 description" />
                  <input data-ticket-option-label="4" placeholder="Option 4 label" />
                  <input data-ticket-option-description="4" placeholder="Option 4 description" />
                  <input data-ticket-option-label="5" placeholder="Option 5 label" />
                  <input data-ticket-option-description="5" placeholder="Option 5 description" />
                </div>
              </div>
              <div class="ticket-layout-config" data-ticket-config="buttons" hidden>
                <div class="ticket-config-label">Button labels and emoji IDs</div>
                <div class="ticket-option-grid ticket-button-grid">
                  <input data-ticket-button-label="1" placeholder="Button 1 label" />
                  <input data-ticket-button-emoji="1" placeholder="Button 1 emoji ID" />
                  <input data-ticket-button-label="2" placeholder="Button 2 label" />
                  <input data-ticket-button-emoji="2" placeholder="Button 2 emoji ID" />
                  <input data-ticket-button-label="3" placeholder="Button 3 label" />
                  <input data-ticket-button-emoji="3" placeholder="Button 3 emoji ID" />
                  <input data-ticket-button-label="4" placeholder="Button 4 label" />
                  <input data-ticket-button-emoji="4" placeholder="Button 4 emoji ID" />
                  <input data-ticket-button-label="5" placeholder="Button 5 label" />
                  <input data-ticket-button-emoji="5" placeholder="Button 5 emoji ID" />
                </div>
              </div>
              <div class="ticket-preview-label">Message Preview</div>
              <article class="ticket-discord-preview">
                <div class="ticket-preview-author">
                  <img src="/assets/beacon-logo.png?v=92" width="34" height="34" alt="" />
                  <strong>Beacon Bot</strong><span>BOT</span>
                </div>
                <div class="ticket-preview-card">
                  <h4 data-ticket-preview-title>Need help?</h4>
                  <p data-ticket-preview-message>Click the button below to open a private ticket with the Beacon support team.</p>
                  <button class="ticket-preview-button" type="button" disabled>Open Ticket</button>
                </div>
              </article>
              <button class="ticket-save-panel" type="button" data-ticket-save>Save Panel Draft</button>
            </div>
          </div>
          <div class="ticket-panel-modal" data-ticket-modal hidden>
            <div class="ticket-panel-modal__backdrop" data-ticket-modal-close></div>
            <section class="ticket-panel-modal__card" role="dialog" aria-modal="true" aria-labelledby="ticket-modal-title">
              <button class="ticket-panel-modal__close" type="button" data-ticket-modal-close aria-label="Close">\xD7</button>
              <h3 id="ticket-modal-title">Create a Panel</h3>
              <p>A panel lets members open a private ticket. Give it a name to get started.</p>
              <label class="ticket-field"><span>Panel name</span><input data-ticket-name value="New Panel" maxlength="80" /></label>
              <div class="ticket-panel-modal__actions">
                <button class="ticket-modal-cancel" type="button" data-ticket-modal-close>Cancel</button>
                <button class="ticket-save-panel" type="button" data-ticket-create>Create</button>
              </div>
            </section>
          </div>
        </section>
  `;
  const simplePanels = [
    ["command-configs", "Command Configs", "Enable, disable and tune Beacon commands for this server."],
    ["dashboard-history", "Dashboard History", "Recent dashboard changes and sync events will be listed here."],
    ["statistics", "Statistics", "Server activity, member growth and Beacon usage stats will show here."]
  ].map(([id, title, copy]) => `
        <section class="dash-content-section" id="${id}" data-dashboard-section="${id}">
          <div class="dash-panel">
            <h2>${title}</h2>
            <p>${copy}</p>
          </div>
        </section>
  `).join("") + ticketPanelHtml;
  const html3 = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <title>Beacon Dashboard</title>
    <link rel="icon" type="image/png" href="/assets/beacon-logo.png?v=92" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@700;800;900&display=swap" rel="stylesheet" />
    <style>
      *{box-sizing:border-box}
      html,body{min-height:100%;margin:0;background:#292b36;color:#f6f3ea;font-family:"DM Sans",system-ui,sans-serif}
      body{min-height:100vh;background-color:#292b36;background-image:radial-gradient(circle at 3% 18%,transparent 0 56px,rgba(255,255,255,.12) 57px 60px,transparent 61px),radial-gradient(circle at 96% 14%,transparent 0 34px,rgba(255,255,255,.1) 35px 38px,transparent 39px),radial-gradient(circle at 92% 84%,transparent 0 72px,rgba(255,255,255,.08) 73px 76px,transparent 77px),radial-gradient(circle at 10% 88%,rgba(255,255,255,.1) 0 3px,transparent 4px),radial-gradient(circle at 64% 48%,transparent 0 18px,rgba(255,255,255,.09) 19px 22px,transparent 23px)}
      .dash-topbar{position:sticky;top:0;z-index:30;display:flex;min-height:74px;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,195,28,.26);padding:0 clamp(18px,5vw,70px);background:rgba(0,0,0,.88);backdrop-filter:blur(14px)}
      .dash-brand{display:inline-flex;align-items:center;gap:12px;color:#fff9e7;text-decoration:none;font-size:1.08rem;font-weight:900}
      .dash-brand img{width:34px;height:34px;object-fit:contain}
      .dash-back,.sync-button,.server-sync,.manage-button,.dash-side-link{position:relative;overflow:hidden}
      .dash-back{display:inline-flex;min-height:42px;align-items:center;justify-content:center;border:1px solid rgba(255,195,28,.55);border-radius:7px;background:#ffc31c;color:#090700;padding:0 18px;text-decoration:none;font-weight:900;box-shadow:0 0 28px rgba(255,195,28,.18)}
      .dash-back::before,.sync-button::before,.server-sync::before,.manage-button::before,.dash-side-link::before{content:"";position:absolute;inset:-35% auto -35% -80%;width:45%;transform:skewX(-18deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.42),transparent);transition:left .55s ease}
      .dash-back:hover::before,.sync-button:hover::before,.server-sync:hover::before,.manage-button:hover::before,.dash-side-link:hover::before{left:135%}
      .dash-layout{display:grid;grid-template-columns:minmax(260px,318px) minmax(0,1fr);gap:clamp(26px,4vw,70px);padding:28px clamp(18px,5vw,70px) 70px}
      .dash-sidebar{position:sticky;top:98px;align-self:start;max-height:calc(100vh - 116px);overflow:auto;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:linear-gradient(180deg,rgba(17,18,24,.96),rgba(10,11,15,.96));padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.34)}
      .server-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
      .server-title{color:#fff;font-size:.86rem;font-weight:900}
      .server-group{display:grid;gap:10px;margin-top:16px}
      .server-group-label{font-size:.78rem;font-weight:900}
      .server-group--with .server-group-label{color:#67e84d}
      .server-group--without .server-group-label{color:#858d9b}
      .server-group--without{border-top:1px solid rgba(255,255,255,.1);padding-top:14px}
      .server-group--without p{margin:0;color:#727b89;font-size:.74rem;font-weight:700;line-height:1.4}
      .sync-button,.server-sync{border:1px solid rgba(255,195,28,.52);border-radius:7px;background:linear-gradient(135deg,#ffb000,#ffc31c);color:#0c0900;font:inherit;font-size:.78rem;font-weight:900;cursor:pointer}
      .sync-button{min-height:34px;padding:0 12px}
      .server-sync{min-width:62px;min-height:32px}
      .server-card{display:grid;grid-template-columns:48px 1fr auto;gap:12px;align-items:center;border:1px solid rgba(255,195,28,.2);border-radius:9px;background:rgba(255,255,255,.045);padding:12px}
      .server-card--compact{grid-template-columns:1fr;justify-items:center;padding:16px}
      .server-card--compact .server-avatar{width:76px;height:76px}
      .server-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,195,28,.55);background:#171820}
      .server-name{display:block;color:#fff;font-size:.95rem;font-weight:900;line-height:1.15}
      .server-members{display:block;margin-top:4px;color:#a8adba;font-size:.78rem;font-weight:700}
      .manage-button{width:100%;min-height:36px;margin-top:10px;border:0;border-radius:7px;background:#ffb000;color:#080600;font:inherit;font-size:.82rem;font-weight:900;cursor:pointer}
      .server-muted{margin:14px 0 18px;border-top:1px solid rgba(255,255,255,.1);padding-top:12px;color:#7f8796;font-size:.76rem;font-weight:800;line-height:1.45}
      .dash-side-nav{display:grid;gap:8px;border-top:1px solid rgba(255,255,255,.1);padding-top:14px}
      .dash-side-link{display:flex;min-height:46px;align-items:center;gap:11px;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:#151924;color:#c7ccd8;text-decoration:none;padding:0 13px;font-size:.9rem;font-weight:800}
      .dash-side-link:hover,.dash-side-link.is-active{border-color:rgba(255,195,28,.42);background:#20283a;color:#fff}
      .nav-mark{width:10px;height:10px;border-radius:3px;border:1px solid rgba(255,195,28,.8);box-shadow:0 0 16px rgba(255,195,28,.18)}
      .dash-main{min-height:calc(100vh - 150px);padding-top:72px}
      .dash-name{margin:0;color:#fff;font-size:clamp(2.4rem,5.5vw,5.15rem);font-weight:900;letter-spacing:0;text-align:center}
      .dash-name span{color:#ffc31c;text-shadow:0 0 34px rgba(255,195,28,.34)}
      .dash-panel{max-width:1020px;margin:42px auto 0;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.025);padding:24px}
      .dash-content-section{display:none}
      .dash-content-section.is-active{display:block}
      body:has(.dash-content-section:target) .dash-content-section{display:none}
      body:has(.dash-content-section:target) .dash-content-section:target{display:block}
      .dash-panel h2{margin:0 0 8px;color:#fff;font-size:1.25rem}
      .dash-panel p{margin:0;color:#9ea6b5;font-size:.98rem;line-height:1.6}
      .ticket-config-panel{max-width:1100px;background:#182332;border-color:rgba(255,255,255,.12)}
      .ticket-config-top,.ticket-editor-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
      .ticket-overline{display:block;color:#ffc31c;font-size:.72rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
      .ticket-config-top h2,.ticket-editor-heading h3{margin:8px 0;color:#fff}
      .ticket-add-panel{display:grid;width:42px;height:42px;place-items:center;border:0;border-radius:8px;background:#ffc31c;color:#0b0900;font-size:1.6rem;font-weight:900;cursor:pointer}
      .ticket-panel-list{display:grid;gap:8px;margin-top:22px}
      .ticket-panel-row{display:flex;min-height:46px;align-items:center;justify-content:space-between;border:1px solid rgba(255,195,28,.32);border-radius:7px;background:#26334a;color:#fff;padding:0 14px;font:800 .88rem "DM Sans",sans-serif;cursor:pointer}
      .ticket-panel-row.is-selected{border-color:#ffc31c;background:#303e57}
      .ticket-panel-row strong{display:inline-grid;width:24px;height:24px;margin-right:8px;place-items:center;border-radius:5px;background:#ffc31c;color:#0b0900}
      .ticket-panel-chevron{color:#ffc31c;font-size:1.3rem}
      .ticket-panel-editor{margin-top:18px;border-radius:8px;background:#121b28;padding:18px}
      .ticket-draft-pill{border:1px solid rgba(255,195,28,.4);border-radius:999px;color:#ffc31c;padding:5px 10px;font-size:.7rem;font-weight:900;text-transform:uppercase}
      .ticket-field{display:grid;gap:8px;margin-top:18px;color:#fff;font-size:.86rem;font-weight:900}
      .ticket-field textarea,.ticket-field input{width:100%;min-height:150px;resize:vertical;border:1px solid rgba(255,255,255,.15);border-radius:7px;background:#2b3a4d;color:#fff;padding:14px;font:700 .96rem/1.5 "DM Sans",sans-serif}
      .ticket-field input{min-height:44px;resize:none}
      .ticket-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px;margin-top:4px}
      .ticket-field select{width:100%;min-height:44px;border:1px solid rgba(255,255,255,.15);border-radius:7px;background:#2b3a4d;color:#fff;padding:0 12px;font:700 .84rem "DM Sans",sans-serif}
      .ticket-emoji-tools{display:flex;align-items:end;gap:10px}
      .ticket-emoji-tools .ticket-field{flex:1}
      .ticket-emoji-add{min-height:44px;border:0;border-radius:7px;background:#ffc31c;color:#0b0900;padding:0 14px;font:900 .82rem "DM Sans",sans-serif;cursor:pointer}
      .ticket-layout-config{margin-top:16px;border:1px solid rgba(255,195,28,.18);border-radius:7px;background:#101923;padding:14px}
      .ticket-layout-config[hidden]{display:none}
      .ticket-config-label{color:#ffc31c;font-size:.72rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
      .ticket-option-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
      .ticket-option-grid input{width:100%;min-height:40px;border:1px solid rgba(255,255,255,.15);border-radius:7px;background:#2b3a4d;color:#fff;padding:0 12px;font:700 .82rem "DM Sans",sans-serif}
      .ticket-preview-label{margin:24px 0 10px;color:#9ea6b5;font-size:.72rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
      .ticket-discord-preview{border-radius:7px;background:#36393f;padding:18px}
      .ticket-preview-author{display:flex;align-items:center;gap:8px;color:#fff;font-size:.82rem}
      .ticket-preview-author img{width:34px;height:34px;border-radius:50%;object-fit:contain;background:#111827;padding:4px}
      .ticket-preview-author span{border-radius:3px;background:#5865f2;padding:2px 4px;font-size:.6rem}
      .ticket-preview-card{max-width:560px;margin:12px 0 0 42px;border-left:4px solid #ffc31c;border-radius:4px;background:#202225;padding:16px}
      .ticket-preview-card h4{margin:0 0 8px;color:#fff;font-size:1rem}
      .ticket-preview-card p{color:#d7d9dc;font-size:.9rem;line-height:1.5}
      .ticket-preview-button,.ticket-save-panel,.ticket-modal-cancel{min-height:38px;border:0;border-radius:7px;padding:0 16px;font:900 .82rem "DM Sans",sans-serif;cursor:pointer}
      .ticket-preview-button{margin-top:14px;background:#ffc31c;color:#0b0900}
      .ticket-save-panel{margin-top:18px;background:#3ca86a;color:#fff}
      .ticket-panel-modal{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:20px}
      .ticket-panel-modal[hidden]{display:none}
      .ticket-panel-modal__backdrop{position:absolute;inset:0;background:rgba(0,0,0,.72)}
      .ticket-panel-modal__card{position:relative;width:min(520px,100%);border:1px solid rgba(255,195,28,.25);border-radius:10px;background:#182332;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.5)}
      .ticket-panel-modal__card h3{margin:0;color:#fff;font-size:1.3rem}
      .ticket-panel-modal__card>p{margin-top:8px}
      .ticket-panel-modal__close{position:absolute;top:12px;right:14px;border:0;background:transparent;color:#9ea6b5;font-size:1.4rem;cursor:pointer}
      .ticket-panel-modal__actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
      .ticket-modal-cancel{background:#303a4b;color:#fff}
      .dash-toast{position:fixed;top:88px;left:50%;z-index:80;display:flex;min-height:42px;align-items:center;justify-content:center;border:1px solid rgba(255,195,28,.42);border-radius:8px;background:rgba(12,13,15,.96);color:#ffc31c;padding:0 18px;font-size:.86rem;font-weight:900;box-shadow:0 20px 50px rgba(255,195,28,.16);opacity:0;pointer-events:none;transform:translate(-50%,-12px);transition:opacity .2s ease,transform .2s ease}
      .dash-toast.is-visible{opacity:1;transform:translate(-50%,0)}
      .dash-toast.is-error{border-color:rgba(255,77,77,.85);background:#3a1016;color:#fff;box-shadow:0 20px 60px rgba(255,35,55,.32)}
      body.is-access-denied::after{content:"";position:fixed;inset:0;z-index:70;pointer-events:none;background:rgba(255,30,45,.2);animation:access-denied-flash .65s ease-out forwards}
      @keyframes access-denied-flash{0%{opacity:0}22%{opacity:1}100%{opacity:0}}
      .server-info-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
      .sync-pill{display:inline-flex;min-height:30px;align-items:center;border:1px solid rgba(103,232,77,.28);border-radius:999px;background:rgba(103,232,77,.1);color:#67e84d;padding:0 12px;font-size:.72rem;font-weight:900;white-space:nowrap}
      .server-info-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:22px}
      .server-info-grid article{border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#101219;padding:16px}
      .server-info-panels{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:22px}
      .server-info-panel{min-height:180px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#182238;overflow:hidden}
      .server-info-panel h3{margin:0;padding:18px 24px;background:#3a465a;color:#fff;font-size:.92rem;font-weight:800}
      .server-info-lines{display:grid;gap:5px;padding:24px;color:#fff;font-size:.9rem;line-height:1.35}
      .server-info-lines strong{font-weight:900}
      .server-info-lines small{color:#fff;font-size:.82rem}
      .server-info-grid span,.panel-mini-head span{display:block;color:#8790a1;font-size:.68rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
      .server-info-grid strong{display:block;margin-top:10px;color:#fff;font-size:1.65rem;line-height:1}
      .server-info-grid small{display:block;margin-top:8px;color:#7f8796;font-size:.75rem;font-weight:800}
      .customize-panel{max-width:1100px;background:#182332;border-color:rgba(255,255,255,.13)}
      .customize-panel h2{text-align:center;font-size:1.45rem;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:20px}
      .customize-media-grid{display:grid;grid-template-columns:minmax(240px,330px) minmax(0,1fr);gap:18px;margin-top:20px}
      .asset-editor{display:grid;gap:14px;border-radius:11px;background:#121b28;padding:18px}
      .asset-editor strong,.bio-field span{color:#fff;font-size:.95rem}
      .asset-editor small,.bio-field small{color:#c9d4e8;font-size:.72rem}
      .bot-avatar-preview{display:grid;place-items:center;min-height:138px;overflow:hidden;border-radius:50%}
      .bot-avatar-preview img{width:128px;height:128px;border:3px solid rgba(58,221,126,.66);border-radius:50%;object-fit:contain;background:#35c86c;padding:24px}
      .bot-avatar-preview.has-custom-image img{width:100%;height:100%;object-fit:cover;background:transparent;padding:0}
      .bot-banner-preview{position:relative;display:grid;min-height:320px;place-items:center;border:2px solid rgba(72,130,207,.7);border-radius:4px;background:#35c86c;overflow:hidden}
      .bot-banner-preview img{width:190px;height:190px;object-fit:contain;filter:brightness(0) invert(1)}
      .bot-banner-preview.has-custom-image img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:none}
      .bot-banner-preview span{position:absolute;right:18px;bottom:16px;width:18px;height:18px;background:#caffd6;clip-path:polygon(50% 0,63% 37%,100% 50%,63% 63%,50% 100%,37% 63%,0 50%,37% 37%)}
      .asset-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .asset-actions button,.reset-bio,.save-bot,.reset-changes{min-width:0;min-height:38px;border:0;border-radius:7px;color:#fff;font:800 .84rem "DM Sans",system-ui,sans-serif;cursor:pointer;white-space:nowrap}
      .asset-actions button,.customize-actions button{position:relative;z-index:3;pointer-events:auto}
      .asset-actions button{background:#247fbd}
      .asset-actions .danger-mini,.reset-bio{background:#ff4f5e}
      .bio-field{display:grid;gap:10px;margin-top:24px}
      .bio-field textarea{min-height:170px;resize:vertical;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:#2b3a4d;color:#fff;padding:14px;font:700 1rem/1.45 "DM Sans",system-ui,sans-serif}
      .customize-actions{display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin-top:10px}
      .reset-bio{padding:0 15px}
      .save-bot{background:#3ca86a;padding:0 15px}
      .reset-changes{background:#247fbd;padding:0 15px}
      .dash-main.is-server-locked .dash-name,.dash-main.is-server-locked [data-dashboard-section]{display:none}
      .dash-main:not(.is-server-locked) .server-select-gate{display:none}
      .dash-layout:has(.dash-main.is-server-locked){display:block;padding:0 clamp(18px,5vw,70px) 70px}
      .dash-layout:has(.dash-main.is-server-locked) .dash-sidebar{display:none}
      .server-select-gate{max-width:1020px;margin:0 auto;padding:10px 0 40px;text-align:center}
      .server-select-gate h1{margin:0 0 54px;color:#fff;font-size:clamp(2rem,3vw,2.55rem);font-weight:900}
      .server-select-gate>h1:not(.server-select-title),.server-select-gate>.server-choice-grid{display:none}
      .server-choice-title{margin:0 0 22px;color:#fff;font-size:clamp(1.7rem,2.6vw,2.25rem);font-weight:900}
      .server-choice-group{margin-top:30px;text-align:left}
      .server-choice-group h2{margin:0 0 18px;color:#fff;font-size:1.08rem;font-weight:900;letter-spacing:.02em}
      .server-choice-group--without{margin-top:52px;padding-top:34px;border-top:1px solid rgba(255,255,255,.1)}
      .server-choice-empty{margin:0;color:#9ca4b5;font-size:.9rem;font-weight:700}
      .server-choice-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px 40px;text-align:left}
      .server-choice{min-width:0}
      .server-choice-card{display:grid;min-height:153px;place-items:center;border:0;border-radius:8px;background:var(--choice-bg,#20222b);overflow:hidden;box-shadow:inset 0 1px rgba(255,255,255,.04)}
      .server-choice-card--red{--choice-bg:linear-gradient(135deg,#6e2d38,#1b1c23 72%)}
      .server-choice-card--gold{--choice-bg:linear-gradient(135deg,#77766f,#282a31 75%)}
      .server-choice-card--green{--choice-bg:linear-gradient(135deg,#66676b,#25272b 75%)}
      .server-choice-card--gray{--choice-bg:linear-gradient(135deg,#44464e,#20222a 75%)}
      .server-choice-card--dark{--choice-bg:#20222b}
      .server-choice-card img,.server-choice-initial{display:grid;width:96px;height:96px;place-items:center;border:0;border-radius:20px;object-fit:contain;background:transparent;color:#ffc31c;font-size:1.5rem;font-weight:900;filter:drop-shadow(0 8px 18px rgba(0,0,0,.28))}
      .server-choice-copy{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:14px}
      .server-choice-copy strong{display:block;color:#fff;font-size:.92rem;line-height:1.4}
      .server-choice-copy small{display:block;margin-top:3px;color:#9ca4b5;font-size:.78rem}
      .server-choice-copy button{min-width:118px;min-height:48px;border:0;border-radius:8px;background:#3a3d49;color:#fff;font:800 .84rem "DM Sans",system-ui,sans-serif;cursor:pointer}
      .server-choice-copy button:hover{background:#4a4e5b}
      .server-choice-copy .server-choice-button{display:inline-flex;min-width:132px;min-height:42px;align-items:center;justify-content:center;border:0;border-radius:7px;background:#303542;color:#fff;font:800 .8rem "DM Sans",system-ui,sans-serif;text-decoration:none;cursor:pointer}
      .server-choice-copy .server-choice-button:hover{background:#414858}
      .server-choice-copy .server-choice-button--invite{background:#ffc31c;color:#0b0900}
      .server-choice-copy .server-choice-button--invite:hover{background:#ffd45c}
      .server-choice{display:grid;grid-template-columns:84px minmax(0,1fr);gap:16px;align-items:center;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(13,15,21,.78);padding:14px;box-shadow:0 12px 30px rgba(0,0,0,.12)}
      .server-choice-card{min-height:76px;padding:0!important;background:linear-gradient(135deg,#282d3a,#171a22);border-radius:8px}
      .server-choice-card img,.server-choice-initial{width:58px;height:58px}
      .server-choice-copy{margin-top:0;min-width:0}
      .server-choice-copy strong{font-size:1rem}
      .server-choice-group h2{text-transform:uppercase;letter-spacing:.1em}
      .server-choice-group--with h2{color:#67e84d}
      .server-choice-group--without h2{color:#9aa2b2}
      @media (min-width:621px){.dash-topbar{justify-content:center}.dash-back{display:inline-flex;position:absolute;right:clamp(18px,5vw,70px)}.server-select-gate{max-width:700px}.server-choice-grid{grid-template-columns:1fr;gap:16px}.server-choice-card{min-height:76px;place-items:center;padding-left:0}.server-choice-card img,.server-choice-initial{width:72px;height:72px}.server-choice-copy{margin-top:0}}
      @media (max-width:900px){.server-choice-grid{grid-template-columns:1fr;gap:16px}}
      @media (max-width:620px){.dash-topbar{justify-content:center}.dash-back{display:inline-flex;position:absolute;right:12px;min-height:34px;padding-inline:10px;font-size:.72rem}.server-choice-grid{grid-template-columns:1fr}.server-select-gate h1{margin-bottom:32px}.server-choice{grid-template-columns:62px minmax(0,1fr);gap:12px;padding:10px}.server-choice-card{min-height:62px;place-items:center}.server-choice-card img,.server-choice-initial{width:48px;height:48px}.server-choice-copy{display:block}.server-choice-copy .server-choice-button{width:100%;margin-top:10px}}
      .dash-section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:18px}
      .dash-section-head strong{color:#ffc31c;font-size:.78rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
      .dash-badge-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .dash-badge{position:relative;display:grid;grid-template-columns:56px 1fr auto;gap:14px;align-items:center;overflow:hidden;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:rgba(18,20,26,.78);padding:16px}
      .dash-badge::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 20%,rgba(255,255,255,.06),transparent 62%);opacity:0;transform:translateX(-100%)}
      .dash-badge:hover::after{animation:dash-sheen 1.05s ease;opacity:1}
      .dash-badge-icon{display:grid;width:58px;height:58px;place-items:center;border:1px solid rgba(255,195,28,.24);border-radius:14px;background:rgba(255,255,255,.04);color:#ffc31c;filter:drop-shadow(0 0 14px rgba(255,195,28,.18))}
      .dash-badge-icon svg{display:block;width:46px;height:46px}
      .dash-badge-img{display:block;width:54px;height:54px;object-fit:contain}
      .dash-badge-fallback{display:block}
      .dash-badge-icon.has-png .dash-badge-fallback{display:none}
      .dash-badge-top{display:flex;align-items:center;gap:10px;margin-bottom:4px}
      .dash-badge-top h3{margin:0;color:#fff;font-size:1rem;line-height:1}
      .dash-badge-top span{border:1px solid rgba(255,195,28,.24);border-radius:999px;color:#ffc31c;padding:3px 8px;font-size:.62rem;font-weight:900;text-transform:uppercase}
      .dash-badge p{margin:0;color:#c1c6d2;font-size:.86rem;line-height:1.35}
      .dash-badge small{display:block;margin-top:5px;color:#878f9f;font-size:.74rem;line-height:1.35}
      .dash-badge-state{border-radius:999px;background:rgba(255,195,28,.12);color:#ffc31c;padding:6px 9px;font-size:.68rem;text-transform:uppercase}
      .is-locked{opacity:.72}
      .is-locked .dash-badge-icon{opacity:.8}
      .dash-badge--blue .dash-badge-icon,.dash-badge--blue .dash-badge-top span{color:#4ab8ff}
      .dash-badge--green .dash-badge-icon,.dash-badge--green .dash-badge-top span{color:#67e84d}
      .dash-badge--violet .dash-badge-icon,.dash-badge--violet .dash-badge-top span{color:#b261ff}
      .dash-badge--orange .dash-badge-icon,.dash-badge--orange .dash-badge-top span{color:#ff8a00}
      @keyframes dash-sheen{from{transform:translateX(-100%)}to{transform:translateX(120%)}}
      @media (max-width:1100px){.dash-badge-grid{grid-template-columns:1fr}.server-info-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.server-info-panels{grid-template-columns:1fr}.customize-media-grid{grid-template-columns:1fr}.bot-banner-preview{min-height:260px}}
      @media (max-width:900px){.dash-layout{grid-template-columns:1fr}.dash-sidebar{position:relative;top:auto;max-height:none}.dash-main{padding-top:18px}.dash-name{text-align:left}.dash-topbar{padding-inline:16px}.dash-back{min-height:38px;padding-inline:13px}}
      @media (max-width:620px){.dash-badge{grid-template-columns:48px 1fr}.dash-badge-state{grid-column:1/-1;width:max-content}.server-card{grid-template-columns:42px 1fr}.server-sync{grid-column:1/-1;width:100%}.server-avatar{width:42px;height:42px}.dash-side-link{min-height:44px}.dash-name{font-size:2.35rem}.server-info-head{display:block}.sync-pill{margin-top:14px}.server-info-grid{grid-template-columns:1fr}.customize-panel{padding:18px}.bot-banner-preview{min-height:210px}.bot-banner-preview img{width:140px;height:140px}.customize-actions span{width:100%;margin-left:0}}
    </style>
  </head>
  <body>
    <div class="dash-toast" id="dash-toast" role="status" aria-live="polite"></div>
    <header class="dash-topbar">
      <a class="dash-brand" href="/">
        <img src="/assets/beacon-logo.png?v=92" width="34" height="34" alt="" />
        <strong>Beacon</strong>
      </a>
      <a class="dash-back" href="/">Back to Beacon</a>
    </header>
    <div class="dash-layout">
      <aside class="dash-sidebar" aria-label="Dashboard navigation">
        <section class="server-picker" aria-label="Server picker">
          <div class="server-head"><span class="server-title">Current server</span></div>
          <div class="server-group server-group--with">
            <div class="server-card server-card--compact">
              <img class="server-avatar" src="${dashboardAvatar}" width="76" height="76" alt="${escapeHtml2(resolvedServerName)}" onerror="this.onerror=null;this.src='/assets/beacon-mark-gold.png?v=1'" />
            </div>
            <button class="manage-button manage-other-button" type="button">Manage other Servers</button>
          </div>
        </section>
        <nav class="dash-side-nav" aria-label="Dashboard sections">
          ${navHtml}
        </nav>
      </aside>
      <main class="dash-main${hasActiveServer ? "" : " is-server-locked"}">
        <div class="server-select-gate">
          <h1 class="server-select-title">Your servers</h1>
          <section class="server-choice-group server-choice-group--with">
            <h2>\u2713 Beacon is on the server</h2>
            <div class="server-choice-grid">${renderServerChoices(serversWithBeacon, "Manage")}</div>
          </section>
          <section class="server-choice-group server-choice-group--without">
            <h2>+ Beacon is not on the server</h2>
            <div class="server-choice-grid">${renderServerChoices(serversWithoutBeacon, "Add Beacon")}</div>
          </section>
        </div>
        <h1 class="dash-name">Welcome, <span>${username}</span></h1>
        <section class="dash-content-section is-active" id="server-info" data-dashboard-section="server-info">
          <div class="dash-panel">
            <div class="server-info-head">
              <div>
                <h2 data-server-info-name>${escapeHtml2(resolvedServerName)}</h2>
                <p data-server-info-copy>Live server overview synced from Beacon. Member joins and server metrics are refreshed for this server.</p>
              </div>
              <span class="sync-pill" data-sync-pill>Synced just now</span>
            </div>
            <div class="server-info-panels">
              <article class="server-info-panel">
                <h3>Server Info</h3>
                <div class="server-info-lines">
                  <span>Members: <strong data-server-info-members>${Number(selectedServer?.members) || 0}</strong></span>
                  <span>Bots: <strong data-server-info-bots>${Number(selectedServer?.bots) || 0}</strong></span>
                  <span>Channels: <strong data-server-info-channels>${Number(selectedServer?.channels) || 0}</strong></span>
                  <span>Roles: <strong data-server-info-roles>${Number(selectedServer?.roles) || 0}</strong></span>
                  <span>Categories: <strong data-server-info-categories>${Number(selectedServer?.categories) || 0}</strong></span>
                </div>
              </article>
              <article class="server-info-panel">
                <h3>Shard Info</h3>
                <div class="server-info-lines">
                  <span>Primary Shard: <strong data-server-info-shard>${Number(selectedServer?.shardId) || 0}</strong> <small>(synced from Beacon)</small></span>
                  <span>Premium Shard: <strong>Not configured</strong></span>
                </div>
              </article>
            </div>
          </div>
        </section>
        <section class="dash-content-section" id="customize-bot" data-dashboard-section="customize-bot">
          <div class="dash-panel customize-panel">
            <h2>Customize Bot</h2>
            <div class="customize-media-grid">
              <article class="asset-editor asset-editor--avatar">
                <strong>Avatar <small>(1024x1024)</small></strong>
                <div class="bot-avatar-preview"><img src="/assets/beacon-logo.png?v=92" alt="" /></div>
                <div class="asset-actions"><button type="button" data-upload-target="avatar-upload" data-native-upload onclick="document.getElementById('avatar-upload')?.click()">Upload image</button><button class="danger-mini" type="button" data-reset-image="avatar">Delete</button></div>
                <input id="avatar-upload" class="asset-upload" type="file" accept="image/*" hidden />
              </article>
              <article class="asset-editor asset-editor--banner">
                <strong>Banner <small>(680x240)</small></strong>
                <div class="bot-banner-preview"><img src="/assets/beacon-logo.png?v=92" alt="" /><span></span></div>
                <div class="asset-actions"><button type="button" data-upload-target="banner-upload" data-native-upload onclick="document.getElementById('banner-upload')?.click()">Upload image</button><button class="danger-mini" type="button" data-reset-image="banner">Delete</button></div>
                <input id="banner-upload" class="asset-upload" type="file" accept="image/*" hidden />
              </article>
            </div>
            <label class="bio-field">
              <span>Bio <small>(190 character limit)</small></span>
              <textarea maxlength="190">${escapeHtml2(botBio)}</textarea>
            </label>
            <div class="customize-actions">
              <button class="reset-bio" type="button">Reset Bio</button>
              <button class="save-bot" type="button">Save Bot Changes</button>
              <button class="reset-changes" type="button">Reset Changes</button>
            </div>
          </div>
        </section>
        ${simplePanels}
        <section class="dash-content-section" id="badges" data-dashboard-section="badges">
          <div class="dash-panel">
            <div class="dash-section-head">
              <div>
                <strong>Unlocked</strong>
                <h2>Your badges</h2>
              </div>
              <p>${unlockedBadges.length} / ${BEACON_BADGES.length} unlocked</p>
            </div>
            <div class="dash-badge-grid">
              ${unlockedBadges.map((badge) => renderBadgeCard(badge, true)).join("")}
            </div>
          </div>
          <div class="dash-panel">
            <div class="dash-section-head">
              <div>
                <strong>Locked</strong>
                <h2>Badges to unlock</h2>
              </div>
              <p>Some hints stay vague on purpose.</p>
            </div>
            <div class="dash-badge-grid">
              ${lockedBadges.map((badge) => renderBadgeCard(badge, false)).join("")}
            </div>
          </div>
        </section>
      </main>
    </div>
    <script>
      (() => {
        const imageState = { avatar: null, banner: null };
        window.__beaconCustomizeImages = imageState;
        const fallbackSave = document.querySelector(".save-bot");
        fallbackSave?.addEventListener("click", async () => {
          if (fallbackSave.dataset.mainHandler === "true") return;
          const serverId = "${escapeHtml2(selectedServer?.id || "")}";
          if (!serverId) return;
          fallbackSave.disabled = true;
          try {
            const payload = { bio: document.querySelector(".bio-field textarea")?.value || "" };
            if (imageState.avatar) payload.avatar = imageState.avatar;
            if (imageState.banner) payload.banner = imageState.banner;
            const response = await fetch("/api/dashboard/customize?server=" + encodeURIComponent(serverId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || "Could not save bot changes");
            fallbackSave.textContent = "Saved";
          } catch (error) {
            fallbackSave.textContent = error.message || "Save failed";
          } finally {
            fallbackSave.disabled = false;
            window.setTimeout(() => { fallbackSave.textContent = "Save Bot Changes"; }, 1800);
          }
        });
        document.querySelectorAll(".asset-upload").forEach((input) => {
          input.addEventListener("change", () => {
            const file = input.files?.[0];
            if (!file || !file.type.startsWith("image/")) return;
            const reader = new FileReader();
            reader.addEventListener("load", () => {
              const image = new Image();
              image.addEventListener("load", () => {
                const canvas = document.createElement("canvas");
                const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
                canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
                const value = canvas.toDataURL("image/png");
                const type = input.id === "avatar-upload" ? "avatar" : "banner";
                const preview = input.closest(".asset-editor")?.querySelector("img");
                if (preview) { preview.src = value; preview.parentElement?.classList.add("has-custom-image"); }
                imageState[type] = value;
                window.dispatchEvent(new CustomEvent("beacon-customize-image", { detail: { type, value } }));
              });
              image.src = reader.result;
            });
            reader.readAsDataURL(file);
          });
        });
      })();
    <\/script>
    <script>
      const tabs = [...document.querySelectorAll("[data-dashboard-tab]")];
      const sections = [...document.querySelectorAll("[data-dashboard-section]")];
      let serverSelected = ${hasActiveServer ? "true" : "false"};
      const dashMain = document.querySelector(".dash-main");
      function activateDashboardTab(id) {
        if (!serverSelected && dashMain?.classList.contains("is-server-locked")) {
          showDashboardToast("Select a server first");
          return;
        }
        const targetId = sections.some((section) => section.dataset.dashboardSection === id) ? id : "server-info";
        sections.forEach((section) => section.classList.toggle("is-active", section.dataset.dashboardSection === targetId));
        tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.dashboardTab === targetId));
        if (location.hash.slice(1) !== targetId) history.replaceState(null, "", "#" + targetId);
      }
      tabs.forEach((tab) => {
        tab.addEventListener("click", (event) => {
          event.preventDefault();
          activateDashboardTab(tab.dataset.dashboardTab);
        });
      });
      window.addEventListener("hashchange", () => activateDashboardTab(location.hash.slice(1)));
      const toast = document.querySelector("#dash-toast");
      let toastTimer = null;
      function showDashboardToast(message, type = "default") {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.toggle("is-error", type === "error");
        toast.classList.add("is-visible");
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => toast.classList.remove("is-visible", "is-error"), 2600);
      }
      function denyServerAccess(reason = "owner") {
        document.body.classList.remove("is-access-denied");
        void document.body.offsetWidth;
        document.body.classList.add("is-access-denied");
        window.setTimeout(() => document.body.classList.remove("is-access-denied"), 700);
        showDashboardToast(reason === "beacon" ? "Need to add Beacon to this server first." : "You cannot manage this server because you are not the owner.", "error");
      }
      const serverInfoName = document.querySelector("[data-server-info-name]");
      const serverInfoMembers = document.querySelector("[data-server-info-members]");
      const serverInfoFields = {
        bots: document.querySelector("[data-server-info-bots]"),
        channels: document.querySelector("[data-server-info-channels]"),
        roles: document.querySelector("[data-server-info-roles]"),
        categories: document.querySelector("[data-server-info-categories]"),
        shard: document.querySelector("[data-server-info-shard]"),
      };
      function updateServerInfo(button) {
        if (serverInfoName) serverInfoName.textContent = button.dataset.serverName || "Selected server";
        if (serverInfoMembers) serverInfoMembers.textContent = button.dataset.serverMembers || "0";
        Object.entries(serverInfoFields).forEach(([key, element]) => {
          if (element) element.textContent = button.dataset["server" + key[0].toUpperCase() + key.slice(1)] || "0";
        });
      }
      function selectServer(button) {
        updateServerInfo(button);
        serverSelected = true;
        dashMain?.classList.remove("is-server-locked");
        document.querySelector(".server-select-gate")?.setAttribute("hidden", "");
        activateDashboardTab("server-info");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (serverSelected) activateDashboardTab(location.hash.slice(1) || "${initialDashboardSection}");
      const customizeStorageKey = "beacon-customize-preview-${escapeHtml2(selectedServer?.id || "default")}";
      const dashboardServerId = "${escapeHtml2(selectedServer?.id || "")}";
      const bioInput = document.querySelector(".bio-field textarea");
      const avatarPreview = document.querySelector(".asset-editor--avatar img");
      const bannerPreview = document.querySelector(".asset-editor--banner img");
      const saveButton = document.querySelector(".save-bot");
      const resetButton = document.querySelector(".reset-bio");
      const resetChangesButton = document.querySelector(".reset-changes");
      const defaultBio = bioInput?.value || "";
      const defaultImage = "/assets/beacon-logo.png?v=92";
      let avatarValue = null;
      let bannerValue = null;
      let avatarChanged = false;
      let bannerChanged = false;
      let avatarApplied = false;
      let bannerApplied = false;
      window.addEventListener("beacon-customize-image", (event) => {
        const type = event.detail?.type;
        if (type === "avatar") { avatarValue = event.detail.value; avatarChanged = true; avatarApplied = false; }
        if (type === "banner") { bannerValue = event.detail.value; bannerChanged = true; bannerApplied = false; }
      });
      function updateImageState(preview, value) {
        preview?.parentElement?.classList.toggle("has-custom-image", Boolean(value));
      }
      try {
        const saved = JSON.parse(localStorage.getItem(customizeStorageKey) || "null");
        if (saved?.bio && bioInput) bioInput.value = saved.bio;
        if (saved?.avatar && avatarPreview) { avatarValue = saved.avatar; avatarApplied = saved.appliedAvatar === true; avatarChanged = !avatarApplied; avatarPreview.src = saved.avatar; updateImageState(avatarPreview, avatarValue); }
        if (saved?.banner && bannerPreview) { bannerValue = saved.banner; bannerApplied = saved.appliedBanner === true; bannerChanged = !bannerApplied; bannerPreview.src = saved.banner; updateImageState(bannerPreview, bannerValue); }
      } catch (_) {}
      if (saveButton) saveButton.dataset.mainHandler = "true";
      saveButton?.addEventListener("click", async () => {
        if (!dashboardServerId) return showDashboardToast("Select a server first", "error");
        const payload = { bio: bioInput?.value || "" };
        if (avatarChanged || window.__beaconCustomizeImages?.avatar) payload.avatar = avatarValue || window.__beaconCustomizeImages.avatar;
        if (bannerChanged || window.__beaconCustomizeImages?.banner) payload.banner = bannerValue || window.__beaconCustomizeImages.banner;
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
        try {
          const response = await fetch("/api/dashboard/customize?server=" + encodeURIComponent(dashboardServerId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          const responseText = await response.text();
          let result = {};
          try { result = JSON.parse(responseText); } catch (_) {}
          if (!response.ok) throw new Error(result.error || ("Discord rejected the profile update (HTTP " + response.status + "). " + responseText.slice(0, 240)));
          if (Array.isArray(result.skippedRateLimitedFields)) {
            if (result.skippedRateLimitedFields.includes("avatar")) { avatarChanged = true; avatarApplied = false; }
            if (result.skippedRateLimitedFields.includes("banner")) { bannerChanged = true; bannerApplied = false; }
          }
          if (payload.avatar && !result.skippedRateLimitedFields?.includes("avatar")) { avatarApplied = true; avatarChanged = false; }
          if (payload.banner && !result.skippedRateLimitedFields?.includes("banner")) { bannerApplied = true; bannerChanged = false; }
          if (result.profile?.avatarUrl && avatarPreview && !result.skippedRateLimitedFields?.includes("avatar")) { avatarPreview.src = result.profile.avatarUrl; avatarValue = result.profile.avatarUrl; updateImageState(avatarPreview, avatarValue); }
          if (result.profile?.bannerUrl && bannerPreview && !result.skippedRateLimitedFields?.includes("banner")) { bannerPreview.src = result.profile.bannerUrl; bannerValue = result.profile.bannerUrl; updateImageState(bannerPreview, bannerValue); }
          try { localStorage.setItem(customizeStorageKey, JSON.stringify({ bio: payload.bio, avatar: avatarValue, banner: bannerValue, appliedAvatar: avatarApplied, appliedBanner: bannerApplied })); } catch (_) {}
          saveButton.textContent = "Saved";
          showDashboardToast(result.message || "Bot profile updated on Discord");
        } catch (error) {
          saveButton.textContent = "Save Bot Changes";
          showDashboardToast(error.message || "Could not update the bot profile", "error");
        } finally {
          saveButton.disabled = false;
          window.setTimeout(() => { saveButton.textContent = "Save Bot Changes"; }, 1800);
        }
      });
      resetButton?.addEventListener("click", () => {
        if (bioInput) bioInput.value = defaultBio;
        showDashboardToast("Bio reset");
      });
      resetChangesButton?.addEventListener("click", () => {
        try { localStorage.removeItem(customizeStorageKey); } catch (_) {}
        if (bioInput) bioInput.value = defaultBio;
        if (avatarPreview) { avatarPreview.src = defaultImage; updateImageState(avatarPreview, null); }
        if (bannerPreview) { bannerPreview.src = defaultImage; updateImageState(bannerPreview, null); }
        avatarValue = null;
        bannerValue = null;
        avatarApplied = false;
        bannerApplied = false;
        avatarChanged = true;
        bannerChanged = true;
        showDashboardToast("All changes reset");
      });
      document.querySelectorAll("[data-upload-target]:not([data-native-upload])").forEach((button) => {
        button.addEventListener("click", () => document.getElementById(button.dataset.uploadTarget)?.click());
      });
      document.querySelectorAll(".asset-upload").forEach((input) => {
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (!file || !file.type.startsWith("image/")) return;
          const preview = input.closest(".asset-editor")?.querySelector("img");
          if (!preview) return;
          const reader = new FileReader();
          reader.addEventListener("load", () => {
            const image = new Image();
            image.addEventListener("load", () => {
              const canvas = document.createElement("canvas");
              const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
              canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
              canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
              canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
              const imageData = canvas.toDataURL("image/png");
              preview.src = imageData;
              updateImageState(preview, imageData);
              if (input.id === "avatar-upload") { avatarValue = imageData; avatarChanged = true; avatarApplied = false; }
              if (input.id === "banner-upload") { bannerValue = imageData; bannerChanged = true; bannerApplied = false; }
              showDashboardToast("Image preview updated");
            });
            image.src = reader.result;
          });
          reader.readAsDataURL(file);
        });
      });
      document.querySelectorAll("[data-reset-image]").forEach((button) => {
        button.addEventListener("click", () => {
          const preview = button.closest(".asset-editor")?.querySelector("img");
          if (preview) { preview.src = defaultImage; updateImageState(preview, null); }
          if (button.dataset.resetImage === "avatar") { avatarValue = null; avatarChanged = true; avatarApplied = false; }
          if (button.dataset.resetImage === "banner") { bannerValue = null; bannerChanged = true; bannerApplied = false; }
          showDashboardToast("Image removed");
        });
      });
      const ticketPanelStorageKey = "beacon-ticket-panels-" + location.search;
      const ticketModal = document.querySelector("[data-ticket-modal]");
      const ticketNameInput = document.querySelector("[data-ticket-name]");
      const ticketEditorTitle = document.querySelector("[data-ticket-editor-title]");
      const ticketMessageInput = document.querySelector("[data-ticket-message]");
      const ticketEmojiIdInput = document.querySelector("[data-ticket-emoji-id]");
      const ticketEmojiAdd = document.querySelector("[data-ticket-emoji-add]");
      const ticketPreviewMessage = document.querySelector("[data-ticket-preview-message]");
      const ticketPanelList = document.querySelector("[data-ticket-panel-list]");
      const ticketLayoutSelect = document.querySelector("[data-ticket-layout]");
      const ticketButtonCountSelect = document.querySelector("[data-ticket-button-count]");
      const ticketChannelSelects = [...document.querySelectorAll("[data-ticket-channel]")];
      const ticketLayoutConfigs = [...document.querySelectorAll("[data-ticket-config]")];
      const ticketOptionInputs = [...document.querySelectorAll("[data-ticket-option-label], [data-ticket-option-description], [data-ticket-button-label], [data-ticket-button-emoji]")];
      function updateTicketLayoutConfig() {
        const layout = ticketLayoutSelect?.value || "buttons";
        ticketLayoutConfigs.forEach((panel) => { panel.hidden = panel.dataset.ticketConfig !== layout; });
        const count = Number(ticketButtonCountSelect?.value || 1);
        document.querySelectorAll("[data-ticket-button-label], [data-ticket-button-emoji]").forEach((input) => {
          input.hidden = Number(input.dataset.ticketButtonLabel || input.dataset.ticketButtonEmoji) > count;
        });
      }
      function ticketPanelDraft() {
        return {
          name: ticketEditorTitle?.textContent || "Ticket Panel",
          message: ticketMessageInput?.value || "",
          layout: ticketLayoutSelect?.value || "buttons",
          buttonCount: ticketButtonCountSelect?.value || "1",
          channels: Object.fromEntries(ticketChannelSelects.map((select) => [select.dataset.ticketChannel, select.value])),
          options: ticketOptionInputs.map((input) => ({
            kind: input.dataset.ticketOptionLabel ? "optionLabel" : input.dataset.ticketOptionDescription ? "optionDescription" : input.dataset.ticketButtonLabel ? "buttonLabel" : "buttonEmoji",
            index: input.dataset.ticketOptionLabel || input.dataset.ticketOptionDescription || input.dataset.ticketButtonLabel || input.dataset.ticketButtonEmoji,
            value: input.value,
          })),
        };
      }
      function closeTicketPanelModal() { if (ticketModal) ticketModal.hidden = true; }
      function updateTicketPreview() {
        if (ticketPreviewMessage && ticketMessageInput) ticketPreviewMessage.textContent = ticketMessageInput.value || "Your ticket message will appear here.";
      }
      document.querySelector("[data-ticket-add]")?.addEventListener("click", () => {
        if (ticketModal) ticketModal.hidden = false;
        ticketNameInput?.focus();
        ticketNameInput?.select();
      });
      document.querySelectorAll("[data-ticket-modal-close]").forEach((button) => button.addEventListener("click", closeTicketPanelModal));
      document.querySelector("[data-ticket-create]")?.addEventListener("click", () => {
        const name = (ticketNameInput?.value || "New Panel").trim().slice(0, 80) || "New Panel";
        const row = document.createElement("button");
        row.className = "ticket-panel-row is-selected";
        row.type = "button";
        row.dataset.ticketPanelRow = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        row.innerHTML = '<span><strong>' + (ticketPanelList?.children.length + 1 || 2) + '</strong> ' + name.replace(/[&<>]/g, '') + '</span><span class="ticket-panel-chevron">\u203A</span>';
        ticketPanelList?.querySelectorAll(".ticket-panel-row").forEach((item) => item.classList.remove("is-selected"));
        ticketPanelList?.append(row);
        if (ticketEditorTitle) ticketEditorTitle.textContent = name;
        closeTicketPanelModal();
        showDashboardToast("Ticket panel created");
      });
      ticketMessageInput?.addEventListener("input", updateTicketPreview);
      ticketLayoutSelect?.addEventListener("change", updateTicketLayoutConfig);
      ticketButtonCountSelect?.addEventListener("change", updateTicketLayoutConfig);
      ticketEmojiAdd?.addEventListener("click", () => {
        const id = (ticketEmojiIdInput?.value || "").match(/d{17,22}/)?.[0];
        if (!id || !ticketMessageInput) {
          showDashboardToast("Enter a valid Discord emoji ID", "error");
          return;
        }
        const token = "<:custom:" + id + ">";
        const start = ticketMessageInput.selectionStart ?? ticketMessageInput.value.length;
        ticketMessageInput.value = ticketMessageInput.value.slice(0, start) + token + ticketMessageInput.value.slice(ticketMessageInput.selectionEnd ?? start);
        ticketMessageInput.focus();
        ticketMessageInput.selectionStart = ticketMessageInput.selectionEnd = start + token.length;
        updateTicketPreview();
        showDashboardToast("Custom emoji inserted");
      });
      document.querySelector("[data-ticket-save]")?.addEventListener("click", async () => {
        const draft = ticketPanelDraft();
        try { localStorage.setItem(ticketPanelStorageKey, JSON.stringify(draft)); } catch (_) {}
        if (!dashboardServerId) { showDashboardToast("Select a Beacon server first", "error"); return; }
        try {
          const response = await fetch("/api/ticket-config?server=" + encodeURIComponent(dashboardServerId), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ config: draft }),
          });
          if (!response.ok) throw new Error("sync failed");
          showDashboardToast("Ticket panel synced with Beacon");
        } catch (_) {
          showDashboardToast("Draft saved locally; server sync failed", "error");
        }
      });
      try {
        const savedTicketPanel = JSON.parse(localStorage.getItem(ticketPanelStorageKey) || "null");
        if (savedTicketPanel?.name && ticketEditorTitle) ticketEditorTitle.textContent = savedTicketPanel.name;
        if (savedTicketPanel?.message && ticketMessageInput) ticketMessageInput.value = savedTicketPanel.message;
        if (savedTicketPanel?.layout && ticketLayoutSelect) ticketLayoutSelect.value = savedTicketPanel.layout;
        if (savedTicketPanel?.buttonCount && ticketButtonCountSelect) ticketButtonCountSelect.value = savedTicketPanel.buttonCount;
        if (savedTicketPanel?.channels) ticketChannelSelects.forEach((select) => { select.value = savedTicketPanel.channels[select.dataset.ticketChannel] || ""; });
        if (Array.isArray(savedTicketPanel?.options)) savedTicketPanel.options.forEach((saved) => {
          const selector = saved.kind === "optionLabel" ? "[data-ticket-option-label="" + saved.index + ""]" : saved.kind === "optionDescription" ? "[data-ticket-option-description="" + saved.index + ""]" : saved.kind === "buttonLabel" ? "[data-ticket-button-label="" + saved.index + ""]" : "[data-ticket-button-emoji="" + saved.index + ""]";
          const input = document.querySelector(selector);
          if (input) input.value = saved.value || "";
        });
        updateTicketLayoutConfig();
        updateTicketPreview();
      } catch (_) {}
      updateTicketLayoutConfig();
      document.querySelectorAll(".sync-button").forEach((button) => {
        button.addEventListener("click", () => {
          const pill = document.querySelector("[data-sync-pill]");
          if (pill) pill.textContent = "Synced just now";
          showDashboardToast("Servers synced");
        });
      });
      document.querySelectorAll(".manage-other-button").forEach((button) => {
        button.addEventListener("click", () => window.location.reload());
      });
      document.querySelectorAll(".server-sync").forEach((button) => {
        button.addEventListener("click", () => {
          if (button.dataset.canManage !== "true") return denyServerAccess(button.dataset.denialReason);
          serverSelected = true;
          dashMain?.classList.remove("is-server-locked");
          activateDashboardTab("server-info");
        });
      });
      document.querySelectorAll(".server-choice-button").forEach((button) => {
        button.addEventListener("click", (event) => {
          if (button.dataset.canManage !== "true") {
            if (button.tagName === "A") return;
            event.preventDefault();
            return denyServerAccess(button.dataset.denialReason);
          }
          event.preventDefault();
          selectServer(button);
        });
      });
      document.querySelectorAll(".dash-badge-img").forEach((image) => {
        image.addEventListener("load", () => image.closest(".dash-badge-icon")?.classList.add("has-png"));
        image.addEventListener("error", () => image.remove());
      });
    <\/script>
  </body>
</html>`;
  return new Response(html3, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8"
    }
  });
}
__name(onRequestGet5, "onRequestGet");

// secret-badge/index.js
async function unlockSecretBadge(env, userId) {
  if (!env.STATUS_DB || !userId) return false;
  await env.STATUS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS badge_unlocks (
      user_id TEXT NOT NULL,
      badge_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, badge_id)
    )
  `).run();
  await env.STATUS_DB.prepare(`
    INSERT OR IGNORE INTO badge_unlocks (user_id, badge_id) VALUES (?, ?)
  `).bind(userId, "found-the-light").run();
  return true;
}
__name(unlockSecretBadge, "unlockSecretBadge");
async function hasClaimedSecretBadge(env, userId) {
  if (!env.STATUS_DB || !userId) return false;
  await env.STATUS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS badge_unlocks (
      user_id TEXT NOT NULL,
      badge_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, badge_id)
    )
  `).run();
  const result = await env.STATUS_DB.prepare(
    "SELECT 1 FROM badge_unlocks WHERE user_id = ? AND badge_id = ? LIMIT 1"
  ).bind(userId, "found-the-light").first();
  return Boolean(result);
}
__name(hasClaimedSecretBadge, "hasClaimedSecretBadge");
function renderPage({ signedIn, claimed }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <title>Secret Badge | Beacon</title>
    <link rel="icon" type="image/png" href="/assets/beacon-logo.png?v=92" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@600;700;800;900&display=swap" rel="stylesheet" />
    <style>
      *{box-sizing:border-box}
      html,body{min-height:100%;margin:0;background:#000;color:#f6f3ea;font-family:"DM Sans",system-ui,sans-serif}
      body{display:grid;place-items:center;padding:28px;background:radial-gradient(circle at 70% 12%,rgba(255,195,28,.12),transparent 28rem),#000}
      .secret-card{width:min(100%,560px);border:1px solid rgba(255,195,28,.22);border-radius:10px;background:linear-gradient(180deg,rgba(15,16,19,.96),rgba(8,9,11,.96));padding:28px;box-shadow:0 28px 90px rgba(0,0,0,.5)}
      .badge-preview{display:grid;grid-template-columns:86px 1fr auto;gap:22px;align-items:start}
      .badge-icon{display:grid;width:76px;height:76px;place-items:center;border:1px solid rgba(255,195,28,.38);border-radius:16px;background:rgba(255,195,28,.08)}
      .badge-icon img{width:72px;height:72px;object-fit:contain}
      h1{margin:0;color:#fff;font-size:2rem;line-height:1.02}
      .tag{display:inline-flex;min-height:25px;align-items:center;border:1px solid rgba(103,232,77,.36);border-radius:999px;color:#67e84d;background:rgba(103,232,77,.1);padding:0 10px;font-size:.72rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
      p{margin:10px 0 0;color:#c4c8d1;line-height:1.45}
      strong{display:block;margin-top:18px;color:#fff;font-size:.82rem;letter-spacing:.1em;text-transform:uppercase}
      form{margin-top:26px}
      button,.login{display:inline-flex;width:100%;min-height:48px;align-items:center;justify-content:center;border:0;border-radius:8px;background:#ffc31c;color:#070600;font:900 .95rem "DM Sans",system-ui,sans-serif;text-decoration:none;cursor:pointer;box-shadow:0 16px 40px rgba(255,195,28,.18);transition:transform .16s ease,filter .16s ease}
      button:hover,.login:hover{filter:brightness(1.05);transform:translateY(-2px)}
      button.claimed-button{color:#d9fff0;background:rgba(46,219,132,.16);box-shadow:inset 0 0 0 1px rgba(86,239,158,.35);cursor:default}
      button.claimed-button:hover{filter:none;transform:none}
      .claimed-note{margin-top:10px;text-align:center;color:#7f8897;font-size:.78rem}
      .back{display:block;margin-top:16px;color:#8e96a6;text-align:center;text-decoration:none;font-size:.86rem;font-weight:800}
      @media(max-width:560px){.badge-preview{grid-template-columns:76px 1fr}.tag{grid-column:1/-1;width:max-content}.secret-card{padding:22px}h1{font-size:1.75rem}}
    </style>
  </head>
  <body>
    <main class="secret-card">
      <div class="badge-preview">
        <div class="badge-icon"><img src="/assets/badges/found-the-light.png" alt="" /></div>
        <div>
          <h1>Found the Light</h1>
          <p>Found a hidden interaction somewhere on Beacon.</p>
          <strong>Hint</strong>
          <p>Watch small details on Beacon pages. Some things answer only after you notice the pattern.</p>
        </div>
        <span class="tag">Easter Egg</span>
      </div>
      ${signedIn ? claimed ? `<button class="claimed-button" type="button" disabled><span aria-hidden="true">\u2713</span> Already claimed</button><p class="claimed-note">You have already claimed this badge. It can only be claimed once.</p>` : `<form method="post"><button type="submit">Claim Badge</button></form>` : `<a class="login" href="/api/auth/discord/login?next=/secret-badge">Login to claim badge</a>`}
      <a class="back" href="/">Back to Beacon</a>
    </main>
  </body>
</html>`;
}
__name(renderPage, "renderPage");
async function onRequestGet6({ request, env }) {
  const { sessionSecret } = getConfig(env);
  const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
  const signedIn = Boolean(session?.user);
  const claimed = signedIn ? await hasClaimedSecretBadge(env, session.user.id) : false;
  return new Response(renderPage({ signedIn, claimed }), {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8"
    }
  });
}
__name(onRequestGet6, "onRequestGet");
async function onRequestPost3({ request, env }) {
  const { sessionSecret } = getConfig(env);
  const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
  if (!session?.user) {
    return Response.redirect(new URL("/?login_required=1", request.url).toString(), 302);
  }
  await unlockSecretBadge(env, session.user.id);
  return Response.redirect(new URL("/dashboard#badges", request.url).toString(), 303);
}
__name(onRequestPost3, "onRequestPost");

// cmd-page.css.js
var css = `
.commands-page .commands-shell{display:block;min-height:calc(100vh - 72px)}
.commands-page .commands-doc{grid-column:auto;width:min(100%,1120px);margin:0 auto;padding:78px 64px 104px}
.commands-page .commands-doc+.commands-doc{border-top:0}
.commands-page .commands-sidebar{display:none}
.commands-tabs{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 34px}
.commands-tabs a{display:inline-flex;min-height:40px;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:0 15px;color:#c8ccd8;background:#0b0c10;font-size:.84rem;font-weight:800}
.commands-tabs a:hover,.commands-tabs a.is-active{border-color:rgba(255,195,28,.42);color:#101010;background:#ffc31c}
.commands-home-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:34px}
.commands-home-card{display:block;min-height:180px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:#0d0e13;padding:26px;transition:border-color .16s ease,transform .16s ease}
.commands-home-card:hover{border-color:rgba(255,195,28,.5);transform:translateY(-2px)}
.commands-home-card strong{display:block;margin-bottom:12px;color:#fff;font-size:1.4rem}
.commands-home-card p{margin:0;color:#a9adba;line-height:1.6}
@media (max-width:900px){.commands-page .commands-doc{padding:42px 20px 70px}}
@media (max-width:560px){.commands-home-grid{grid-template-columns:1fr}}
`;
function onRequest7() {
  return new Response(css, {
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate"
    }
  });
}
__name(onRequest7, "onRequest");

// commands.js
var html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <title>Beacon Commands</title>
    <link rel="icon" type="image/png" href="/assets/beacon-logo.png?v=92" />
    <link rel="stylesheet" href="/commands.css?v=7" />
    <link rel="stylesheet" href="/cmd-page.css?v=1" />
  </head>
  <body class="commands-page">
    <nav class="commands-nav" aria-label="Beacon commands navigation">
      <a class="commands-brand" href="https://beacon-bot.site/">
        <img src="/assets/beacon-logo.png?v=92" width="34" height="34" alt="" />
        <span>Beacon</span>
      </a>
      <a class="commands-back" href="https://beacon-bot.site/">Back to Beacon</a>
    </nav>

    <main class="commands-shell">
      <section class="commands-doc">
        <nav class="commands-tabs" aria-label="Command pages">
          <a href="/commands/tickets/">Tickets</a>
          <a href="/commands/emoji-steal/">Emoji Steal</a>
          <a href="/commands/purge/">Purge</a><a href="/commands/honeypot/">Honeypot</a><a href="/commands/polls/">Polls</a>
        </nav>
        <h1>Beacon Commands</h1>
        <p class="doc-lead">Pick the command section you want. Each page is split out so the docs stay centered, readable, and not squeezed into the sidebar.</p>
        <div class="commands-home-grid">
          <a class="commands-home-card" href="/commands/tickets/">
            <strong>Tickets</strong>
            <p>Setup, panels, claiming, closing, transcripts, and the ticket flow staff will use every day.</p>
          </a>
          <a class="commands-home-card" href="/commands/emoji-steal/">
            <strong>Emoji Steal</strong>
            <p>Single and bulk emoji stealing with keep-name options, confirmation, and result previews.</p>
          </a>
          <a class="commands-home-card" href="/commands/purge/">
            <strong>Purge</strong>
            <p>Fast message cleanup commands for recent messages, users, bots, links, invites, files, embeds, and text matches.</p>
          </a>
          <a class="commands-home-card" href="/commands/honeypot/"><strong>Honeypot</strong><p>Protect a decoy channel from spam bots with configurable moderation, ban actions and message cleanup.</p></a>
          <a class="commands-home-card" href="/commands/polls/"><strong>Polls</strong><p>Create live Components V2 polls with multiple options, participant counts, voting and automatic expiry.</p></a>
        </div>
      </section>
    </main>
  </body>
</html>`;
function onRequest8() {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate"
    }
  });
}
__name(onRequest8, "onRequest");

// docs/index.js
function onRequest9() {
  return new Response(null, {
    status: 404,
    headers: { "cache-control": "no-store" }
  });
}
__name(onRequest9, "onRequest");

// prestige/index.js
var html2 = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#050505" />
    <meta name="description" content="Beacon Prestige is a lifetime upgrade for Discord communities that want premium growth tools." />
    <title>Beacon Prestige | Lifetime Premium</title>
    <link rel="icon" type="image/png" href="/assets/prestige-logo.png?v=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/prestige.css?v=4" />
  </head>
  <body>
    <nav class="prestige-nav" aria-label="Beacon Prestige navigation">
      <a class="prestige-brand" href="https://beacon-bot.site/">
        <img src="/assets/prestige-logo.png?v=1" width="34" height="34" alt="" />
        <span>Beacon Prestige</span>
      </a>
      <div class="prestige-nav__links">
        <a class="prestige-nav__button" href="https://beacon-bot.site/">Back to Beacon</a>
      </div>
    </nav>

    <main>
      <section class="server-strip" aria-label="Featured servers using Beacon">
        <p>Actual servers running Beacon Prestige</p>
        <div class="marquee marquee--left">
          <div class="marquee__track" data-server-track="primary"></div>
        </div>
        <div class="marquee marquee--right">
          <div class="marquee__track" data-server-track="secondary"></div>
        </div>
      </section>

      <section class="prestige-hero">
        <div class="hero-copy">
          <h1>Get more out of every Discord server you run.</h1>
          <p>Higher limits, exclusive tools and quality-of-life upgrades for communities that have outgrown the free tier.</p>
        </div>

        <aside class="prestige-showcase" aria-label="Beacon Prestige plan">
          <div class="logo-orbit">
            <img src="/assets/prestige-logo.png?v=1" width="320" height="320" alt="Beacon Prestige logo" />
          </div>
          <article class="price-card is-coming-soon" id="plan">
            <div class="coming-soon-overlay" role="status"><span>Coming Soon</span><small>The Prestige checkout is being prepared.</small></div>
            <div class="price-card-content">
            <div class="plan-head">
              <div>
                <h2>Prestige</h2>
                <p>Lifetime premium for one server.</p>
              </div>
              <span>Lifetime</span>
            </div>
            <div class="price"><strong>$9.99</strong><small>one time</small></div>
            <a class="buy-button" href="/api/auth/discord/login" aria-disabled="true" tabindex="-1">Get Prestige</a>
            <ul>
              <li>Prestige leaderboard with custom public link.</li>
              <li>Exclusive prestige profile and leaderboard features.</li>
              <li>Premium rank visuals and profile badges.</li>
              <li>Higher XP limits and faster community progression.</li>
              <li>Priority setup help for your server.</li>
            </ul>
            <p class="purchase-note">Price: $9.99 one-time for one server. The purchase flow will show the final total price, provider, payment terms, withdrawal information and cancellation/support options before payment. See the <a href="/tos/">Terms of Use</a> and <a href="/privacy/">Privacy Policy</a>.</p>
            </div>
          </article>
        </aside>
      </section>
    </main>
    <script src="/prestige.js?v=2"><\/script>
  </body>
</html>
`;
function onRequest10() {
  return new Response(html2, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate"
    }
  });
}
__name(onRequest10, "onRequest");

// [lang].js
var LANGUAGES = {
  en: ["en", "Beacon \u2013 Discord Bot for Tickets, Moderation & Community", "Beacon is a Discord bot for tickets, moderation, automation and community management."],
  de: ["de", "Beacon \u2013 Discord Bot f\xFCr Tickets, Moderation & Community", "Beacon ist ein Discord-Bot f\xFCr Tickets, Moderation, Automatisierung und Community-Management."],
  fr: ["fr", "Beacon \u2013 Bot Discord pour tickets, mod\xE9ration et communaut\xE9", "Beacon est un bot Discord pour les tickets, la mod\xE9ration, l\u2019automatisation et la gestion de communaut\xE9."],
  es: ["es", "Beacon \u2013 Bot de Discord para tickets, moderaci\xF3n y comunidad", "Beacon es un bot de Discord para tickets, moderaci\xF3n, automatizaci\xF3n y gesti\xF3n de comunidades."],
  tr: ["tr", "Beacon \u2013 Ticket, moderasyon ve topluluk i\xE7in Discord botu", "Beacon; ticket, moderasyon, otomasyon ve topluluk y\xF6netimi i\xE7in bir Discord botudur."],
  ar: ["ar", "Beacon \u2013 \u0628\u0648\u062A Discord \u0644\u0644\u062A\u0630\u0627\u0643\u0631 \u0648\u0627\u0644\u0625\u0634\u0631\u0627\u0641 \u0648\u0627\u0644\u0645\u062C\u062A\u0645\u0639\u0627\u062A", "Beacon \u0647\u0648 \u0628\u0648\u062A Discord \u0644\u0644\u062A\u0630\u0627\u0643\u0631 \u0648\u0627\u0644\u0625\u0634\u0631\u0627\u0641 \u0648\u0627\u0644\u0623\u062A\u0645\u062A\u0629 \u0648\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062C\u062A\u0645\u0639\u0627\u062A."],
  pt: ["pt", "Beacon \u2013 Bot Discord para tickets, modera\xE7\xE3o e comunidade", "Beacon \xE9 um bot Discord para tickets, modera\xE7\xE3o, automa\xE7\xE3o e gest\xE3o de comunidades."],
  "pt-BR": ["pt-BR", "Beacon \u2013 Bot Discord para tickets, modera\xE7\xE3o e comunidade", "Beacon \xE9 um bot Discord para tickets, modera\xE7\xE3o, automa\xE7\xE3o e gest\xE3o de comunidades."],
  it: ["it", "Beacon \u2013 Bot Discord per ticket, moderazione e community", "Beacon \xE8 un bot Discord per ticket, moderazione, automazione e gestione della community."],
  nl: ["nl", "Beacon \u2013 Discord-bot voor tickets, moderatie en community", "Beacon is een Discord-bot voor tickets, moderatie, automatisering en communitybeheer."]
};
async function onRequest11(context) {
  const pathname = new URL(context.request.url).pathname;
  if (pathname.startsWith("/api/")) return context.next();
  const key = context.params.lang;
  const language = LANGUAGES[key];
  if (!language) return context.env.ASSETS.fetch(context.request);
  if (pathname !== `/${key}` && pathname !== `/${key}/`) {
    return context.env.ASSETS.fetch(context.request);
  }
  if (context.request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
  const rootUrl = new URL("/", context.request.url);
  const response = await context.env.ASSETS.fetch(new Request(rootUrl, context.request));
  if (!response.ok) return response;
  let html3 = await response.text();
  html3 = html3.replace(/<html lang="[^"]+">/, `<html lang="${language[0]}">`).replace(/<title>[\s\S]*?<\/title>/, `<title>${language[1]}</title>`).replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${language[2]}" />`).replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${new URL(`/${key}/`, context.request.url).toString()}" />`);
  return new Response(html3, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "content-language": language[0], "cache-control": "public, max-age=0, must-revalidate" } });
}
__name(onRequest11, "onRequest");

// _middleware.js
async function onRequest12(context) {
  const url = new URL(context.request.url);
  if (url.pathname === "/commands-page.css") {
    return new Response(
      ".commands-page .commands-shell{display:block;min-height:calc(100vh - 72px)}.commands-page .commands-doc{grid-column:auto;width:min(100%,1120px);margin:0 auto;padding:78px 64px 104px}.commands-page .commands-doc+.commands-doc{border-top:0}.commands-page .commands-sidebar{display:none}.commands-tabs{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 34px}.commands-tabs a{display:inline-flex;min-height:40px;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:0 15px;color:#c8ccd8;background:#0b0c10;font-size:.84rem;font-weight:800}.commands-tabs a:hover,.commands-tabs a.is-active{border-color:rgba(255,195,28,.42);color:#101010;background:#ffc31c}.commands-home-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:34px}.commands-home-card{display:block;min-height:180px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:#0d0e13;padding:26px;transition:border-color .16s ease,transform .16s ease}.commands-home-card:hover{border-color:rgba(255,195,28,.5);transform:translateY(-2px)}.commands-home-card strong{display:block;margin-bottom:12px;color:#fff;font-size:1.4rem}.commands-home-card p{margin:0;color:#a9adba;line-height:1.6}@media (max-width:900px){.commands-page .commands-doc{padding:42px 20px 70px}}@media (max-width:560px){.commands-home-grid{grid-template-columns:1fr}}",
      {
        headers: {
          "content-type": "text/css; charset=utf-8",
          "cache-control": "public, max-age=0, must-revalidate"
        }
      }
    );
  }
  if (url.hostname === "www.beacon-bot.site") {
    url.hostname = "beacon-bot.site";
    return Response.redirect(url.toString(), 301);
  }
  if (url.hostname === "status.beacon-bot.site" && (url.pathname === "/" || url.pathname === "/index.html")) {
    url.pathname = "/status/";
    return fetch(new Request(url, context.request));
  }
  if (url.hostname === "prestige.beacon-bot.site" && (url.pathname === "/" || url.pathname === "/index.html")) {
    url.pathname = "/prestige/";
    return context.next(new Request(url, context.request));
  }
  if (url.hostname === "badges.beacon-bot.site" && (url.pathname === "/" || url.pathname === "/index.html")) {
    url.pathname = "/badges/";
    return context.next(new Request(url, context.request));
  }
  const response = await context.next();
  if (url.pathname === "/" || url.pathname === "/index.html") {
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store, max-age=0");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  const legalPages = /* @__PURE__ */ new Set(["/tos", "/privacy", "/gdpr", "/cookies", "/eula", "/copyright", "/imprint"]);
  if (legalPages.has(url.pathname)) {
    url.pathname += "/";
    return Response.redirect(url.toString(), 301);
  }
  return response;
}
__name(onRequest12, "onRequest");

// ../.wrangler/tmp/pages-LvbuGE/functionsRoutes-0.8926432012499412.mjs
var routes = [
  {
    routePath: "/api/auth/discord/callback",
    mountPath: "/api/auth/discord",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/auth/discord/login",
    mountPath: "/api/auth/discord",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/auth/discord/logout",
    mountPath: "/api/auth/discord",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/auth/discord/session",
    mountPath: "/api/auth/discord",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/dashboard/customize",
    mountPath: "/api/dashboard",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/public-stats",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/discord-stats",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/api/public-stats",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/ticket-config",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/api/:path*",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/docs/:path*",
    mountPath: "/docs",
    method: "",
    middlewares: [],
    modules: [onRequest5]
  },
  {
    routePath: "/status/:path*",
    mountPath: "/status",
    method: "",
    middlewares: [],
    modules: [onRequest6]
  },
  {
    routePath: "/dashboard",
    mountPath: "/",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/secret-badge",
    mountPath: "/secret-badge",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/secret-badge",
    mountPath: "/secret-badge",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/cmd-page.css",
    mountPath: "/",
    method: "",
    middlewares: [],
    modules: [onRequest7]
  },
  {
    routePath: "/commands",
    mountPath: "/",
    method: "",
    middlewares: [],
    modules: [onRequest8]
  },
  {
    routePath: "/commands-page.css",
    mountPath: "/",
    method: "",
    middlewares: [],
    modules: [onRequest7]
  },
  {
    routePath: "/docs",
    mountPath: "/docs",
    method: "",
    middlewares: [],
    modules: [onRequest9]
  },
  {
    routePath: "/prestige",
    mountPath: "/prestige",
    method: "",
    middlewares: [],
    modules: [onRequest10]
  },
  {
    routePath: "/:lang",
    mountPath: "/",
    method: "",
    middlewares: [],
    modules: [onRequest11]
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest12],
    modules: []
  }
];

// ../../AppData/Roaming/npm/node_modules/wrangler/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../AppData/Roaming/npm/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
