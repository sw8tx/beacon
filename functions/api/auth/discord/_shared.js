const CLIENT_ID = "1529195963787251784";
const DEFAULT_REDIRECT_URI = "https://beacon-bot.site/api/auth/discord/callback";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64UrlEncode(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export function getCookie(request, name) {
  const prefix = `${name}=`;
  const entry = (request.headers.get("cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}

export function createCookie(name, value, { maxAge = 0, path = "/", httpOnly = true } = {}) {
  const parts = [`${name}=${value}`, `Path=${path}`, "Secure", "SameSite=Lax"];
  if (httpOnly) parts.push("HttpOnly");
  if (maxAge >= 0) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

export function randomState() {
  const value = new Uint8Array(24);
  crypto.getRandomValues(value);
  return base64UrlEncode(value);
}

export function getConfig(env) {
  return {
    clientId: env.DISCORD_CLIENT_ID || CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
    botToken: env.DISCORD_BOT_TOKEN,
    supportGuildId: env.DISCORD_SUPPORT_GUILD_ID,
    sessionSecret: env.AUTH_SESSION_SECRET,
    redirectUri: env.DISCORD_REDIRECT_URI || DEFAULT_REDIRECT_URI,
  };
}

export async function createSession(user, secret) {
  const payload = base64UrlEncode(JSON.stringify({
    user,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }));
  return `${payload}.${await sign(payload, secret)}`;
}

export async function readSession(value, secret) {
  if (!value || !secret) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || signature !== await sign(payload, secret)) return null;
  try {
    const session = JSON.parse(decoder.decode(base64UrlDecode(payload)));
    return session.exp > Math.floor(Date.now() / 1000) ? session : null;
  } catch {
    return null;
  }
}

export function avatarUrl(user) {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=128`;
  const index = Number((BigInt(user.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export function errorResponse(message, status = 500) {
  return new Response(message, { status, headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } });
}
