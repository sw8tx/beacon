const PUBLIC_SCRIPTS = new Set([
  "/prestige.js", "/badges/badge-data.js", "/badges/badge-icons.js", "/site-runtime.js",
  "/badges/runtime.js", "/status/status-runtime-v2.js",
]);
const BLOCKED_SOURCE_MESSAGE = "Whoa there, detective 🕵️‍♂️ Beacon keeps its secrets safe.";

const CUSTOM_404_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>404 | Beacon</title><link rel="stylesheet" href="/404.css?v=2"></head><body><header class="error-nav"><a class="error-brand" href="/"><img src="/assets/beacon-logo.png?v=92" width="34" height="34" alt=""><strong>Beacon</strong></a><nav><a href="/commands/">Commands</a><a href="/dashboard">Dashboard</a><a href="/status/">Status</a><a href="/prestige/">Prestige</a><a href="https://discord.com/oauth2/authorize?client_id=1529195963787251784&amp;scope=bot%20applications.commands">Invite</a></nav><a class="error-login" href="/api/auth/discord/login">Login with Discord</a></header><main class="error-main"><div class="error-glow"></div><p class="error-code">404</p><h1>Signal not found.</h1><p class="error-copy">The page you are looking for has moved, faded out, or never existed.</p><a class="error-home" href="/">Return to Beacon</a></main><footer class="error-footer"><div class="error-footer-brand"><a class="error-brand" href="/"><img src="/assets/beacon-logo.png?v=92" width="30" height="30" alt=""><strong>Beacon</strong></a><span>Built for communities with ambition.</span></div><div class="error-links"><div><b>Beacon</b><a href="/">Home</a><a href="/dashboard">Dashboard</a><a href="/prestige/">Prestige</a><a href="/status/">Status</a><a href="https://discord.com/oauth2/authorize?client_id=1529195963787251784&amp;scope=bot%20applications.commands">Invite</a></div><div><b>Legal</b><a href="/tos/">Terms</a><a href="/privacy/">Privacy</a><a href="/cookies/">Cookies</a><a href="/eula/">EULA</a><a href="/gdpr/">GDPR</a><a href="/copyright/">Copyright</a><a href="/imprint/">Imprint</a></div></div></footer></body></html>`;

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

function isDirectRuntimeRequest(request, url) {
  if (url.pathname !== "/site-runtime.js" && url.pathname !== "/badges/runtime.js") return false;
  const destination = request.headers.get("sec-fetch-dest");
  const referer = request.headers.get("referer");
  if (destination !== "script" || !referer) return true;
  try {
    return new URL(referer).hostname !== url.hostname;
  } catch {
    return true;
  }
}

function custom404Response() {
  const html = CUSTOM_404_HTML
    .replaceAll('href="/', 'href="https://beacon-bot.site/')
    .replaceAll('src="/', 'src="https://beacon-bot.site/');
  return new Response(html, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname === "/imprint") {
    return Response.redirect(new URL("/imprint/", url).toString(), 301);
  }
  if (privatePath(url.pathname) || isDirectRuntimeRequest(context.request, url)) {
    return new Response(BLOCKED_SOURCE_MESSAGE, { status: 404, headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" } });
  }
  if (url.hostname === "404.beacon-bot.site" && (url.pathname === "/" || url.pathname === "/index.html")) {
    return custom404Response();
  }
  const response = await route(context, url);
  const secured = new Response(response.body, response);
  secured.headers.set("X-Content-Type-Options", "nosniff");
  if (url.pathname.startsWith("/api/")) secured.headers.set("Cache-Control", "no-store");
  if (url.hostname === "beacon-bot.site" && (url.pathname === "/" || url.pathname === "/index.html")) {
    secured.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  }
  if (response.status === 404 && !url.pathname.endsWith("/404.html")) {
    if (url.hostname === "beacon-bot.site") {
      return Response.redirect("https://404.beacon-bot.site/", 302);
    }
    return custom404Response();
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
