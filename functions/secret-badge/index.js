import { getConfig, getCookie, readSession } from "../api/auth/discord/_shared.js";

async function unlockSecretBadge(env, userId) {
  if (!env.STATUS_DB || !userId) return false;

  await env.STATUS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS badge_unlocks (
      user_id TEXT NOT NULL,
      badge_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, badge_id)
    )
  `).run();

  await env.STATUS_DB.prepare(`
    INSERT OR IGNORE INTO badge_unlocks (user_id, badge_id) VALUES (?, ?)
  `).bind(userId, "found-the-light").run();

  return true;
}

function renderPage({ signedIn }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <title>Secret Badge | Beacon</title>
    <link rel="icon" type="image/png" href="/assets/beacon-logo.png?v=92" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@600;700;800;900&display=swap" rel="stylesheet" />
    <style>
      *{box-sizing:border-box}
      html,body{min-height:100%;margin:0;background:#000;color:#f6f3ea;font-family:"DM Sans",system-ui,sans-serif}
      body{display:grid;place-items:center;padding:28px;background:radial-gradient(circle at 70% 12%,rgba(255,195,28,.12),transparent 28rem),#000}
      .secret-card{width:min(100%,560px);border:1px solid rgba(255,195,28,.22);border-radius:10px;background:linear-gradient(180deg,rgba(15,16,19,.96),rgba(8,9,11,.96));padding:28px;box-shadow:0 28px 90px rgba(0,0,0,.5)}
      .badge-preview{display:grid;grid-template-columns:86px 1fr auto;gap:22px;align-items:start}
      .badge-icon{display:grid;width:76px;height:76px;place-items:center;border:1px solid rgba(255,195,28,.38);border-radius:16px;background:rgba(255,195,28,.08)}
      .badge-icon img{width:72px;height:72px;object-fit:contain}
      h1{margin:0;color:#fff;font-size:2rem;line-height:1.02}
      .tag{display:inline-flex;min-height:25px;align-items:center;border:1px solid rgba(103,232,77,.36);border-radius:999px;color:#67e84d;background:rgba(103,232,77,.1);padding:0 10px;font-size:.72rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
      p{margin:10px 0 0;color:#c4c8d1;line-height:1.45}
      strong{display:block;margin-top:18px;color:#fff;font-size:.82rem;letter-spacing:.1em;text-transform:uppercase}
      form{margin-top:26px}
      button,.login{display:inline-flex;width:100%;min-height:48px;align-items:center;justify-content:center;border:0;border-radius:8px;background:#ffc31c;color:#070600;font:900 .95rem "DM Sans",system-ui,sans-serif;text-decoration:none;cursor:pointer;box-shadow:0 16px 40px rgba(255,195,28,.18);transition:transform .16s ease,filter .16s ease}
      button:hover,.login:hover{filter:brightness(1.05);transform:translateY(-2px)}
      .back{display:block;margin-top:16px;color:#8e96a6;text-align:center;text-decoration:none;font-size:.86rem;font-weight:800}
      @media(max-width:560px){.badge-preview{grid-template-columns:76px 1fr}.tag{grid-column:1/-1;width:max-content}.secret-card{padding:22px}h1{font-size:1.75rem}}
    </style>
  </head>
  <body>
    <main class="secret-card">
      <div class="badge-preview">
        <div class="badge-icon"><img src="/assets/badges/found-the-light.png" alt="" /></div>
        <div>
          <h1>Found the Light</h1>
          <p>Found a hidden interaction somewhere on Beacon.</p>
          <strong>Hint</strong>
          <p>Watch small details on Beacon pages. Some things answer only after you notice the pattern.</p>
        </div>
        <span class="tag">Easter Egg</span>
      </div>
      ${signedIn
        ? `<form method="post"><button type="submit">Claim Badge</button></form>`
        : `<a class="login" href="/api/auth/discord/login?next=/secret-badge">Login to claim badge</a>`}
      <a class="back" href="/">Back to Beacon</a>
    </main>
  </body>
</html>`;
}

export async function onRequestGet({ request, env }) {
  const { sessionSecret } = getConfig(env);
  const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
  return new Response(renderPage({ signedIn: Boolean(session?.user) }), {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}

export async function onRequestPost({ request, env }) {
  const { sessionSecret } = getConfig(env);
  const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
  if (!session?.user) {
    return Response.redirect(new URL("/?login_required=1", request.url).toString(), 302);
  }

  await unlockSecretBadge(env, session.user.id);
  return Response.redirect(new URL("/dashboard#badges", request.url).toString(), 303);
}
