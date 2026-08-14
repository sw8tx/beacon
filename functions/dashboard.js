import { getConfig, getCookie, readSession } from "./api/auth/discord/_shared.js";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

export async function onRequestGet({ request, env }) {
  const { sessionSecret } = getConfig(env);
  const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
  if (!session?.user) {
    return Response.redirect(new URL("/?login_required=1", request.url).toString(), 302);
  }

  const username = escapeHtml(session.user.username || "Discord user");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <title>Beacon Dashboard</title>
    <link rel="icon" type="image/png" href="/assets/beacon-logo.png?v=92" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@700;800;900&display=swap" rel="stylesheet" />
    <style>
      *{box-sizing:border-box}html,body{min-height:100%;margin:0;background:#000;color:#f6f3ea;font-family:"DM Sans",system-ui,sans-serif}body{display:flex;flex-direction:column}.dash-nav{display:flex;min-height:72px;align-items:center;border-bottom:1px solid rgba(255,195,28,.24);padding:0 clamp(18px,5vw,70px);background:#000}.dash-brand{display:inline-flex;align-items:center;gap:12px;color:#fff9e7;text-decoration:none;font-size:1.08rem;font-weight:900}.dash-brand img{width:34px;height:34px;object-fit:contain}.dash-main{display:grid;flex:1;place-items:center;padding:32px}.dash-name{color:#fff;font-size:clamp(2.3rem,6vw,5rem);font-weight:900;letter-spacing:0;text-align:center}.dash-name span{color:#ffc31c;text-shadow:0 0 34px rgba(255,195,28,.34)}
    </style>
  </head>
  <body>
    <header class="dash-nav">
      <a class="dash-brand" href="/">
        <img src="/assets/beacon-logo.png?v=92" width="34" height="34" alt="" />
        <strong>Beacon</strong>
      </a>
    </header>
    <main class="dash-main">
      <h1 class="dash-name">Welcome, <span>${username}</span></h1>
    </main>
  </body>
</html>`;
  return new Response(html, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}
