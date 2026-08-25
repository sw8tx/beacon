import { createCookie, createOauthState, getConfig, randomState } from "./_shared.js";

const CANONICAL_HOST = "beacon-bot.site";

export async function onRequestGet({ request, env }) {
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
  authorizationUrl.searchParams.set("scope", "identify guilds.join");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("prompt", "consent");

  const response = new Response(null, {
    status: 302,
    headers: {
      Location: authorizationUrl.toString(),
      "Set-Cookie": createCookie("discord_oauth_state", state, { maxAge: 600, path: "/" }),
    },
  });
  response.headers.append("Set-Cookie", createCookie("beacon_login_next", safeNext, { maxAge: 600, path: "/" }));
  return response;
}
