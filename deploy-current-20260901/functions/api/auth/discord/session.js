import { getConfig, getCookie, readSession } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const { sessionSecret } = getConfig(env);
  const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
  if (!session) {
    return Response.json({ user: null, signedIn: false }, {
      status: 401,
      headers: { "cache-control": "no-store" },
    });
  }
  return Response.json({ user: session.user }, { headers: { "cache-control": "no-store" } });
}
