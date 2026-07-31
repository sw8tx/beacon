export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === "status.beacon-bot.site" && (url.pathname === "/" || url.pathname === "/index.html")) {
    url.pathname = "/status/";
    return context.next(new Request(url, context.request));
  }
  return context.next();
}
