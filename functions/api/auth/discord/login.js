import { createCookie, getConfig, randomState } from "./_shared.js";

export async function onRequestGet({ env }) {
  const { clientId, redirectUri } = getConfig(env);
  const state = randomState();
  const authorizationUrl = new URL("https://discord.com/oauth2/authorize");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("scope", "identify guilds.join");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("prompt", "consent");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizationUrl.toString(),
      "Set-Cookie": createCookie("discord_oauth_state", state, { maxAge: 600, path: "/api/auth/discord/callback" }),
    },
  });
}
