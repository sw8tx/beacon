export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === "status.beacon-bot.site" && (url.pathname === "/" || url.pathname === "/index.html")) {
    url.pathname = "/status/";
    return Response.redirect(url.toString(), 302);
  }
  return context.next();
}
