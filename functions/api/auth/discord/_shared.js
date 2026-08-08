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

export function createCookie(name, value, { maxAge = 0, path = "/", httpOnly = true, domain = "" } = {}) {
  const parts = [`${name}=${value}`, `Path=${path}`, "Secure", "SameSite=Lax"];
  if (domain) parts.push(`Domain=${domain}`);
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
    clientSecret: env.DISCORD_CLIENT_SECRET || env.CLIENT_SECRET,
    botToken: env.DISCORD_BOT_TOKEN || env.DISCORD_TOKEN || env.BOT_TOKEN || env.TOKEN,
    supportGuildId: env.DISCORD_SUPPORT_GUILD_ID || env.SUPPORT_GUILD_ID || env.DEV_GUILD_ID,
    sessionSecret: env.AUTH_SESSION_SECRET,
    redirectUri: env.DISCORD_REDIRECT_URI || env.REDIRECT_URI || DEFAULT_REDIRECT_URI,
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
  const loginHref = "/api/auth/discord/login";
  const html = `<!doctype html>
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
  return new Response(html, { status, headers: { "cache-control": "no-store", "content-type": "text/html; charset=utf-8" } });
}
