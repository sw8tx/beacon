import { BEACON_BADGES } from "../badges/badge-data.js";
import { iconForBadge } from "../badges/badge-icons.js";
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

async function getUnlockedBadgeIds(env, userId) {
  const defaults = new Set(["beacon-member"]);
  if (!env.STATUS_DB || !userId) return defaults;

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
  `).bind(userId, "beacon-member").run();

  const rows = await env.STATUS_DB.prepare(`
    SELECT badge_id FROM badge_unlocks WHERE user_id = ?
  `).bind(userId).all();

  return new Set((rows.results || []).map((row) => row.badge_id));
}

function renderBadgeCard(badge, unlocked) {
  const stateClass = unlocked ? " is-unlocked" : " is-locked";
  const stateLabel = unlocked ? "Unlocked" : "Locked";
  return `
    <article class="dash-badge dash-badge--${escapeHtml(badge.tone)}${stateClass}">
      <div class="dash-badge-icon" aria-hidden="true">${iconForBadge(badge.id)}</div>
      <div class="dash-badge-copy">
        <div class="dash-badge-top">
          <h3>${escapeHtml(badge.name)}</h3>
          <span>${escapeHtml(badge.tag)}</span>
        </div>
        <p>${escapeHtml(badge.summary)}</p>
        <small>${escapeHtml(badge.hint)}</small>
      </div>
      <strong class="dash-badge-state">${stateLabel}</strong>
    </article>
  `;
}

export async function onRequestGet({ request, env }) {
  const { sessionSecret } = getConfig(env);
  const session = await readSession(getCookie(request, "beacon_session"), sessionSecret);
  if (!session?.user) {
    return Response.redirect(new URL("/?login_required=1", request.url).toString(), 302);
  }

  const username = escapeHtml(session.user.username || "Discord user");
  const avatar = session.user.avatar
    ? escapeHtml(session.user.avatar)
    : "/assets/beacon-logo.png?v=92";
  const serverName = `${username}'s server`;
  const unlockedIds = await getUnlockedBadgeIds(env, session.user.id);
  const unlockedBadges = BEACON_BADGES.filter((badge) => unlockedIds.has(badge.id));
  const lockedBadges = BEACON_BADGES.filter((badge) => !unlockedIds.has(badge.id));

  const navItems = [
    "Server Info",
    "Customize Bot",
    "Command Configs",
    "Server Configs",
    "Dashboard History",
    "Statistics",
    "Badges",
  ];
  const navHtml = navItems.map((label, index) => {
    const id = label.toLowerCase().replace(/\s+/g, "-");
    const active = index === 0 ? " is-active" : "";
    return `<a class="dash-side-link${active}" href="#${id}" data-dashboard-tab="${id}"><span class="nav-mark"></span>${label}</a>`;
  }).join("");
  const simplePanels = [
    ["customize-bot", "Customize Bot", "Bot theme, messages and small server defaults will live here."],
    ["command-configs", "Command Configs", "Enable, disable and tune Beacon commands for this server."],
    ["server-configs", "Server Configs", "General server settings, roles and moderation defaults will show here."],
    ["dashboard-history", "Dashboard History", "Recent dashboard changes and sync events will be listed here."],
    ["statistics", "Statistics", "Server activity, member growth and Beacon usage stats will show here."],
  ].map(([id, title, copy]) => `
        <section class="dash-content-section" id="${id}" data-dashboard-section="${id}">
          <div class="dash-panel">
            <h2>${title}</h2>
            <p>${copy}</p>
          </div>
        </section>
  `).join("");

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
      *{box-sizing:border-box}
      html,body{min-height:100%;margin:0;background:#000;color:#f6f3ea;font-family:"DM Sans",system-ui,sans-serif}
      body{min-height:100vh;background:radial-gradient(circle at 54% 10%,rgba(255,195,28,.1),transparent 26rem),#000}
      .dash-topbar{position:sticky;top:0;z-index:30;display:flex;min-height:74px;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,195,28,.26);padding:0 clamp(18px,5vw,70px);background:rgba(0,0,0,.88);backdrop-filter:blur(14px)}
      .dash-brand{display:inline-flex;align-items:center;gap:12px;color:#fff9e7;text-decoration:none;font-size:1.08rem;font-weight:900}
      .dash-brand img{width:34px;height:34px;object-fit:contain}
      .dash-back,.sync-button,.server-sync,.manage-button,.dash-side-link{position:relative;overflow:hidden}
      .dash-back{display:inline-flex;min-height:42px;align-items:center;justify-content:center;border:1px solid rgba(255,195,28,.55);border-radius:7px;background:#ffc31c;color:#090700;padding:0 18px;text-decoration:none;font-weight:900;box-shadow:0 0 28px rgba(255,195,28,.18)}
      .dash-back::before,.sync-button::before,.server-sync::before,.manage-button::before,.dash-side-link::before{content:"";position:absolute;inset:-35% auto -35% -80%;width:45%;transform:skewX(-18deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.42),transparent);transition:left .55s ease}
      .dash-back:hover::before,.sync-button:hover::before,.server-sync:hover::before,.manage-button:hover::before,.dash-side-link:hover::before{left:135%}
      .dash-layout{display:grid;grid-template-columns:minmax(260px,318px) minmax(0,1fr);gap:clamp(26px,4vw,70px);padding:28px clamp(18px,5vw,70px) 70px}
      .dash-sidebar{position:sticky;top:98px;align-self:start;max-height:calc(100vh - 116px);overflow:auto;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:linear-gradient(180deg,rgba(17,18,24,.96),rgba(10,11,15,.96));padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.34)}
      .server-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
      .server-title{color:#fff;font-size:.86rem;font-weight:900}
      .sync-button,.server-sync{border:1px solid rgba(255,195,28,.52);border-radius:7px;background:linear-gradient(135deg,#ffb000,#ffc31c);color:#0c0900;font:inherit;font-size:.78rem;font-weight:900;cursor:pointer}
      .sync-button{min-height:34px;padding:0 12px}
      .server-sync{min-width:62px;min-height:32px}
      .server-card{display:grid;grid-template-columns:48px 1fr auto;gap:12px;align-items:center;border:1px solid rgba(255,195,28,.2);border-radius:9px;background:rgba(255,255,255,.045);padding:12px}
      .server-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,195,28,.55);background:#171820}
      .server-name{display:block;color:#fff;font-size:.95rem;font-weight:900;line-height:1.15}
      .server-members{display:block;margin-top:4px;color:#a8adba;font-size:.78rem;font-weight:700}
      .manage-button{width:100%;min-height:36px;margin-top:10px;border:0;border-radius:7px;background:#ffb000;color:#080600;font:inherit;font-size:.82rem;font-weight:900;cursor:pointer}
      .server-muted{margin:14px 0 18px;border-top:1px solid rgba(255,255,255,.1);padding-top:12px;color:#7f8796;font-size:.76rem;font-weight:800;line-height:1.45}
      .dash-side-nav{display:grid;gap:8px;border-top:1px solid rgba(255,255,255,.1);padding-top:14px}
      .dash-side-link{display:flex;min-height:46px;align-items:center;gap:11px;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:#151924;color:#c7ccd8;text-decoration:none;padding:0 13px;font-size:.9rem;font-weight:800}
      .dash-side-link:hover,.dash-side-link.is-active{border-color:rgba(255,195,28,.42);background:#20283a;color:#fff}
      .nav-mark{width:10px;height:10px;border-radius:3px;border:1px solid rgba(255,195,28,.8);box-shadow:0 0 16px rgba(255,195,28,.18)}
      .dash-main{min-height:calc(100vh - 150px);padding-top:72px}
      .dash-name{margin:0;color:#fff;font-size:clamp(2.4rem,5.5vw,5.15rem);font-weight:900;letter-spacing:0;text-align:center}
      .dash-name span{color:#ffc31c;text-shadow:0 0 34px rgba(255,195,28,.34)}
      .dash-panel{max-width:1020px;margin:42px auto 0;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.025);padding:24px}
      .dash-content-section{display:none}
      .dash-content-section.is-active{display:block}
      .dash-panel h2{margin:0 0 8px;color:#fff;font-size:1.25rem}
      .dash-panel p{margin:0;color:#9ea6b5;font-size:.98rem;line-height:1.6}
      .dash-section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:18px}
      .dash-section-head strong{color:#ffc31c;font-size:.78rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
      .dash-badge-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .dash-badge{position:relative;display:grid;grid-template-columns:56px 1fr auto;gap:14px;align-items:center;overflow:hidden;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:rgba(18,20,26,.78);padding:16px}
      .dash-badge::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 20%,rgba(255,255,255,.06),transparent 62%);opacity:0;transform:translateX(-100%)}
      .dash-badge:hover::after{animation:dash-sheen 1.05s ease;opacity:1}
      .dash-badge-icon{display:grid;width:58px;height:58px;place-items:center;border:1px solid rgba(255,195,28,.24);border-radius:14px;background:rgba(255,255,255,.04);color:#ffc31c;filter:drop-shadow(0 0 14px rgba(255,195,28,.18))}
      .dash-badge-icon svg{display:block;width:46px;height:46px}
      .dash-badge-top{display:flex;align-items:center;gap:10px;margin-bottom:4px}
      .dash-badge-top h3{margin:0;color:#fff;font-size:1rem;line-height:1}
      .dash-badge-top span{border:1px solid rgba(255,195,28,.24);border-radius:999px;color:#ffc31c;padding:3px 8px;font-size:.62rem;font-weight:900;text-transform:uppercase}
      .dash-badge p{margin:0;color:#c1c6d2;font-size:.86rem;line-height:1.35}
      .dash-badge small{display:block;margin-top:5px;color:#878f9f;font-size:.74rem;line-height:1.35}
      .dash-badge-state{border-radius:999px;background:rgba(255,195,28,.12);color:#ffc31c;padding:6px 9px;font-size:.68rem;text-transform:uppercase}
      .is-locked{opacity:.72}
      .is-locked .dash-badge-icon{opacity:.8}
      .dash-badge--blue .dash-badge-icon,.dash-badge--blue .dash-badge-top span{color:#4ab8ff}
      .dash-badge--green .dash-badge-icon,.dash-badge--green .dash-badge-top span{color:#67e84d}
      .dash-badge--violet .dash-badge-icon,.dash-badge--violet .dash-badge-top span{color:#b261ff}
      .dash-badge--orange .dash-badge-icon,.dash-badge--orange .dash-badge-top span{color:#ff8a00}
      @keyframes dash-sheen{from{transform:translateX(-100%)}to{transform:translateX(120%)}}
      @media (max-width:1100px){.dash-badge-grid{grid-template-columns:1fr}}
      @media (max-width:900px){.dash-layout{grid-template-columns:1fr}.dash-sidebar{position:relative;top:auto;max-height:none}.dash-main{padding-top:18px}.dash-name{text-align:left}.dash-topbar{padding-inline:16px}.dash-back{min-height:38px;padding-inline:13px}}
      @media (max-width:620px){.dash-badge{grid-template-columns:48px 1fr}.dash-badge-state{grid-column:1/-1;width:max-content}.server-card{grid-template-columns:42px 1fr}.server-sync{grid-column:1/-1;width:100%}.server-avatar{width:42px;height:42px}.dash-side-link{min-height:44px}.dash-name{font-size:2.35rem}}
    </style>
  </head>
  <body>
    <header class="dash-topbar">
      <a class="dash-brand" href="/">
        <img src="/assets/beacon-logo.png?v=92" width="34" height="34" alt="" />
        <strong>Beacon</strong>
      </a>
      <a class="dash-back" href="/">Back to Beacon</a>
    </header>
    <div class="dash-layout">
      <aside class="dash-sidebar" aria-label="Dashboard navigation">
        <section class="server-picker" aria-label="Server picker">
          <div class="server-head">
            <span class="server-title">Servers with Beacon</span>
            <button class="sync-button" type="button">Sync Servers</button>
          </div>
          <div class="server-card">
            <img class="server-avatar" src="${avatar}" width="48" height="48" alt="" />
            <div>
              <span class="server-name">${serverName}</span>
              <span class="server-members">6 members</span>
            </div>
            <button class="server-sync" type="button">Sync</button>
          </div>
          <button class="manage-button" type="button">Manage Server</button>
          <div class="server-muted">
            Servers without Beacon appear here after syncing. Add Beacon first, then manage the server from this dashboard.
          </div>
        </section>
        <nav class="dash-side-nav" aria-label="Dashboard sections">
          ${navHtml}
        </nav>
      </aside>
      <main class="dash-main">
        <h1 class="dash-name">Welcome, <span>${username}</span></h1>
        <section class="dash-content-section is-active" id="server-info" data-dashboard-section="server-info">
          <div class="dash-panel">
            <h2>Select a server to start</h2>
            <p>Sync your Discord servers, pick the one Beacon is in, then use the left menu for server info, bot settings, command configs, statistics and badges.</p>
          </div>
        </section>
        ${simplePanels}
        <section class="dash-content-section" id="badges" data-dashboard-section="badges">
          <div class="dash-panel">
            <div class="dash-section-head">
              <div>
                <strong>Unlocked</strong>
                <h2>Your badges</h2>
              </div>
              <p>${unlockedBadges.length} / ${BEACON_BADGES.length} unlocked</p>
            </div>
            <div class="dash-badge-grid">
              ${unlockedBadges.map((badge) => renderBadgeCard(badge, true)).join("")}
            </div>
          </div>
          <div class="dash-panel">
            <div class="dash-section-head">
              <div>
                <strong>Locked</strong>
                <h2>Badges to unlock</h2>
              </div>
              <p>Some hints stay vague on purpose.</p>
            </div>
            <div class="dash-badge-grid">
              ${lockedBadges.map((badge) => renderBadgeCard(badge, false)).join("")}
            </div>
          </div>
        </section>
      </main>
    </div>
    <script>
      const tabs = [...document.querySelectorAll("[data-dashboard-tab]")];
      const sections = [...document.querySelectorAll("[data-dashboard-section]")];
      function activateDashboardTab(id) {
        const targetId = sections.some((section) => section.dataset.dashboardSection === id) ? id : "server-info";
        sections.forEach((section) => section.classList.toggle("is-active", section.dataset.dashboardSection === targetId));
        tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.dashboardTab === targetId));
        if (location.hash.slice(1) !== targetId) history.replaceState(null, "", "#" + targetId);
      }
      tabs.forEach((tab) => {
        tab.addEventListener("click", (event) => {
          event.preventDefault();
          activateDashboardTab(tab.dataset.dashboardTab);
        });
      });
      activateDashboardTab(location.hash.slice(1) || "server-info");
    </script>
  </body>
</html>`;
  return new Response(html, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}
