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
  let syncedServers = new Map();
  try {
    const statsResponse = await fetch(new URL("/api/discord-stats", request.url), { headers: { accept: "application/json" } });
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      if (Array.isArray(stats.servers)) {
        syncedServers = new Map(stats.servers.filter((server) => server?.id).map((server) => [String(server.id), server]));
        beaconServerIds = new Set(syncedServers.keys());
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
      let withBeacon = beaconServerIds.has(String(guild.id));
      let channels = [];
      if (botToken) {
        try {
          const botGuildResponse = await fetch(`https://discord.com/api/v10/guilds/${guild.id}`, {
            headers: { authorization: `Bot ${botToken}` },
          });
          if (botGuildResponse.ok || botGuildResponse.status === 404) withBeacon = botGuildResponse.ok;
          if (botGuildResponse.ok) {
            const channelsResponse = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/channels`, {
              headers: { authorization: `Bot ${botToken}` },
            });
            let channelData = channelsResponse.ok ? await channelsResponse.json() : null;
            if (!Array.isArray(channelData) && discordAccessToken) {
              const userChannelsResponse = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/channels`, {
                headers: { authorization: `Bearer ${discordAccessToken}` },
              });
              channelData = userChannelsResponse.ok ? await userChannelsResponse.json() : null;
            }
            channels = Array.isArray(channelData) ? channelData
              .filter((channel) => [0, 4].includes(channel?.type))
              .map((channel) => ({ id: String(channel.id), name: String(channel.name || "channel"), type: Number(channel.type) })) : [];
          }
        } catch (_) {
          // Keep the synced ID result if Discord is temporarily unavailable.
        }
      }
      return {
        id: String(guild.id),
        name: guild.name || "Discord server",
        owner: guild.owner ? "Server owner" : "Member",
        isOwner: Boolean(guild.owner),
        members: Number(guild.approximate_member_count) || 0,
        bots: Number(syncedServers.get(String(guild.id))?.bots) || 0,
        channels: Number(syncedServers.get(String(guild.id))?.channels) || 0,
        roles: Number(syncedServers.get(String(guild.id))?.roles) || 0,
        categories: Number(syncedServers.get(String(guild.id))?.categories) || 0,
        shardId: Number(syncedServers.get(String(guild.id))?.shardId) || 0,
        iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256` : "",
        channelOptions: channels,
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
  const { sessionSecret, clientId } = getConfig(env);
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
  const requestedServerParam = new URL(request.url).searchParams.get("server") || "";
  const requestedServerId = requestedServerParam.split("/")[0];
  const requestedSection = requestedServerParam.split("/")[1] || "";
  const requestedServer = liveSelectionServers.find((server) => server.id === requestedServerId && server.withBeacon && server.isOwner);
  const selectedServer = requestedServer || liveSelectionServers[0];
  const hasActiveServer = Boolean(selectedServer?.withBeacon && selectedServer?.isOwner);
  const resolvedServerName = selectedServer?.name || serverName;
  const resolvedServerIcon = selectedServer?.iconUrl || "";
  const dashboardAvatar = resolvedServerIcon ? escapeHtml(resolvedServerIcon) : avatar;
  const dashboardSelectionServers = liveSelectionServers.map((server, index) => ({ ...server, tone: ["red", "gold", "green", "gray", "dark"][index % 5], icon: server.iconUrl }));
  const hasRequestedServer = Boolean(requestedServer);
  const initialDashboardSection = ["server-info", "customize-bot", "command-configs", "server-configs", "dashboard-history", "statistics", "badges"].includes(requestedSection)
    ? requestedSection
    : "server-info";
  const canManageResolvedServer = Boolean(liveSelectionServers[0]?.withBeacon && liveSelectionServers[0]?.isOwner);
  const renderServerChoices = (servers, actionLabel) => servers.length
    ? servers.map((server) => `
              <article class="server-choice">
                <div class="server-choice-card server-choice-card--${escapeHtml(server.tone)}">
                  ${server.icon ? `<img src="${escapeHtml(server.icon)}" alt="" onerror="this.onerror=null;this.src='/assets/beacon-mark-gold.png?v=1'" />` : `<span class="server-choice-initial">${escapeHtml(String(server.name || "S").slice(0, 1).toUpperCase())}</span>`}
                </div>
                <div class="server-choice-copy">
                  <div><strong>${escapeHtml(server.name)}</strong><small>${server.withBeacon ? "Beacon is active" : "Server owner"}</small></div>
                  ${server.withBeacon
                    ? `<a class="server-choice-button" href="/dashboard?server=${encodeURIComponent(server.id || "")}#server-info" data-can-manage="true" data-server-id="${escapeHtml(server.id || "")}" data-server-name="${escapeHtml(server.name)}" data-server-members="${Number(server.members) || 0}" data-server-bots="${Number(server.bots) || 0}" data-server-channels="${Number(server.channels) || 0}" data-server-roles="${Number(server.roles) || 0}" data-server-categories="${Number(server.categories) || 0}" data-server-shard="${Number(server.shardId) || 0}">${actionLabel}</a>`
                    : `<a class="server-choice-button server-choice-button--invite" href="https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&amp;scope=bot%20applications.commands&amp;guild_id=${encodeURIComponent(server.id || "")}&amp;disable_guild_select=true">Add Beacon</a>`}
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
  const ticketChannelOptions = (selectedServer?.channelOptions || []).map((channel) =>
    `<option value="${escapeHtml(channel.id)}">${escapeHtml(channel.type === 4 ? "Category · " : "# ")}${escapeHtml(channel.name)}</option>`
  ).join("");
  const ticketPanelHtml = `
        <section class="dash-content-section" id="server-configs" data-dashboard-section="server-configs">
          <div class="dash-panel ticket-config-panel">
            <div class="ticket-config-top">
              <div>
                <span class="ticket-overline">Server Configs · Tickets</span>
                <h2>Ticket Panels</h2>
                <p>Create a clean panel that members can use to open a private ticket.</p>
              </div>
              <button class="ticket-add-panel" type="button" data-ticket-add aria-label="Create a new ticket panel">+</button>
            </div>
            <div class="ticket-panel-list" data-ticket-panel-list>
              <button class="ticket-panel-row is-selected" type="button" data-ticket-panel-row="default">
                <span><strong>1</strong> Ticket Panel</span><span class="ticket-panel-chevron">›</span>
              </button>
            </div>
            <div class="ticket-panel-editor" data-ticket-editor>
              <div class="ticket-editor-heading">
                <div>
                  <span class="ticket-overline">Panel Editor</span>
                  <h3 data-ticket-editor-title>Ticket Panel</h3>
                </div>
                <span class="ticket-draft-pill">Draft</span>
              </div>
              <label class="ticket-field">
                <span>Panel message</span>
                <textarea data-ticket-message maxlength="2000">Click the button below to open a private ticket with the Beacon support team.</textarea>
              </label>
              <div class="ticket-emoji-tools">
                <label class="ticket-field"><span>Custom emoji by ID</span><input data-ticket-emoji-id inputmode="numeric" placeholder="Emoji ID, e.g. 123456789012345678" /></label>
                <button class="ticket-emoji-add" type="button" data-ticket-emoji-add>Insert emoji</button>
              </div>
              <div class="ticket-settings-grid">
                <label class="ticket-field"><span>Panel layout</span><select data-ticket-layout><option value="buttons">Buttons</option><option value="dropdown">Dropdown menu</option></select></label>
                <label class="ticket-field"><span>Ticket buttons</span><select data-ticket-button-count><option value="1">1 button</option><option value="2">2 buttons</option><option value="3">3 buttons</option><option value="4">4 buttons</option><option value="5">5 buttons</option></select></label>
                <label class="ticket-field"><span>Ticket category</span><select data-ticket-channel="category"><option value="">Not set</option>${ticketChannelOptions}</select></label>
                <label class="ticket-field"><span>Log channel</span><select data-ticket-channel="log"><option value="">Not set</option>${ticketChannelOptions}</select></label>
                <label class="ticket-field"><span>Review channel</span><select data-ticket-channel="review"><option value="">Not set</option>${ticketChannelOptions}</select></label>
                <label class="ticket-field"><span>Archive category</span><select data-ticket-channel="archive"><option value="">Not set</option>${ticketChannelOptions}</select></label>
              </div>
              <div class="ticket-layout-config" data-ticket-config="dropdown" hidden>
                <div class="ticket-config-label">Dropdown options</div>
                <div class="ticket-option-grid">
                  <input data-ticket-option-label="1" placeholder="Option 1 label" />
                  <input data-ticket-option-description="1" placeholder="Option 1 description" />
                  <input data-ticket-option-label="2" placeholder="Option 2 label" />
                  <input data-ticket-option-description="2" placeholder="Option 2 description" />
                  <input data-ticket-option-label="3" placeholder="Option 3 label" />
                  <input data-ticket-option-description="3" placeholder="Option 3 description" />
                  <input data-ticket-option-label="4" placeholder="Option 4 label" />
                  <input data-ticket-option-description="4" placeholder="Option 4 description" />
                  <input data-ticket-option-label="5" placeholder="Option 5 label" />
                  <input data-ticket-option-description="5" placeholder="Option 5 description" />
                </div>
              </div>
              <div class="ticket-layout-config" data-ticket-config="buttons" hidden>
                <div class="ticket-config-label">Button labels and emoji IDs</div>
                <div class="ticket-option-grid ticket-button-grid">
                  <input data-ticket-button-label="1" placeholder="Button 1 label" />
                  <input data-ticket-button-emoji="1" placeholder="Button 1 emoji ID" />
                  <input data-ticket-button-label="2" placeholder="Button 2 label" />
                  <input data-ticket-button-emoji="2" placeholder="Button 2 emoji ID" />
                  <input data-ticket-button-label="3" placeholder="Button 3 label" />
                  <input data-ticket-button-emoji="3" placeholder="Button 3 emoji ID" />
                  <input data-ticket-button-label="4" placeholder="Button 4 label" />
                  <input data-ticket-button-emoji="4" placeholder="Button 4 emoji ID" />
                  <input data-ticket-button-label="5" placeholder="Button 5 label" />
                  <input data-ticket-button-emoji="5" placeholder="Button 5 emoji ID" />
                </div>
              </div>
              <div class="ticket-preview-label">Message Preview</div>
              <article class="ticket-discord-preview">
                <div class="ticket-preview-author">
                  <img src="/assets/beacon-logo.png?v=92" width="34" height="34" alt="" />
                  <strong>Beacon Bot</strong><span>BOT</span>
                </div>
                <div class="ticket-preview-card">
                  <h4 data-ticket-preview-title>Need help?</h4>
                  <p data-ticket-preview-message>Click the button below to open a private ticket with the Beacon support team.</p>
                  <button class="ticket-preview-button" type="button" disabled>Open Ticket</button>
                </div>
              </article>
              <button class="ticket-save-panel" type="button" data-ticket-save>Save Panel Draft</button>
            </div>
          </div>
          <div class="ticket-panel-modal" data-ticket-modal hidden>
            <div class="ticket-panel-modal__backdrop" data-ticket-modal-close></div>
            <section class="ticket-panel-modal__card" role="dialog" aria-modal="true" aria-labelledby="ticket-modal-title">
              <button class="ticket-panel-modal__close" type="button" data-ticket-modal-close aria-label="Close">×</button>
              <h3 id="ticket-modal-title">Create a Panel</h3>
              <p>A panel lets members open a private ticket. Give it a name to get started.</p>
              <label class="ticket-field"><span>Panel name</span><input data-ticket-name value="New Panel" maxlength="80" /></label>
              <div class="ticket-panel-modal__actions">
                <button class="ticket-modal-cancel" type="button" data-ticket-modal-close>Cancel</button>
                <button class="ticket-save-panel" type="button" data-ticket-create>Create</button>
              </div>
            </section>
          </div>
        </section>
  `;
  const simplePanels = [
    ["command-configs", "Command Configs", "Enable, disable and tune Beacon commands for this server."],
    ["dashboard-history", "Dashboard History", "Recent dashboard changes and sync events will be listed here."],
    ["statistics", "Statistics", "Server activity, member growth and Beacon usage stats will show here."],
  ].map(([id, title, copy]) => `
        <section class="dash-content-section" id="${id}" data-dashboard-section="${id}">
          <div class="dash-panel">
            <h2>${title}</h2>
            <p>${copy}</p>
          </div>
        </section>
  `).join("") + ticketPanelHtml;

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
      .server-card--compact{grid-template-columns:1fr;justify-items:center;padding:16px}
      .server-card--compact .server-avatar{width:76px;height:76px}
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
      .ticket-config-panel{max-width:1100px;background:#182332;border-color:rgba(255,255,255,.12)}
      .ticket-config-top,.ticket-editor-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
      .ticket-overline{display:block;color:#ffc31c;font-size:.72rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
      .ticket-config-top h2,.ticket-editor-heading h3{margin:8px 0;color:#fff}
      .ticket-add-panel{display:grid;width:42px;height:42px;place-items:center;border:0;border-radius:8px;background:#ffc31c;color:#0b0900;font-size:1.6rem;font-weight:900;cursor:pointer}
      .ticket-panel-list{display:grid;gap:8px;margin-top:22px}
      .ticket-panel-row{display:flex;min-height:46px;align-items:center;justify-content:space-between;border:1px solid rgba(255,195,28,.32);border-radius:7px;background:#26334a;color:#fff;padding:0 14px;font:800 .88rem "DM Sans",sans-serif;cursor:pointer}
      .ticket-panel-row.is-selected{border-color:#ffc31c;background:#303e57}
      .ticket-panel-row strong{display:inline-grid;width:24px;height:24px;margin-right:8px;place-items:center;border-radius:5px;background:#ffc31c;color:#0b0900}
      .ticket-panel-chevron{color:#ffc31c;font-size:1.3rem}
      .ticket-panel-editor{margin-top:18px;border-radius:8px;background:#121b28;padding:18px}
      .ticket-draft-pill{border:1px solid rgba(255,195,28,.4);border-radius:999px;color:#ffc31c;padding:5px 10px;font-size:.7rem;font-weight:900;text-transform:uppercase}
      .ticket-field{display:grid;gap:8px;margin-top:18px;color:#fff;font-size:.86rem;font-weight:900}
      .ticket-field textarea,.ticket-field input{width:100%;min-height:150px;resize:vertical;border:1px solid rgba(255,255,255,.15);border-radius:7px;background:#2b3a4d;color:#fff;padding:14px;font:700 .96rem/1.5 "DM Sans",sans-serif}
      .ticket-field input{min-height:44px;resize:none}
      .ticket-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px;margin-top:4px}
      .ticket-field select{width:100%;min-height:44px;border:1px solid rgba(255,255,255,.15);border-radius:7px;background:#2b3a4d;color:#fff;padding:0 12px;font:700 .84rem "DM Sans",sans-serif}
      .ticket-emoji-tools{display:flex;align-items:end;gap:10px}
      .ticket-emoji-tools .ticket-field{flex:1}
      .ticket-emoji-add{min-height:44px;border:0;border-radius:7px;background:#ffc31c;color:#0b0900;padding:0 14px;font:900 .82rem "DM Sans",sans-serif;cursor:pointer}
      .ticket-layout-config{margin-top:16px;border:1px solid rgba(255,195,28,.18);border-radius:7px;background:#101923;padding:14px}
      .ticket-layout-config[hidden]{display:none}
      .ticket-config-label{color:#ffc31c;font-size:.72rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
      .ticket-option-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
      .ticket-option-grid input{width:100%;min-height:40px;border:1px solid rgba(255,255,255,.15);border-radius:7px;background:#2b3a4d;color:#fff;padding:0 12px;font:700 .82rem "DM Sans",sans-serif}
      .ticket-preview-label{margin:24px 0 10px;color:#9ea6b5;font-size:.72rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
      .ticket-discord-preview{border-radius:7px;background:#36393f;padding:18px}
      .ticket-preview-author{display:flex;align-items:center;gap:8px;color:#fff;font-size:.82rem}
      .ticket-preview-author img{width:34px;height:34px;border-radius:50%;object-fit:contain;background:#111827;padding:4px}
      .ticket-preview-author span{border-radius:3px;background:#5865f2;padding:2px 4px;font-size:.6rem}
      .ticket-preview-card{max-width:560px;margin:12px 0 0 42px;border-left:4px solid #ffc31c;border-radius:4px;background:#202225;padding:16px}
      .ticket-preview-card h4{margin:0 0 8px;color:#fff;font-size:1rem}
      .ticket-preview-card p{color:#d7d9dc;font-size:.9rem;line-height:1.5}
      .ticket-preview-button,.ticket-save-panel,.ticket-modal-cancel{min-height:38px;border:0;border-radius:7px;padding:0 16px;font:900 .82rem "DM Sans",sans-serif;cursor:pointer}
      .ticket-preview-button{margin-top:14px;background:#ffc31c;color:#0b0900}
      .ticket-save-panel{margin-top:18px;background:#3ca86a;color:#fff}
      .ticket-panel-modal{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:20px}
      .ticket-panel-modal[hidden]{display:none}
      .ticket-panel-modal__backdrop{position:absolute;inset:0;background:rgba(0,0,0,.72)}
      .ticket-panel-modal__card{position:relative;width:min(520px,100%);border:1px solid rgba(255,195,28,.25);border-radius:10px;background:#182332;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.5)}
      .ticket-panel-modal__card h3{margin:0;color:#fff;font-size:1.3rem}
      .ticket-panel-modal__card>p{margin-top:8px}
      .ticket-panel-modal__close{position:absolute;top:12px;right:14px;border:0;background:transparent;color:#9ea6b5;font-size:1.4rem;cursor:pointer}
      .ticket-panel-modal__actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
      .ticket-modal-cancel{background:#303a4b;color:#fff}
      .dash-toast{position:fixed;top:88px;left:50%;z-index:80;display:flex;min-height:42px;align-items:center;justify-content:center;border:1px solid rgba(255,195,28,.42);border-radius:8px;background:rgba(12,13,15,.96);color:#ffc31c;padding:0 18px;font-size:.86rem;font-weight:900;box-shadow:0 20px 50px rgba(255,195,28,.16);opacity:0;pointer-events:none;transform:translate(-50%,-12px);transition:opacity .2s ease,transform .2s ease}
      .dash-toast.is-visible{opacity:1;transform:translate(-50%,0)}
      .dash-toast.is-error{border-color:rgba(255,77,77,.85);background:#3a1016;color:#fff;box-shadow:0 20px 60px rgba(255,35,55,.32)}
      body.is-access-denied::after{content:"";position:fixed;inset:0;z-index:70;pointer-events:none;background:rgba(255,30,45,.2);animation:access-denied-flash .65s ease-out forwards}
      @keyframes access-denied-flash{0%{opacity:0}22%{opacity:1}100%{opacity:0}}
      .server-info-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
      .sync-pill{display:inline-flex;min-height:30px;align-items:center;border:1px solid rgba(103,232,77,.28);border-radius:999px;background:rgba(103,232,77,.1);color:#67e84d;padding:0 12px;font-size:.72rem;font-weight:900;white-space:nowrap}
      .server-info-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:22px}
      .server-info-grid article{border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#101219;padding:16px}
      .server-info-panels{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:22px}
      .server-info-panel{min-height:180px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#182238;overflow:hidden}
      .server-info-panel h3{margin:0;padding:18px 24px;background:#3a465a;color:#fff;font-size:.92rem;font-weight:800}
      .server-info-lines{display:grid;gap:5px;padding:24px;color:#fff;font-size:.9rem;line-height:1.35}
      .server-info-lines strong{font-weight:900}
      .server-info-lines small{color:#fff;font-size:.82rem}
      .server-info-grid span,.panel-mini-head span{display:block;color:#8790a1;font-size:.68rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
      .server-info-grid strong{display:block;margin-top:10px;color:#fff;font-size:1.65rem;line-height:1}
      .server-info-grid small{display:block;margin-top:8px;color:#7f8796;font-size:.75rem;font-weight:800}
      .customize-panel{max-width:1100px;background:#182332;border-color:rgba(255,255,255,.13)}
      .customize-panel h2{text-align:center;font-size:1.45rem;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:20px}
      .customize-media-grid{display:grid;grid-template-columns:minmax(240px,330px) minmax(0,1fr);gap:18px;margin-top:20px}
      .asset-editor{display:grid;gap:14px;border-radius:11px;background:#121b28;padding:18px}
      .asset-editor strong,.bio-field span{color:#fff;font-size:.95rem}
      .asset-editor small,.bio-field small{color:#c9d4e8;font-size:.72rem}
      .bot-avatar-preview{display:grid;place-items:center;min-height:138px;overflow:hidden;border-radius:50%}
      .bot-avatar-preview img{width:128px;height:128px;border:3px solid rgba(58,221,126,.66);border-radius:50%;object-fit:contain;background:#35c86c;padding:24px}
      .bot-avatar-preview.has-custom-image img{width:100%;height:100%;object-fit:cover;background:transparent;padding:0}
      .bot-banner-preview{position:relative;display:grid;min-height:320px;place-items:center;border:2px solid rgba(72,130,207,.7);border-radius:4px;background:#35c86c;overflow:hidden}
      .bot-banner-preview img{width:190px;height:190px;object-fit:contain;filter:brightness(0) invert(1)}
      .bot-banner-preview.has-custom-image img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:none}
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
      .server-choice-copy .server-choice-button{display:inline-flex;min-width:132px;min-height:42px;align-items:center;justify-content:center;border:0;border-radius:7px;background:#303542;color:#fff;font:800 .8rem "DM Sans",system-ui,sans-serif;text-decoration:none;cursor:pointer}
      .server-choice-copy .server-choice-button:hover{background:#414858}
      .server-choice-copy .server-choice-button--invite{background:#ffc31c;color:#0b0900}
      .server-choice-copy .server-choice-button--invite:hover{background:#ffd45c}
      .server-choice{display:grid;grid-template-columns:84px minmax(0,1fr);gap:16px;align-items:center;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(13,15,21,.78);padding:14px;box-shadow:0 12px 30px rgba(0,0,0,.12)}
      .server-choice-card{min-height:76px;padding:0!important;background:linear-gradient(135deg,#282d3a,#171a22);border-radius:8px}
      .server-choice-card img,.server-choice-initial{width:58px;height:58px}
      .server-choice-copy{margin-top:0;min-width:0}
      .server-choice-copy strong{font-size:1rem}
      .server-choice-group h2{text-transform:uppercase;letter-spacing:.1em}
      .server-choice-group--with h2{color:#67e84d}
      .server-choice-group--without h2{color:#9aa2b2}
      @media (min-width:621px){.dash-topbar{justify-content:center}.dash-back{display:inline-flex;position:absolute;right:clamp(18px,5vw,70px)}.server-select-gate{max-width:700px}.server-choice-grid{grid-template-columns:1fr;gap:16px}.server-choice-card{min-height:76px;place-items:center;padding-left:0}.server-choice-card img,.server-choice-initial{width:72px;height:72px}.server-choice-copy{margin-top:0}}
      @media (max-width:900px){.server-choice-grid{grid-template-columns:1fr;gap:16px}}
      @media (max-width:620px){.dash-topbar{justify-content:center}.dash-back{display:inline-flex;position:absolute;right:12px;min-height:34px;padding-inline:10px;font-size:.72rem}.server-choice-grid{grid-template-columns:1fr}.server-select-gate h1{margin-bottom:32px}.server-choice{grid-template-columns:62px minmax(0,1fr);gap:12px;padding:10px}.server-choice-card{min-height:62px;place-items:center}.server-choice-card img,.server-choice-initial{width:48px;height:48px}.server-choice-copy{display:block}.server-choice-copy .server-choice-button{width:100%;margin-top:10px}}
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
      @media (max-width:1100px){.dash-badge-grid{grid-template-columns:1fr}.server-info-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.server-info-panels{grid-template-columns:1fr}.customize-media-grid{grid-template-columns:1fr}.bot-banner-preview{min-height:260px}}
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
          <div class="server-head"><span class="server-title">Current server</span></div>
          <div class="server-group server-group--with">
            <div class="server-card server-card--compact">
              <img class="server-avatar" src="${dashboardAvatar}" width="76" height="76" alt="${escapeHtml(resolvedServerName)}" onerror="this.onerror=null;this.src='/assets/beacon-mark-gold.png?v=1'" />
            </div>
            <button class="manage-button manage-other-button" type="button">Manage other Servers</button>
          </div>
        </section>
        <nav class="dash-side-nav" aria-label="Dashboard sections">
          ${navHtml}
        </nav>
      </aside>
      <main class="dash-main${hasActiveServer ? "" : " is-server-locked"}">
        <div class="server-select-gate">
          <h1 class="server-select-title">Your servers</h1>
          <section class="server-choice-group server-choice-group--with">
            <h2>✓ Beacon is on the server</h2>
            <div class="server-choice-grid">${renderServerChoices(serversWithBeacon, "Manage")}</div>
          </section>
          <section class="server-choice-group server-choice-group--without">
            <h2>+ Beacon is not on the server</h2>
            <div class="server-choice-grid">${renderServerChoices(serversWithoutBeacon, "Add Beacon")}</div>
          </section>
        </div>
        <h1 class="dash-name">Welcome, <span>${username}</span></h1>
        <section class="dash-content-section is-active" id="server-info" data-dashboard-section="server-info">
          <div class="dash-panel">
            <div class="server-info-head">
              <div>
                <h2 data-server-info-name>${escapeHtml(resolvedServerName)}</h2>
                <p data-server-info-copy>Live server overview synced from Beacon. Member joins and server metrics are refreshed for this server.</p>
              </div>
              <span class="sync-pill" data-sync-pill>Synced just now</span>
            </div>
            <div class="server-info-panels">
              <article class="server-info-panel">
                <h3>Server Info</h3>
                <div class="server-info-lines">
                  <span>Members: <strong data-server-info-members>${Number(selectedServer?.members) || 0}</strong></span>
                  <span>Bots: <strong data-server-info-bots>${Number(selectedServer?.bots) || 0}</strong></span>
                  <span>Channels: <strong data-server-info-channels>${Number(selectedServer?.channels) || 0}</strong></span>
                  <span>Roles: <strong data-server-info-roles>${Number(selectedServer?.roles) || 0}</strong></span>
                  <span>Categories: <strong data-server-info-categories>${Number(selectedServer?.categories) || 0}</strong></span>
                </div>
              </article>
              <article class="server-info-panel">
                <h3>Shard Info</h3>
                <div class="server-info-lines">
                  <span>Primary Shard: <strong data-server-info-shard>${Number(selectedServer?.shardId) || 0}</strong> <small>(synced from Beacon)</small></span>
                  <span>Premium Shard: <strong>Not configured</strong></span>
                </div>
              </article>
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
      let serverSelected = ${hasActiveServer ? "true" : "false"};
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
      const serverInfoName = document.querySelector("[data-server-info-name]");
      const serverInfoMembers = document.querySelector("[data-server-info-members]");
      const serverInfoFields = {
        bots: document.querySelector("[data-server-info-bots]"),
        channels: document.querySelector("[data-server-info-channels]"),
        roles: document.querySelector("[data-server-info-roles]"),
        categories: document.querySelector("[data-server-info-categories]"),
        shard: document.querySelector("[data-server-info-shard]"),
      };
      function updateServerInfo(button) {
        if (serverInfoName) serverInfoName.textContent = button.dataset.serverName || "Selected server";
        if (serverInfoMembers) serverInfoMembers.textContent = button.dataset.serverMembers || "0";
        Object.entries(serverInfoFields).forEach(([key, element]) => {
          if (element) element.textContent = button.dataset["server" + key[0].toUpperCase() + key.slice(1)] || "0";
        });
      }
      function selectServer(button) {
        updateServerInfo(button);
        serverSelected = true;
        dashMain?.classList.remove("is-server-locked");
        document.querySelector(".server-select-gate")?.setAttribute("hidden", "");
        activateDashboardTab("server-info");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (serverSelected) activateDashboardTab(location.hash.slice(1) || "${initialDashboardSection}");
      const customizeStorageKey = "beacon-customize-preview-${escapeHtml(selectedServer?.id || "default")}";
      const dashboardServerId = "${escapeHtml(selectedServer?.id || "")}";
      const bioInput = document.querySelector(".bio-field textarea");
      const avatarPreview = document.querySelector(".asset-editor--avatar img");
      const bannerPreview = document.querySelector(".asset-editor--banner img");
      const saveButton = document.querySelector(".save-bot");
      const resetButton = document.querySelector(".reset-bio");
      const resetChangesButton = document.querySelector(".reset-changes");
      const defaultBio = bioInput?.value || "";
      const defaultImage = "/assets/beacon-logo.png?v=92";
      let avatarValue = null;
      let bannerValue = null;
      let avatarChanged = false;
      let bannerChanged = false;
      let avatarApplied = false;
      let bannerApplied = false;
      function updateImageState(preview, value) {
        preview?.parentElement?.classList.toggle("has-custom-image", Boolean(value));
      }
      try {
        const saved = JSON.parse(localStorage.getItem(customizeStorageKey) || "null");
        if (saved?.bio && bioInput) bioInput.value = saved.bio;
        if (saved?.avatar && avatarPreview) { avatarValue = saved.avatar; avatarApplied = saved.appliedAvatar === true; avatarChanged = !avatarApplied; avatarPreview.src = saved.avatar; updateImageState(avatarPreview, avatarValue); }
        if (saved?.banner && bannerPreview) { bannerValue = saved.banner; bannerApplied = saved.appliedBanner === true; bannerChanged = !bannerApplied; bannerPreview.src = saved.banner; updateImageState(bannerPreview, bannerValue); }
      } catch (_) {}
      saveButton?.addEventListener("click", async () => {
        if (!dashboardServerId) return showDashboardToast("Select a server first", "error");
        const payload = { bio: bioInput?.value || "" };
        if (avatarChanged) payload.avatar = avatarValue;
        if (bannerChanged) payload.banner = bannerValue;
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
        try {
          const response = await fetch("/api/dashboard/customize?server=" + encodeURIComponent(dashboardServerId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          const responseText = await response.text();
          let result = {};
          try { result = JSON.parse(responseText); } catch (_) {}
          if (!response.ok) throw new Error(result.error || ("Discord rejected the profile update (HTTP " + response.status + "). " + responseText.slice(0, 240)));
          if (Array.isArray(result.skippedRateLimitedFields)) {
            if (result.skippedRateLimitedFields.includes("avatar")) { avatarChanged = true; avatarApplied = false; }
            if (result.skippedRateLimitedFields.includes("banner")) { bannerChanged = true; bannerApplied = false; }
          }
          if (payload.avatar && !result.skippedRateLimitedFields?.includes("avatar")) { avatarApplied = true; avatarChanged = false; }
          if (payload.banner && !result.skippedRateLimitedFields?.includes("banner")) { bannerApplied = true; bannerChanged = false; }
          if (result.profile?.avatarUrl && avatarPreview && !result.skippedRateLimitedFields?.includes("avatar")) { avatarPreview.src = result.profile.avatarUrl; avatarValue = result.profile.avatarUrl; updateImageState(avatarPreview, avatarValue); }
          if (result.profile?.bannerUrl && bannerPreview && !result.skippedRateLimitedFields?.includes("banner")) { bannerPreview.src = result.profile.bannerUrl; bannerValue = result.profile.bannerUrl; updateImageState(bannerPreview, bannerValue); }
          try { localStorage.setItem(customizeStorageKey, JSON.stringify({ bio: payload.bio, avatar: avatarValue, banner: bannerValue, appliedAvatar: avatarApplied, appliedBanner: bannerApplied })); } catch (_) {}
          saveButton.textContent = "Saved";
          showDashboardToast(result.message || "Bot profile updated on Discord");
        } catch (error) {
          saveButton.textContent = "Save Bot Changes";
          showDashboardToast(error.message || "Could not update the bot profile", "error");
        } finally {
          saveButton.disabled = false;
          window.setTimeout(() => { saveButton.textContent = "Save Bot Changes"; }, 1800);
        }
      });
      resetButton?.addEventListener("click", () => {
        if (bioInput) bioInput.value = defaultBio;
        showDashboardToast("Bio reset");
      });
      resetChangesButton?.addEventListener("click", () => {
        try { localStorage.removeItem(customizeStorageKey); } catch (_) {}
        if (bioInput) bioInput.value = defaultBio;
        if (avatarPreview) { avatarPreview.src = defaultImage; updateImageState(avatarPreview, null); }
        if (bannerPreview) { bannerPreview.src = defaultImage; updateImageState(bannerPreview, null); }
        avatarValue = null;
        bannerValue = null;
        avatarApplied = false;
        bannerApplied = false;
        avatarChanged = true;
        bannerChanged = true;
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
          reader.addEventListener("load", () => {
            const image = new Image();
            image.addEventListener("load", () => {
              const canvas = document.createElement("canvas");
              const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
              canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
              canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
              canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
              const imageData = canvas.toDataURL("image/png");
              preview.src = imageData;
              updateImageState(preview, imageData);
              if (input.id === "avatar-upload") { avatarValue = imageData; avatarChanged = true; avatarApplied = false; }
              if (input.id === "banner-upload") { bannerValue = imageData; bannerChanged = true; bannerApplied = false; }
              showDashboardToast("Image preview updated");
            });
            image.src = reader.result;
          });
          reader.readAsDataURL(file);
        });
      });
      document.querySelectorAll("[data-reset-image]").forEach((button) => {
        button.addEventListener("click", () => {
          const preview = button.closest(".asset-editor")?.querySelector("img");
          if (preview) { preview.src = defaultImage; updateImageState(preview, null); }
          if (button.dataset.resetImage === "avatar") { avatarValue = null; avatarChanged = true; avatarApplied = false; }
          if (button.dataset.resetImage === "banner") { bannerValue = null; bannerChanged = true; bannerApplied = false; }
          showDashboardToast("Image removed");
        });
      });
      const ticketPanelStorageKey = "beacon-ticket-panels-" + location.search;
      const ticketModal = document.querySelector("[data-ticket-modal]");
      const ticketNameInput = document.querySelector("[data-ticket-name]");
      const ticketEditorTitle = document.querySelector("[data-ticket-editor-title]");
      const ticketMessageInput = document.querySelector("[data-ticket-message]");
      const ticketEmojiIdInput = document.querySelector("[data-ticket-emoji-id]");
      const ticketEmojiAdd = document.querySelector("[data-ticket-emoji-add]");
      const ticketPreviewMessage = document.querySelector("[data-ticket-preview-message]");
      const ticketPanelList = document.querySelector("[data-ticket-panel-list]");
      const ticketLayoutSelect = document.querySelector("[data-ticket-layout]");
      const ticketButtonCountSelect = document.querySelector("[data-ticket-button-count]");
      const ticketChannelSelects = [...document.querySelectorAll("[data-ticket-channel]")];
      const ticketLayoutConfigs = [...document.querySelectorAll("[data-ticket-config]")];
      const ticketOptionInputs = [...document.querySelectorAll("[data-ticket-option-label], [data-ticket-option-description], [data-ticket-button-label], [data-ticket-button-emoji]")];
      function updateTicketLayoutConfig() {
        const layout = ticketLayoutSelect?.value || "buttons";
        ticketLayoutConfigs.forEach((panel) => { panel.hidden = panel.dataset.ticketConfig !== layout; });
        const count = Number(ticketButtonCountSelect?.value || 1);
        document.querySelectorAll("[data-ticket-button-label], [data-ticket-button-emoji]").forEach((input) => {
          input.hidden = Number(input.dataset.ticketButtonLabel || input.dataset.ticketButtonEmoji) > count;
        });
      }
      function ticketPanelDraft() {
        return {
          name: ticketEditorTitle?.textContent || "Ticket Panel",
          message: ticketMessageInput?.value || "",
          layout: ticketLayoutSelect?.value || "buttons",
          buttonCount: ticketButtonCountSelect?.value || "1",
          channels: Object.fromEntries(ticketChannelSelects.map((select) => [select.dataset.ticketChannel, select.value])),
          options: ticketOptionInputs.map((input) => ({
            kind: input.dataset.ticketOptionLabel ? "optionLabel" : input.dataset.ticketOptionDescription ? "optionDescription" : input.dataset.ticketButtonLabel ? "buttonLabel" : "buttonEmoji",
            index: input.dataset.ticketOptionLabel || input.dataset.ticketOptionDescription || input.dataset.ticketButtonLabel || input.dataset.ticketButtonEmoji,
            value: input.value,
          })),
        };
      }
      function closeTicketPanelModal() { if (ticketModal) ticketModal.hidden = true; }
      function updateTicketPreview() {
        if (ticketPreviewMessage && ticketMessageInput) ticketPreviewMessage.textContent = ticketMessageInput.value || "Your ticket message will appear here.";
      }
      document.querySelector("[data-ticket-add]")?.addEventListener("click", () => {
        if (ticketModal) ticketModal.hidden = false;
        ticketNameInput?.focus();
        ticketNameInput?.select();
      });
      document.querySelectorAll("[data-ticket-modal-close]").forEach((button) => button.addEventListener("click", closeTicketPanelModal));
      document.querySelector("[data-ticket-create]")?.addEventListener("click", () => {
        const name = (ticketNameInput?.value || "New Panel").trim().slice(0, 80) || "New Panel";
        const row = document.createElement("button");
        row.className = "ticket-panel-row is-selected";
        row.type = "button";
        row.dataset.ticketPanelRow = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        row.innerHTML = '<span><strong>' + (ticketPanelList?.children.length + 1 || 2) + '</strong> ' + name.replace(/[&<>]/g, '') + '</span><span class="ticket-panel-chevron">›</span>';
        ticketPanelList?.querySelectorAll(".ticket-panel-row").forEach((item) => item.classList.remove("is-selected"));
        ticketPanelList?.append(row);
        if (ticketEditorTitle) ticketEditorTitle.textContent = name;
        closeTicketPanelModal();
        showDashboardToast("Ticket panel created");
      });
      ticketMessageInput?.addEventListener("input", updateTicketPreview);
      ticketLayoutSelect?.addEventListener("change", updateTicketLayoutConfig);
      ticketButtonCountSelect?.addEventListener("change", updateTicketLayoutConfig);
      ticketEmojiAdd?.addEventListener("click", () => {
        const id = (ticketEmojiIdInput?.value || "").match(/\d{17,22}/)?.[0];
        if (!id || !ticketMessageInput) {
          showDashboardToast("Enter a valid Discord emoji ID", "error");
          return;
        }
        const token = "<:custom:" + id + ">";
        const start = ticketMessageInput.selectionStart ?? ticketMessageInput.value.length;
        ticketMessageInput.value = ticketMessageInput.value.slice(0, start) + token + ticketMessageInput.value.slice(ticketMessageInput.selectionEnd ?? start);
        ticketMessageInput.focus();
        ticketMessageInput.selectionStart = ticketMessageInput.selectionEnd = start + token.length;
        updateTicketPreview();
        showDashboardToast("Custom emoji inserted");
      });
      document.querySelector("[data-ticket-save]")?.addEventListener("click", async () => {
        const draft = ticketPanelDraft();
        try { localStorage.setItem(ticketPanelStorageKey, JSON.stringify(draft)); } catch (_) {}
        if (!dashboardServerId) { showDashboardToast("Select a Beacon server first", "error"); return; }
        try {
          const response = await fetch("/api/ticket-config?server=" + encodeURIComponent(dashboardServerId), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ config: draft }),
          });
          if (!response.ok) throw new Error("sync failed");
          showDashboardToast("Ticket panel synced with Beacon");
        } catch (_) {
          showDashboardToast("Draft saved locally; server sync failed", "error");
        }
      });
      try {
        const savedTicketPanel = JSON.parse(localStorage.getItem(ticketPanelStorageKey) || "null");
        if (savedTicketPanel?.name && ticketEditorTitle) ticketEditorTitle.textContent = savedTicketPanel.name;
        if (savedTicketPanel?.message && ticketMessageInput) ticketMessageInput.value = savedTicketPanel.message;
        if (savedTicketPanel?.layout && ticketLayoutSelect) ticketLayoutSelect.value = savedTicketPanel.layout;
        if (savedTicketPanel?.buttonCount && ticketButtonCountSelect) ticketButtonCountSelect.value = savedTicketPanel.buttonCount;
        if (savedTicketPanel?.channels) ticketChannelSelects.forEach((select) => { select.value = savedTicketPanel.channels[select.dataset.ticketChannel] || ""; });
        if (Array.isArray(savedTicketPanel?.options)) savedTicketPanel.options.forEach((saved) => {
          const selector = saved.kind === "optionLabel" ? "[data-ticket-option-label=\"" + saved.index + "\"]" : saved.kind === "optionDescription" ? "[data-ticket-option-description=\"" + saved.index + "\"]" : saved.kind === "buttonLabel" ? "[data-ticket-button-label=\"" + saved.index + "\"]" : "[data-ticket-button-emoji=\"" + saved.index + "\"]";
          const input = document.querySelector(selector);
          if (input) input.value = saved.value || "";
        });
        updateTicketLayoutConfig();
        updateTicketPreview();
      } catch (_) {}
      updateTicketLayoutConfig();
      document.querySelectorAll(".sync-button").forEach((button) => {
        button.addEventListener("click", () => {
          const pill = document.querySelector("[data-sync-pill]");
          if (pill) pill.textContent = "Synced just now";
          showDashboardToast("Servers synced");
        });
      });
      document.querySelectorAll(".manage-other-button").forEach((button) => {
        button.addEventListener("click", () => window.location.reload());
      });
      document.querySelectorAll(".server-sync").forEach((button) => {
        button.addEventListener("click", () => {
          if (button.dataset.canManage !== "true") return denyServerAccess(button.dataset.denialReason);
          serverSelected = true;
          dashMain?.classList.remove("is-server-locked");
          activateDashboardTab("server-info");
        });
      });
      document.querySelectorAll(".server-choice-button").forEach((button) => {
        button.addEventListener("click", (event) => {
          if (button.dataset.canManage !== "true") {
            if (button.tagName === "A") return;
            event.preventDefault();
            return denyServerAccess(button.dataset.denialReason);
          }
          event.preventDefault();
          selectServer(button);
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
