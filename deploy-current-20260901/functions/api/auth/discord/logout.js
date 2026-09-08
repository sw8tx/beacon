import { createCookie } from "./_shared.js";

export async function onRequestPost() {
  const headers = new Headers();
  headers.append("Set-Cookie", createCookie("beacon_session", "", { maxAge: 0, domain: ".beacon-bot.site" }));
  headers.append("Set-Cookie", createCookie("beacon_session", "", { maxAge: 0 }));
  return new Response(null, { status: 204, headers });
}
