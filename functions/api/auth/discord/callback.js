import { avatarUrl, createCookie, createSession, errorResponse, getConfig, getCookie } from "./_shared.js";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const { clientId, clientSecret, botToken, supportGuildId, sessionSecret, redirectUri } = getConfig(env);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = getCookie(request, "discord_oauth_state");

  if (url.searchParams.has("error")) return errorResponse("Discord login was cancelled.", 400);
  if (!code || !state || !expectedState || state !== expectedState) return errorResponse("Discord login state is invalid. Please try again.", 400);
  if (!clientSecret || !botToken || !supportGuildId || !sessionSecret) return errorResponse("Discord login is not configured yet. Add the required Cloudflare secrets.", 503);

  try {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    const clientCredentials = btoa(`${clientId}:${clientSecret}`);
    const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${clientCredentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody.toString(),
    });
    if (!tokenResponse.ok) {
      console.error(`[discord-oauth] Token exchange failed: ${tokenResponse.status}`);
      return errorResponse("Discord could not finish the login. Please start the login again.", 400);
    }

    const token = await tokenResponse.json();
    const userResponse = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!userResponse.ok) return errorResponse("Discord profile could not be loaded.", 400);
    const discordUser = await userResponse.json();
    const joinResponse = await fetch(`${DISCORD_API}/guilds/${supportGuildId}/members/${discordUser.id}`, {
      method: "PUT",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token.access_token }),
    });
    if (!joinResponse.ok) {
      console.error(`[discord-oauth] Support server join failed: ${joinResponse.status}`);
      return errorResponse("Your Discord profile is ready, but the Support Server join could not be completed.", 400);
    }

    const user = {
      id: String(discordUser.id),
      username: String(discordUser.global_name || discordUser.username || "Discord user").slice(0, 80),
      avatar: avatarUrl(discordUser),
    };
    const session = await createSession(user, sessionSecret);
    const headers = new Headers({ Location: new URL("/", request.url).toString() });
    headers.append("Set-Cookie", createCookie("beacon_session", session, { maxAge: 60 * 60 * 24 * 7 }));
    headers.append("Set-Cookie", createCookie("discord_oauth_state", "", { maxAge: 0, path: "/api/auth/discord/callback" }));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error(`[discord-oauth] Callback failed: ${error instanceof Error ? error.message : String(error)}`);
    return errorResponse("Discord login could not be completed. Please try again.", 400);
  }
}
