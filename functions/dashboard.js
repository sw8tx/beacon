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

async function getDashboardServers(env, discordAccessToken, request) {
  const { botToken } = getConfig(env);
  if (!discordAccessToken) return [];
  let beaconServerIds = new Set();
  let beaconServerNames = new Set();
  let statsAvailable = false;
  try {
    const statsResponse = await fetch(new URL("/api/discord-stats", request.url), { headers: { accept: "application/json" } });
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      if (Array.isArray(stats.servers)) {
        statsAvailable = stats.servers.length > 0;
        beaconServerIds = new Set(stats.servers.map((server) => String(server.id || "")).filter(Boolean));
        beaconServerNames = new Set(stats.servers.map((server) => String(server.name || "").trim().toLowerCase()).filter(Boolean));
      }
    }
  } catch (_) {
    // Direct bot lookups below remain the fallback.
  }
  try {
    const response = await fetch("https://discord.com/api/v10/users/@me/guilds?with_counts=true", {
      headers: { authorization: `Bearer ${discordAccessToken}` },
    });
    if (!response.ok) return [];
    const userGuilds = await response.json();
    if (!Array.isArray(userGuilds)) return [];
    const servers = await Promise.all(userGuilds.map(async (guild) => {
      let withBeacon = beaconServerIds.has(String(guild.id)) || beaconServerNames.has(String(guild.name || "").trim().toLowerCase());
      if (!withBeacon && !statsAvailable && botToken) {
        try {
          const botGuildResponse = await fetch(`https://discord.com/api/v10/guilds/${guild.id}`, {
            headers: { authorization: `Bot ${botToken}` },
          });
          withBeacon = botGuildResponse.ok;
        } catch (_) {
          withBeacon = false;
        }
      }
      return {
        id: String(guild.id),
        name: guild.name || "Discord server",
        owner: guild.owner ? "Server owner" : "Member",
        isOwner: Boolean(guild.owner),
        members: Number(guild.approximate_member_count) || 0,
        iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256` : "",
        withBeacon,
      };
    }));
    return [...new Map(servers.map((server) => [server.id, server])).values()]
      .filter((server) => server.isOwner)
      .sort((left, right) => Number(right.withBeacon) - Number(left.withBeacon));
  } catch (_) {
    return [];
  }
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
  const png = `/assets/badges/${escapeHtml(badge.id)}.png`;
  return `
    <article class="dash-badge dash-badge--${escapeHtml(badge.tone)}${stateClass}">
      <div class="dash-badge-icon" aria-hidden="true">
        <img class="dash-badge-img" src="${png}" alt="" loading="lazy" decoding="async" />
        <span class="dash-badge-fallback">${iconForBadge(badge.id)}</span>
      </div>
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
  if (!session.discordAccessToken) {
    return Response.redirect(new URL("/api/auth/discord/login?next=/dashboard", request.url).toString(), 302);
  }

  const username = escapeHtml(session.user.username || "Discord user");
  const avatar = session.user.avatar
    ? escapeHtml(session.user.avatar)
    : "/assets/beacon-logo.png?v=92";
  const serverName = `${username}'s server`;
  const selectionServers = [
    { name: "//", owner: "Eigentümer", tone: "red", icon: "/assets/beacon-logo.png?v=92" },
    { name: "Beacon", owner: "Eigentümer", tone: "gold", icon: "/assets/beacon-logo.png?v=92" },
    { name: "smm2.org", owner: "Bot Master", tone: "green", icon: "/assets/beacon-logo.png?v=92" },
    { name: "Sparkle Stock Reborn", owner: "Eigentümer", tone: "gray", icon: "/assets/beacon-logo.png?v=92" },
    { name: "test", owner: "Eigentümer", tone: "dark", icon: "" },
  ];
  const liveSelectionServers = await getDashboardServers(env, session.discordAccessToken, request);
  const resolvedServerName = liveSelectionServers[0]?.name || serverName;
  const resolvedServerIcon = liveSelectionServers[0]?.iconUrl || "";
  const dashboardAvatar = resolvedServerIcon ? escapeHtml(resolvedServerIcon) : avatar;
  const dashboardSelectionServers = liveSelectionServers.map((server, index) => ({ ...server, tone: ["red", "gold", "green", "gray", "dark"][index % 5], icon: server.iconUrl }));
  const canManageResolvedServer = Boolean(liveSelectionServers[0]?.withBeacon && liveSelectionServers[0]?.isOwner);
  const fallbackIcons = {
    "//": "https://cdn.discordapp.com/icons/1535312431063105788/95d38da044caa8c815306b0687d83e86.png?size=256",
    Beacon: "https://cdn.discordapp.com/icons/1529195462735696053/e24f4b73cdbad190f13c92c976335985.png?size=256",
    "smm2.org": "https://cdn.discordapp.com/icons/1496058157955289239/108980db943d4a74d8daae1987178d62.png?size=256",
    "Sparkle Stock Reborn": "https://cdn.discordapp.com/icons/1515797025885524049/34d14712cd2381ab950be9d397e77a16.png?size=256",
  };
  selectionServers.forEach((server) => {
    server.withBeacon = true;
    server.owner = server.name === "smm2.org" ? "Bot master" : "Server owner";
    server.icon = fallbackIcons[server.name] || server.icon;
  });
  const renderServerChoices = (servers, actionLabel) => servers.length
    ? servers.map((server) => `
              <article class="server-choice">
                <div class="server-choice-card server-choice-card--${escapeHtml(server.tone)}">
                  ${server.icon ? `<img src="${escapeHtml(server.icon)}" alt="" onerror="this.onerror=null;this.src='/assets/beacon-mark-gold.png?v=1'" />` : `<span class="server-choice-initial">${escapeHtml(String(server.name || "S").slice(0, 1).toUpperCase())}</span>`}
                </div>
                <div class="server-choice-copy">
                  <div><strong>${escapeHtml(server.name)}</strong><small>${escapeHtml(server.owner || "Server owner")}</small></div>
                  <button type="button" class="server-choice-button" data-can-manage="${server.withBeacon && server.isOwner ? "true" : "false"}" data-denial-reason="${server.withBeacon ? "owner" : "beacon"}">${actionLabel}</button>
                </div>
              </article>
            `).join("")
    : `<p class="server-choice-empty">No servers in this group yet.</p>`;
  const serversWithBeacon = dashboardSelectionServers.filter((server) => server.withBeacon && server.isOwner);
  const serversWithoutBeacon = dashboardSelectionServers.filter((server) => !server.withBeacon && server.isOwner);
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
  const botBio = "Beacon Community OS\nhttps://beacon-bot.site";
  const simplePanels = [
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
      html,body{min-height:100%;margin:0;background:#292b36;color:#f6f3ea;font-family:"DM Sans",system-ui,sans-serif}
      body{min-height:100vh;background-color:#292b36;background-image:radial-gradient(circle at 3% 18%,transparent 0 56px,rgba(255,255,255,.12) 57px 60px,transparent 61px),radial-gradient(circle at 96% 14%,transparent 0 34px,rgba(255,255,255,.1) 35px 38px,transparent 39px),radial-gradient(circle at 92% 84%,transparent 0 72px,rgba(255,255,255,.08) 73px 76px,transparent 77px),radial-gradient(circle at 10% 88%,rgba(255,255,255,.1) 0 3px,transparent 4px),radial-gradient(circle at 64% 48%,transparent 0 18px,rgba(255,255,255,.09) 19px 22px,transparent 23px)}
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
      .server-group{display:grid;gap:10px;margin-top:16px}
      .server-group-label{font-size:.78rem;font-weight:900}
      .server-group--with .server-group-label{color:#67e84d}
      .server-group--without .server-group-label{color:#858d9b}
      .server-group--without{border-top:1px solid rgba(255,255,255,.1);padding-top:14px}
      .server-group--without p{margin:0;color:#727b89;font-size:.74rem;font-weight:700;line-height:1.4}
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
      .dash-toast{position:fixed;top:88px;left:50%;z-index:80;display:flex;min-height:42px;align-items:center;justify-content:center;border:1px solid rgba(255,195,28,.42);border-radius:8px;background:rgba(12,13,15,.96);color:#ffc31c;padding:0 18px;font-size:.86rem;font-weight:900;box-shadow:0 20px 50px rgba(255,195,28,.16);opacity:0;pointer-events:none;transform:translate(-50%,-12px);transition:opacity .2s ease,transform .2s ease}
      .dash-toast.is-visible{opacity:1;transform:translate(-50%,0)}
      .dash-toast.is-error{border-color:rgba(255,77,77,.85);background:#3a1016;color:#fff;box-shadow:0 20px 60px rgba(255,35,55,.32)}
      body.is-access-denied::after{content:"";position:fixed;inset:0;z-index:70;pointer-events:none;background:rgba(255,30,45,.2);animation:access-denied-flash .65s ease-out forwards}
      @keyframes access-denied-flash{0%{opacity:0}22%{opacity:1}100%{opacity:0}}
      .server-info-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
      .sync-pill{display:inline-flex;min-height:30px;align-items:center;border:1px solid rgba(103,232,77,.28);border-radius:999px;background:rgba(103,232,77,.1);color:#67e84d;padding:0 12px;font-size:.72rem;font-weight:900;white-space:nowrap}
      .server-info-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:22px}
      .server-info-grid article{border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#101219;padding:16px}
      .server-info-grid span,.panel-mini-head span{display:block;color:#8790a1;font-size:.68rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
      .server-info-grid strong{display:block;margin-top:10px;color:#fff;font-size:1.65rem;line-height:1}
      .server-info-grid small{display:block;margin-top:8px;color:#7f8796;font-size:.75rem;font-weight:800}
      .server-activity-card{margin-top:14px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#101219;padding:18px}
      .panel-mini-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .panel-mini-head strong{color:#ffc31c;font-size:.78rem;text-transform:uppercase}
      .server-activity-card svg{display:block;width:100%;height:150px;margin-top:10px;overflow:visible}
      .server-activity-card polyline{fill:none;stroke:#31bdf5;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
      .server-activity-card circle{fill:#31bdf5;filter:drop-shadow(0 0 12px rgba(49,189,245,.5))}
      .customize-panel{max-width:1100px;background:#182332;border-color:rgba(255,255,255,.13)}
      .customize-panel h2{text-align:center;font-size:1.45rem;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:20px}
      .customize-media-grid{display:grid;grid-template-columns:minmax(240px,330px) minmax(0,1fr);gap:18px;margin-top:20px}
      .asset-editor{display:grid;gap:14px;border-radius:11px;background:#121b28;padding:18px}
      .asset-editor strong,.bio-field span{color:#fff;font-size:.95rem}
      .asset-editor small,.bio-field small{color:#c9d4e8;font-size:.72rem}
      .bot-avatar-preview{display:grid;place-items:center;min-height:138px}
      .bot-avatar-preview img{width:128px;height:128px;border:3px solid rgba(58,221,126,.66);border-radius:50%;object-fit:contain;background:#35c86c;padding:24px}
      .bot-banner-preview{position:relative;display:grid;min-height:320px;place-items:center;border:2px solid rgba(72,130,207,.7);border-radius:4px;background:#35c86c;overflow:hidden}
      .bot-banner-preview img{width:190px;height:190px;object-fit:contain;filter:brightness(0) invert(1)}
      .bot-banner-preview span{position:absolute;right:18px;bottom:16px;width:18px;height:18px;background:#caffd6;clip-path:polygon(50% 0,63% 37%,100% 50%,63% 63%,50% 100%,37% 63%,0 50%,37% 37%)}
      .asset-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .asset-actions button,.reset-bio,.save-bot,.reset-changes{min-width:0;min-height:38px;border:0;border-radius:7px;color:#fff;font:800 .84rem "DM Sans",system-ui,sans-serif;cursor:pointer;white-space:nowrap}
      .asset-actions button{background:#247fbd}
      .asset-actions .danger-mini,.reset-bio{background:#ff4f5e}
      .bio-field{display:grid;gap:10px;margin-top:24px}
      .bio-field textarea{min-height:170px;resize:vertical;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:#2b3a4d;color:#fff;padding:14px;font:700 1rem/1.45 "DM Sans",system-ui,sans-serif}
      .customize-actions{display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin-top:10px}
      .reset-bio{padding:0 15px}
      .save-bot{background:#3ca86a;padding:0 15px}
      .reset-changes{background:#247fbd;padding:0 15px}
      .dash-main.is-server-locked .dash-name,.dash-main.is-server-locked [data-dashboard-section]{display:none}
      .dash-main:not(.is-server-locked) .server-select-gate{display:none}
      .dash-layout:has(.dash-main.is-server-locked){display:block;padding:0 clamp(18px,5vw,70px) 70px}
      .dash-layout:has(.dash-main.is-server-locked) .dash-sidebar{display:none}
      .server-select-gate{max-width:1020px;margin:0 auto;padding:10px 0 40px;text-align:center}
      .server-select-gate h1{margin:0 0 54px;color:#fff;font-size:clamp(2rem,3vw,2.55rem);font-weight:900}
      .server-select-gate>h1:not(.server-select-title),.server-select-gate>.server-choice-grid{display:none}
      .server-choice-title{margin:0 0 22px;color:#fff;font-size:clamp(1.7rem,2.6vw,2.25rem);font-weight:900}
      .server-choice-group{margin-top:30px;text-align:left}
      .server-choice-group h2{margin:0 0 18px;color:#fff;font-size:1.08rem;font-weight:900;letter-spacing:.02em}
      .server-choice-group--without{margin-top:52px;padding-top:34px;border-top:1px solid rgba(255,255,255,.1)}
      .server-choice-empty{margin:0;color:#9ca4b5;font-size:.9rem;font-weight:700}
      .server-choice-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px 40px;text-align:left}
      .server-choice{min-width:0}
      .server-choice-card{display:grid;min-height:153px;place-items:center;border:0;border-radius:8px;background:var(--choice-bg,#20222b);overflow:hidden;box-shadow:inset 0 1px rgba(255,255,255,.04)}
      .server-choice-card--red{--choice-bg:linear-gradient(135deg,#6e2d38,#1b1c23 72%)}
      .server-choice-card--gold{--choice-bg:linear-gradient(135deg,#77766f,#282a31 75%)}
      .server-choice-card--green{--choice-bg:linear-gradient(135deg,#66676b,#25272b 75%)}
      .server-choice-card--gray{--choice-bg:linear-gradient(135deg,#44464e,#20222a 75%)}
      .server-choice-card--dark{--choice-bg:#20222b}
      .server-choice-card img,.server-choice-initial{display:grid;width:96px;height:96px;place-items:center;border:0;border-radius:20px;object-fit:contain;background:transparent;color:#ffc31c;font-size:1.5rem;font-weight:900;filter:drop-shadow(0 8px 18px rgba(0,0,0,.28))}
      .server-choice-copy{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:14px}
      .server-choice-copy strong{display:block;color:#fff;font-size:.92rem;line-height:1.4}
      .server-choice-copy small{display:block;margin-top:3px;color:#9ca4b5;font-size:.78rem}
      .server-choice-copy button{min-width:118px;min-height:48px;border:0;border-radius:8px;background:#3a3d49;color:#fff;font:800 .84rem "DM Sans",system-ui,sans-serif;cursor:pointer}
      .server-choice-copy button:hover{background:#4a4e5b}
      @media (max-width:900px){.server-choice-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 20px}}
      @media (max-width:620px){.server-choice-grid{grid-template-columns:1fr}.server-select-gate h1{margin-bottom:32px}}
      .dash-section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:18px}
      .dash-section-head strong{color:#ffc31c;font-size:.78rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
      .dash-badge-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .dash-badge{position:relative;display:grid;grid-template-columns:56px 1fr auto;gap:14px;align-items:center;overflow:hidden;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:rgba(18,20,26,.78);padding:16px}
      .dash-badge::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 20%,rgba(255,255,255,.06),transparent 62%);opacity:0;transform:translateX(-100%)}
      .dash-badge:hover::after{animation:dash-sheen 1.05s ease;opacity:1}
      .dash-badge-icon{display:grid;width:58px;height:58px;place-items:center;border:1px solid rgba(255,195,28,.24);border-radius:14px;background:rgba(255,255,255,.04);color:#ffc31c;filter:drop-shadow(0 0 14px rgba(255,195,28,.18))}
      .dash-badge-icon svg{display:block;width:46px;height:46px}
      .dash-badge-img{display:block;width:54px;height:54px;object-fit:contain}
      .dash-badge-fallback{display:block}
      .dash-badge-icon.has-png .dash-badge-fallback{display:none}
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
      @media (max-width:1100px){.dash-badge-grid{grid-template-columns:1fr}.server-info-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.customize-media-grid{grid-template-columns:1fr}.bot-banner-preview{min-height:260px}}
      @media (max-width:900px){.dash-layout{grid-template-columns:1fr}.dash-sidebar{position:relative;top:auto;max-height:none}.dash-main{padding-top:18px}.dash-name{text-align:left}.dash-topbar{padding-inline:16px}.dash-back{min-height:38px;padding-inline:13px}}
      @media (max-width:620px){.dash-badge{grid-template-columns:48px 1fr}.dash-badge-state{grid-column:1/-1;width:max-content}.server-card{grid-template-columns:42px 1fr}.server-sync{grid-column:1/-1;width:100%}.server-avatar{width:42px;height:42px}.dash-side-link{min-height:44px}.dash-name{font-size:2.35rem}.server-info-head{display:block}.sync-pill{margin-top:14px}.server-info-grid{grid-template-columns:1fr}.customize-panel{padding:18px}.bot-banner-preview{min-height:210px}.bot-banner-preview img{width:140px;height:140px}.customize-actions span{width:100%;margin-left:0}}
    </style>
  </head>
  <body>
    <div class="dash-toast" id="dash-toast" role="status" aria-live="polite"></div>
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
            <span class="server-title">Choose a server</span>
            <button class="sync-button" type="button">Sync Servers</button>
          </div>
          <div class="server-group server-group--with">
            <span class="server-group-label">Servers with Beacon</span>
            <div class="server-card">
              <img class="server-avatar" src="${dashboardAvatar}" width="48" height="48" alt="" />
              <div>
                <span class="server-name">${resolvedServerName}</span>
                <span class="server-members">6 members</span>
              </div>
              <button class="server-sync" type="button" data-can-manage="${canManageResolvedServer ? "true" : "false"}" data-denial-reason="${liveSelectionServers[0]?.withBeacon ? "owner" : "beacon"}">Manage</button>
            </div>
            <button class="manage-button" type="button" data-can-manage="${canManageResolvedServer ? "true" : "false"}" data-denial-reason="${liveSelectionServers[0]?.withBeacon ? "owner" : "beacon"}">Manage Server</button>
          </div>
          <div class="server-group server-group--without">
            <span class="server-group-label">Servers without Beacon</span>
            <p>Servers you manage without Beacon will appear here after syncing.</p>
          </div>
        </section>
        <nav class="dash-side-nav" aria-label="Dashboard sections">
          ${navHtml}
        </nav>
      </aside>
      <main class="dash-main is-server-locked">
        <div class="server-select-gate">
          <h1 class="server-select-title">Choose a server</h1>
          <section class="server-choice-group server-choice-group--with">
            <h2>Servers with Beacon</h2>
            <div class="server-choice-grid">${renderServerChoices(serversWithBeacon, "Manage")}</div>
          </section>
          <section class="server-choice-group server-choice-group--without">
            <h2>Servers without Beacon</h2>
            <div class="server-choice-grid">${renderServerChoices(serversWithoutBeacon, "Manage")}</div>
          </section>
          <h1>Server auswählen</h1>
          <div class="server-choice-grid">
            ${dashboardSelectionServers.map((server) => `
              <article class="server-choice">
                <div class="server-choice-card server-choice-card--${server.tone}">
                  ${server.icon ? `<img src="${server.icon}" alt="" />` : `<span class="server-choice-initial">t</span>`}
                </div>
                <div class="server-choice-copy">
                  <div><strong>${escapeHtml(server.name)}</strong><small>${escapeHtml(server.owner)}</small></div>
                  <button type="button" class="server-choice-button">Manage</button>
                </div>
              </article>
            `).join("")}
          </div>
        </div>
        <h1 class="dash-name">Welcome, <span>${username}</span></h1>
        <section class="dash-content-section is-active" id="server-info" data-dashboard-section="server-info">
          <div class="dash-panel">
            <div class="server-info-head">
              <div>
                <h2>${resolvedServerName}</h2>
                <p>Live server overview synced from Beacon. Pick the server on the left, then manage stats, commands and badges from here.</p>
              </div>
              <span class="sync-pill" data-sync-pill>Synced just now</span>
            </div>
            <div class="server-info-grid">
              <article><span>Members</span><strong>6</strong><small>Current server size</small></article>
              <article><span>Commands</span><strong>40</strong><small>Available tools</small></article>
              <article><span>Ping</span><strong>188 ms</strong><small>Gateway health</small></article>
              <article><span>Badges</span><strong>${unlockedBadges.length}/20</strong><small>Unlocked profile badges</small></article>
            </div>
            <div class="server-activity-card">
              <div class="panel-mini-head"><span>Member activity</span><strong>7 days</strong></div>
              <svg viewBox="0 0 520 150" aria-label="Server activity graph">
                <polyline points="20,112 66,98 112,104 158,74 204,88 250,54 296,68 342,45 388,58 434,34 500,26" />
                <circle cx="500" cy="26" r="6" />
              </svg>
            </div>
          </div>
        </section>
        <section class="dash-content-section" id="customize-bot" data-dashboard-section="customize-bot">
          <div class="dash-panel customize-panel">
            <h2>Customize Bot</h2>
            <div class="customize-media-grid">
              <article class="asset-editor asset-editor--avatar">
                <strong>Avatar <small>(1024x1024)</small></strong>
                <div class="bot-avatar-preview"><img src="/assets/beacon-logo.png?v=92" alt="" /></div>
                <div class="asset-actions"><button type="button" data-upload-target="avatar-upload">Upload image</button><button class="danger-mini" type="button" data-reset-image="avatar">Delete</button></div>
                <input id="avatar-upload" class="asset-upload" type="file" accept="image/*" hidden />
              </article>
              <article class="asset-editor asset-editor--banner">
                <strong>Banner <small>(680x240)</small></strong>
                <div class="bot-banner-preview"><img src="/assets/beacon-logo.png?v=92" alt="" /><span></span></div>
                <div class="asset-actions"><button type="button" data-upload-target="banner-upload">Upload image</button><button class="danger-mini" type="button" data-reset-image="banner">Delete</button></div>
                <input id="banner-upload" class="asset-upload" type="file" accept="image/*" hidden />
              </article>
            </div>
            <label class="bio-field">
              <span>Bio <small>(190 character limit)</small></span>
              <textarea maxlength="190">${escapeHtml(botBio)}</textarea>
            </label>
            <div class="customize-actions">
              <button class="reset-bio" type="button">Reset Bio</button>
              <button class="save-bot" type="button">Save Bot Changes</button>
              <button class="reset-changes" type="button">Reset Changes</button>
            </div>
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
      let serverSelected = false;
      const dashMain = document.querySelector(".dash-main");
      function activateDashboardTab(id) {
        if (!serverSelected) {
          showDashboardToast("Select a server first");
          return;
        }
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
      const toast = document.querySelector("#dash-toast");
      let toastTimer = null;
      function showDashboardToast(message, type = "default") {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.toggle("is-error", type === "error");
        toast.classList.add("is-visible");
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => toast.classList.remove("is-visible", "is-error"), 2600);
      }
      function denyServerAccess(reason = "owner") {
        document.body.classList.remove("is-access-denied");
        void document.body.offsetWidth;
        document.body.classList.add("is-access-denied");
        window.setTimeout(() => document.body.classList.remove("is-access-denied"), 700);
        showDashboardToast(reason === "beacon" ? "Need to add Beacon to this server first." : "You cannot manage this server because you are not the owner.", "error");
      }
      if (serverSelected) activateDashboardTab(location.hash.slice(1) || "server-info");
      const customizeStorageKey = "beacon-customize-preview";
      const bioInput = document.querySelector(".bio-field textarea");
      const avatarPreview = document.querySelector(".asset-editor--avatar img");
      const bannerPreview = document.querySelector(".asset-editor--banner img");
      const saveButton = document.querySelector(".save-bot");
      const resetButton = document.querySelector(".reset-bio");
      const resetChangesButton = document.querySelector(".reset-changes");
      const defaultBio = bioInput?.value || "";
      const defaultImage = "/assets/beacon-logo.png?v=92";
      try {
        const saved = JSON.parse(localStorage.getItem(customizeStorageKey) || "null");
        if (saved?.bio && bioInput) bioInput.value = saved.bio;
        if (saved?.avatar && avatarPreview) avatarPreview.src = saved.avatar;
        if (saved?.banner && bannerPreview) bannerPreview.src = saved.banner;
      } catch (_) {}
      saveButton?.addEventListener("click", () => {
        const payload = { bio: bioInput?.value || "", avatar: avatarPreview?.src || defaultImage, banner: bannerPreview?.src || defaultImage };
        try { localStorage.setItem(customizeStorageKey, JSON.stringify(payload)); } catch (_) {}
        saveButton.textContent = "Saved ✓";
        showDashboardToast("Bot changes saved");
        window.setTimeout(() => { saveButton.textContent = "Save Bot Changes"; }, 1800);
      });
      resetButton?.addEventListener("click", () => {
        if (bioInput) bioInput.value = defaultBio;
        showDashboardToast("Bio reset");
      });
      resetChangesButton?.addEventListener("click", () => {
        try { localStorage.removeItem(customizeStorageKey); } catch (_) {}
        if (bioInput) bioInput.value = defaultBio;
        if (avatarPreview) avatarPreview.src = defaultImage;
        if (bannerPreview) bannerPreview.src = defaultImage;
        showDashboardToast("All changes reset");
      });
      document.querySelectorAll("[data-upload-target]").forEach((button) => {
        button.addEventListener("click", () => document.getElementById(button.dataset.uploadTarget)?.click());
      });
      document.querySelectorAll(".asset-upload").forEach((input) => {
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (!file || !file.type.startsWith("image/")) return;
          const preview = input.closest(".asset-editor")?.querySelector("img");
          if (!preview) return;
          const reader = new FileReader();
          reader.addEventListener("load", () => { preview.src = reader.result; showDashboardToast("Image preview updated"); });
          reader.readAsDataURL(file);
        });
      });
      document.querySelectorAll("[data-reset-image]").forEach((button) => {
        button.addEventListener("click", () => {
          const preview = button.closest(".asset-editor")?.querySelector("img");
          if (preview) preview.src = defaultImage;
          showDashboardToast("Image removed");
        });
      });
      document.querySelectorAll(".sync-button").forEach((button) => {
        button.addEventListener("click", () => {
          const pill = document.querySelector("[data-sync-pill]");
          if (pill) pill.textContent = "Synced just now";
          showDashboardToast("Servers synced");
        });
      });
      document.querySelectorAll(".server-sync,.manage-button").forEach((button) => {
        button.addEventListener("click", () => {
          if (button.dataset.canManage !== "true") return denyServerAccess(button.dataset.denialReason);
          serverSelected = true;
          dashMain?.classList.remove("is-server-locked");
          activateDashboardTab("server-info");
        });
      });
      document.querySelectorAll(".server-choice-button").forEach((button) => {
        button.addEventListener("click", () => {
          if (button.dataset.canManage !== "true") return denyServerAccess(button.dataset.denialReason);
          serverSelected = true;
          dashMain?.classList.remove("is-server-locked");
          activateDashboardTab("server-info");
        });
      });
      document.querySelectorAll(".dash-badge-img").forEach((image) => {
        image.addEventListener("load", () => image.closest(".dash-badge-icon")?.classList.add("has-png"));
        image.addEventListener("error", () => image.remove());
      });
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
