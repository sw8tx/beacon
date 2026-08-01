export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === "www.beacon-bot.site") {
    url.hostname = "beacon-bot.site";
    return Response.redirect(url.toString(), 301);
  }
  if (url.hostname === "status.beacon-bot.site" && (url.pathname === "/" || url.pathname === "/index.html")) {
    url.pathname = "/status/";
    return fetch(new Request(url, context.request));
  }
  if (url.hostname === "prestige.beacon-bot.site" && (url.pathname === "/" || url.pathname === "/index.html")) {
    url.pathname = "/prestige/";
    return context.next(new Request(url, context.request));
  }
  return context.next();
}
