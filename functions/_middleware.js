const PUBLIC_SCRIPTS = new Set([
  "/prestige.js", "/badges/badge-data.js", "/badges/badge-icons.js", "/assets/site-runtime.js",
  "/badges/badges.js", "/status/status-runtime-v2.js",
]);

function privatePath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname).toLowerCase(); } catch { return true; }
  if (decoded.includes("%") || decoded.includes("\\") || decoded.includes("\0")) return true;
  if (decoded.split("/").some((part) => part.startsWith("."))) return true;
  if (/^\/(?:functions|scripts|node_modules|deploy-current[^/]*)(?:\/|$)/.test(decoded)) return true;
  if (/\.(?:js|mjs|cjs|sjs)(?:\/|$)/.test(decoded)) return !PUBLIC_SCRIPTS.has(decoded);
  return /(?:^|\/)(?:env(?:\.[^/]*)?|procfile|package(?:-lock)?\.json|wrangler\.[^/]+|_worker[^/]*|_routes\.json|_headers|_redirects)(?:\/|$)/.test(decoded)
    || /\.(?:map|md|sql|toml|yaml|yml|zip|gz|bak|log|py|ps1|sh)(?:\/|$)/.test(decoded);
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (privatePath(url.pathname)) {
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" } });
  }
  const response = await route(context, url);
  const secured = new Response(response.body, response);
  secured.headers.set("X-Content-Type-Options", "nosniff");
  if (url.pathname.startsWith("/api/")) secured.headers.set("Cache-Control", "no-store");
  if (url.hostname === "beacon-bot.site" && (url.pathname === "/" || url.pathname === "/index.html")) {
    secured.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  }
  return secured;
}

async function route(context, url) {
  if (url.pathname === "/commands-page.css") {
    return new Response(
      ".commands-page .commands-shell{display:block;min-height:calc(100vh - 72px)}.commands-page .commands-doc{grid-column:auto;width:min(100%,1120px);margin:0 auto;padding:78px 64px 104px}.commands-page .commands-doc+.commands-doc{border-top:0}.commands-page .commands-sidebar{display:none}.commands-tabs{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 34px}.commands-tabs a{display:inline-flex;min-height:40px;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:0 15px;color:#c8ccd8;background:#0b0c10;font-size:.84rem;font-weight:800}.commands-tabs a:hover,.commands-tabs a.is-active{border-color:rgba(255,195,28,.42);color:#101010;background:#ffc31c}.commands-home-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:34px}.commands-home-card{display:block;min-height:180px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:#0d0e13;padding:26px;transition:border-color .16s ease,transform .16s ease}.commands-home-card:hover{border-color:rgba(255,195,28,.5);transform:translateY(-2px)}.commands-home-card strong{display:block;margin-bottom:12px;color:#fff;font-size:1.4rem}.commands-home-card p{margin:0;color:#a9adba;line-height:1.6}@media (max-width:900px){.commands-page .commands-doc{padding:42px 20px 70px}}@media (max-width:560px){.commands-home-grid{grid-template-columns:1fr}}",
      {
        headers: {
          "content-type": "text/css; charset=utf-8",
          "cache-control": "public, max-age=0, must-revalidate",
        },
      }
    );
  }
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
  if (url.hostname === "badges.beacon-bot.site" && (url.pathname === "/" || url.pathname === "/index.html")) {
    url.pathname = "/badges/";
    return context.next(new Request(url, context.request));
  }
  return context.next();
}
