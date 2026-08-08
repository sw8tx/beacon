import { avatarUrl, createCookie, createSession, errorResponse, getConfig, getCookie, verifyOauthState } from "./_shared.js";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";

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

function restartLogin(request) {
  const loginUrl = new URL("/api/auth/discord/login", request.url);
  loginUrl.searchParams.set("fresh", Date.now().toString(36));
  const headers = new Headers({ Location: loginUrl.toString() });
  headers.append("Set-Cookie", createCookie("discord_oauth_state", "", { maxAge: 0, path: "/" }));
  headers.append("Set-Cookie", createCookie("discord_oauth_state", "", { maxAge: 0, path: "/api/auth/discord/callback" }));
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const { clientId, clientSecret, botToken, supportGuildId, sessionSecret, redirectUri } = getConfig(env);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = getCookie(request, "discord_oauth_state");

  if (url.searchParams.has("error")) return errorResponse("Discord login was cancelled.", 400);
  if (!clientSecret || !sessionSecret) return errorResponse("Discord login is not configured yet. Add the required Cloudflare secrets.", 503);
  const hasCookieState = Boolean(expectedState && state && state === expectedState);
  const hasSignedState = await verifyOauthState(state, sessionSecret);
  if (!code || !state || (!hasCookieState && !hasSignedState)) return restartLogin(request);

  try {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    const basicAuth = btoa(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`);
    const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody.toString(),
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
    if (botToken && supportGuildId) {
      const joinResponse = await fetch(`${DISCORD_API}/guilds/${supportGuildId}/members/${discordUser.id}`, {
        method: "PUT",
        headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token.access_token }),
      });
      if (!joinResponse.ok && joinResponse.status !== 204) {
        const joinDetails = await joinResponse.text().catch(() => "");
        console.error(`[discord-oauth] Support server join skipped after failure: ${joinResponse.status} ${joinDetails.slice(0, 180)}`);
      }
    }

    const user = {
      id: String(discordUser.id),
      username: String(discordUser.global_name || discordUser.username || "Discord user").slice(0, 80),
      avatar: avatarUrl(discordUser),
    };
    const session = await createSession(user, sessionSecret);
    const headers = new Headers({ Location: new URL("/", request.url).toString() });
    headers.append("Set-Cookie", createCookie("beacon_session", session, { maxAge: 60 * 60 * 24 * 7, domain: ".beacon-bot.site" }));
    headers.append("Set-Cookie", createCookie("beacon_session", session, { maxAge: 60 * 60 * 24 * 7 }));
    headers.append("Set-Cookie", createCookie("discord_oauth_state", "", { maxAge: 0, path: "/" }));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error(`[discord-oauth] Callback failed: ${error instanceof Error ? error.message : String(error)}`);
    return errorResponse("Discord login could not be completed. Please try again.", 400);
  }
}
