import { onRequest as discordStatsRequest } from "./discord-stats.js";
import { onRequest as publicStatsRequest } from "./public-stats.js";

export async function onRequest(context) {
  const pathname = new URL(context.request.url).pathname;
  if (pathname === "/api/discord-stats") return discordStatsRequest(context);
  if (pathname === "/api/public-stats") return publicStatsRequest(context);
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
