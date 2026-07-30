import { createCookie } from "./_shared.js";

export async function onRequestPost() {
  return new Response(null, { status: 204, headers: { "Set-Cookie": createCookie("beacon_session", "", { maxAge: 0 }) } });
}
