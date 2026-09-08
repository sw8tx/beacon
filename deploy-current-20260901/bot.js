const fs = require("fs");
const http = require("http");
const https = require("https");
const dns = require("dns");
const path = require("path");
require("dotenv").config();
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  Colors,
  EmbedBuilder,
  GatewayIntentBits,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SectionBuilder,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

function normalizeBotToken(value) {
  return String(value || "")
    .trim()
    .replace(/^Bot\s+/i, "")
    .replace(/^['"]|['"]$/g, "");
}

const TOKEN = normalizeBotToken(process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || process.env.TOKEN || "PASTE_NEW_DISCORD_BOT_TOKEN_HERE");
const PROFILE_SYNC_AUTH = String(process.env.PROFILE_SYNC_SECRET || TOKEN).trim();
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || "1529195963787251784";
const DEV_GUILD_ID = process.env.DEV_GUILD_ID || "";
const STATS_SECRET = process.env.STATS_SECRET || "";
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://beacon-bot.site";
const STATS_SYNC_ENDPOINT = process.env.STATS_SYNC_ENDPOINT || process.env.SYNC_ENDPOINT || "https://beacon-bot.site/api/discord-stats";
const STATS_SYNC_INTERVAL_MS = Number(process.env.STATS_SYNC_INTERVAL_MS || process.env.SYNC_INTERVAL_MS || 5_000);
const BOT_STATUS = process.env.BOT_STATUS || "Community health";
const BOT_STATUS_TYPE = Number(process.env.BOT_STATUS_TYPE || 3); // 0 = Playing, 2 = Listening, 3 = Watching, 5 = Competing
const PROFILE_SYNC_SECRET = String(process.env.PROFILE_SYNC_SECRET || "").trim();
const PROFILE_SYNC_PORT = Number(process.env.PORT || 3000);
const STATS_AUTH_TOKEN = STATS_SECRET || process.env.DISCORD_BOT_TOKEN || TOKEN;
const BOT_STARTED_AT = new Date().toISOString();
const BOT_SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const DATA_FILE = path.join(__dirname, "beacon-data.json");
const LOGO_FILE = path.join(__dirname, "beacon-logo.png");
const LOGO_ATTACHMENT_NAME = "beacon-logo.png";
const BRAND_THUMBNAIL_URL = `attachment://${LOGO_ATTACHMENT_NAME}`;
const BRAND_COLOR = 0xff9c1b;
const XP_COOLDOWN_MS = 60_000;
const XP_MIN_PER_MESSAGE = 15;
const XP_MAX_PER_MESSAGE = 25;
const PRESTIGE_LEVEL_REQUIREMENT = 25;
const HONEYPOT_DESCRIPTION = "This is a Honeypot Channel, Text here and you get banned";
const xpCooldowns = new Map();

if (!TOKEN || TOKEN.startsWith("PASTE_")) {
  console.error("Missing Discord bot token. Set DISCORD_TOKEN in your .env file or in your hosting environment.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const defaultGuildData = () => ({
  settings: {
    welcomeChannelId: null,
    logChannelId: null,
    memberRoleId: null,
    onboardingChannelId: null,
    dmWelcomeEnabled: false,
    dmWelcomeMessage: "Hey {user}, welcome to {server}. Glad you're here. Start by checking the onboarding channel and picking your roles.",
    ticketCategoryId: null,
    ticketSupportRoleId: null,
    ticketPanelTitle: "Need help?",
    ticketPanelMessage: "Open a private ticket and the team will pick it up as soon as possible.",
    ticketPanelRules: "Use tickets for support, reports, orders or private questions. Please do not open duplicate tickets.",
    ticketButtonLabel: "Open Ticket",
    ticketClaimButtonLabel: "Claim",
    ticketCloseButtonLabel: "Close",
    ticketWelcomeTitle: "Ticket opened",
    ticketWelcomeMessage: "Thanks {user}. Tell us what you need and include screenshots, order IDs or context if it helps.",
    ticketCloseMessage: "This ticket was closed by {user}.",
    ticketNameFormat: "ticket-{username}",
    ticketSubjectLabel: "What is this about?",
    ticketDetailsLabel: "Explain what you need",
    ticketDetailsPlaceholder: "Describe the issue, request, order ID, screenshots, links, or anything the team should know.",
    ticketMaxOpenPerUser: 1,
    ticketDmTranscript: true,
    honeypotChannelId: null,
    honeypotEnabled: false,
    honeypotAction: "ban",
    honeypotBanEnabled: true,
    honeypotDeleteMessage: true,
    honeypotBanCount: 0,
    honeypotMessageId: null,
    accentColor: "#32d6a0",
  },
  stats: {
    messagesToday: 0,
    messagesWeek: 0,
    joinsWeek: 0,
    leavesWeek: 0,
    lastResetDay: todayKey(),
    channelActivity: {},
    userActivity: {},
  },
  members: {},
  events: [],
  rolePanels: {},
  tickets: {},
  botLogs: [],
  polls: {},
});

let db = loadData();

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { guilds: {} };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { guilds: {} };
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

function normalizeInteractionPayload(payload) {
  if (!payload?.ephemeral) return payload;
  const { ephemeral, flags, ...rest } = payload;
  return { ...rest, flags: flags || MessageFlags.Ephemeral };
}

function withBrandFiles(payload) {
  const responsePayload = normalizeInteractionPayload(payload);
  if (!fs.existsSync(LOGO_FILE)) return responsePayload;
  const files = responsePayload.files ? [...responsePayload.files] : [];
  files.push(new AttachmentBuilder(LOGO_FILE, { name: LOGO_ATTACHMENT_NAME }));
  return { ...responsePayload, files };
}

async function getFetch() {
  if (typeof globalThis.fetch === "function") return globalThis.fetch.bind(globalThis);
  const nodeFetch = await import("node-fetch");
  return nodeFetch.default;
}

function buildStatsPayload() {
  const totalUsers = client.guilds.cache.reduce((sum, guild) => {
    return sum + (guild.memberCount || guild.members.cache.size || 0);
  }, 0);
  const servers = client.guilds.cache
    .map((guild) => ({
      id: guild.id,
      name: guild.name,
      members: guild.memberCount || guild.members.cache.size || 0,
      bots: guild.members.cache.filter((member) => member.user.bot).size,
      channels: guild.channels.cache.size,
      roles: guild.roles.cache.size,
      categories: guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildCategory).size,
      shardId: guild.shardId ?? 0,
      iconUrl: guild.iconURL({ extension: "png", size: 64 }) || null,
      botLogs: guildData(guild.id).botLogs || [],
    }))
    .sort((left, right) => right.members - left.members);
    // Keep every guild in the sync payload so the dashboard can determine
    // Beacon membership for every server, not only the largest 12.

  return {
    guilds: client.guilds.cache.size,
    users: totalUsers,
    commands: commands.length,
    ping: Math.round(client.ws.ping),
    uptime: Math.floor(process.uptime()),
    status: "online",
    startedAt: BOT_STARTED_AT,
    sessionId: BOT_SESSION_ID,
    servers,
  };
}

let warnedMissingStatsAuth = false;
let statsSyncInterval = null;
let lastStatsSyncLogAt = 0;
let lastStatsSyncErrorLogAt = 0;
let warnedStatsFetchFallback = false;

function summarizeNetworkError(err) {
  const code = err?.code || err?.cause?.code;
  const message = err?.message || "unknown error";
  return code ? `${message} (${code})` : message;
}

function postJsonWithNode(urlString, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlString);
    const body = JSON.stringify(payload);
    const transport = target.protocol === "https:" ? https : http;
    const request = transport.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: "POST",
      family: 4,
      timeout: 12_000,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...headers,
      },
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        text += chunk;
        if (text.length > 4096) text = text.slice(0, 4096);
      });
      response.on("end", () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode || 0,
          statusText: response.statusMessage || "",
          text: async () => text,
        });
      });
    });

    request.on("timeout", () => request.destroy(new Error("Stats sync request timed out")));
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function postStatsPayload(payload) {
  const headers = {
    Authorization: `Bearer ${STATS_AUTH_TOKEN}`,
    "X-Stats-Secret": STATS_AUTH_TOKEN,
  };
  try {
    const fetchImpl = await getFetch();
    return await fetchImpl(STATS_SYNC_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (!warnedStatsFetchFallback) {
      warnedStatsFetchFallback = true;
      console.warn(`[stats-sync] fetch failed (${summarizeNetworkError(err)}); retrying with node https.`);
    }
    return postJsonWithNode(STATS_SYNC_ENDPOINT, payload, headers);
  }
}

async function syncDiscordStats() {
  if (!STATS_AUTH_TOKEN || STATS_AUTH_TOKEN.startsWith("PASTE_")) {
    if (!warnedMissingStatsAuth) {
      console.warn("[stats-sync] No stats authentication token is available. Discord stats sync is disabled.");
      warnedMissingStatsAuth = true;
    }
    return;
  }

  try {
    const response = await postStatsPayload(buildStatsPayload());

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 200)}` : ""}`);
    }

    await response.json().catch(() => null);

    const now = Date.now();
    if (!lastStatsSyncLogAt || now - lastStatsSyncLogAt > 5 * 60_000) {
      lastStatsSyncLogAt = now;
      lastStatsSyncErrorLogAt = 0;
      console.log(`[stats-sync] Synced ${client.guilds.cache.size} server(s) to ${STATS_SYNC_ENDPOINT}`);
    }
  } catch (err) {
    const now = Date.now();
    if (!lastStatsSyncErrorLogAt || now - lastStatsSyncErrorLogAt > 60_000) {
      lastStatsSyncErrorLogAt = now;
      console.error(`[stats-sync] Failed to sync Discord stats: ${summarizeNetworkError(err)}`);
    }
  }
}

function startStatsSync() {
  const authSource = STATS_SECRET ? "STATS_SECRET" : process.env.DISCORD_BOT_TOKEN ? "DISCORD_BOT_TOKEN" : "DISCORD_TOKEN/TOKEN";
  console.log(`[stats-sync] Enabled via ${authSource}; endpoint ${STATS_SYNC_ENDPOINT}; interval ${STATS_SYNC_INTERVAL_MS}ms`);
  syncDiscordStats();
  [2_000, 10_000, 30_000].forEach((delay) => {
    const timeout = setTimeout(syncDiscordStats, delay);
    if (typeof timeout.unref === "function") timeout.unref();
  });

  if (statsSyncInterval) clearInterval(statsSyncInterval);
  statsSyncInterval = setInterval(syncDiscordStats, STATS_SYNC_INTERVAL_MS);
  if (typeof statsSyncInterval.unref === "function") statsSyncInterval.unref();
}

function guildData(guildId) {
  if (!db.guilds[guildId]) db.guilds[guildId] = defaultGuildData();
  const defaults = defaultGuildData();
  db.guilds[guildId].settings = { ...defaults.settings, ...db.guilds[guildId].settings };
  db.guilds[guildId].stats = { ...defaults.stats, ...db.guilds[guildId].stats };
  db.guilds[guildId].members = db.guilds[guildId].members || {};
  db.guilds[guildId].events = db.guilds[guildId].events || [];
  db.guilds[guildId].rolePanels = db.guilds[guildId].rolePanels || {};
  db.guilds[guildId].tickets = db.guilds[guildId].tickets || {};
  db.guilds[guildId].botLogs = Array.isArray(db.guilds[guildId].botLogs) ? db.guilds[guildId].botLogs : [];
  db.guilds[guildId].polls = db.guilds[guildId].polls || {};
  return db.guilds[guildId];
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function resetDailyIfNeeded(data) {
  const key = todayKey();
  if (data.stats.lastResetDay !== key) {
    data.stats.messagesToday = 0;
    data.stats.lastResetDay = key;
  }
}

function brandEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setAuthor({ name: "Beacon", iconURL: BRAND_THUMBNAIL_URL })
    .setTitle(title)
    .setDescription(description)
    .setThumbnail(BRAND_THUMBNAIL_URL)
    .setFooter({ text: "Beacon · Community OS" })
    .setTimestamp();
}

function errorEmbed(message) {
  return new EmbedBuilder()
    .setColor(Colors.Red)
    .setAuthor({ name: "Beacon", iconURL: BRAND_THUMBNAIL_URL })
    .setTitle("Action blocked")
    .setDescription(message)
    .setFooter({ text: "Beacon · Community OS" });
}

function successEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setAuthor({ name: "Beacon", iconURL: BRAND_THUMBNAIL_URL })
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "Beacon · Community OS" });
}

function beaconUi() {
  return { brandEmbed, errorEmbed, successEmbed, withBrandFiles, saveData };
}

function percent(value) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function progressBar(value, size = 12) {
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * size);
  return "`" + "#".repeat(filled) + "-".repeat(size - filled) + "`";
}

function randomXpAmount() {
  return Math.floor(Math.random() * (XP_MAX_PER_MESSAGE - XP_MIN_PER_MESSAGE + 1)) + XP_MIN_PER_MESSAGE;
}

function xpForNextLevel(level, prestige = 0) {
  return 100 + Math.max(1, level) * 50 + Math.max(0, prestige) * 25;
}

function prestigeTitle(prestige) {
  if (prestige >= 10) return "Beacon Legend";
  if (prestige >= 7) return "Beacon Mythic";
  if (prestige >= 5) return "Beacon Elite";
  if (prestige >= 3) return "Beacon Veteran";
  if (prestige >= 1) return "Beacon Prestige";
  return "Beacon Member";
}

function ensureMemberProfile(data, userId) {
  if (!data.members[userId]) {
    data.members[userId] = {
      joinedAt: null,
      messages: 0,
      warnings: 0,
      notes: [],
      xp: 0,
      totalXp: 0,
      level: 1,
      prestige: 0,
    };
  }

  const profile = data.members[userId];
  profile.messages = profile.messages || 0;
  profile.warnings = profile.warnings || 0;
  profile.notes = profile.notes || [];
  profile.xp = profile.xp || 0;
  profile.totalXp = profile.totalXp || 0;
  profile.level = profile.level || 1;
  profile.prestige = profile.prestige || 0;
  return profile;
}

function rankMembers(data) {
  return Object.entries(data.members || {})
    .map(([userId, profile]) => ({
      userId,
      level: profile.level || 1,
      prestige: profile.prestige || 0,
      xp: profile.xp || 0,
      totalXp: profile.totalXp || 0,
      messages: profile.messages || 0,
    }))
    .sort((a, b) =>
      b.prestige - a.prestige ||
      b.level - a.level ||
      b.xp - a.xp ||
      b.totalXp - a.totalXp ||
      b.messages - a.messages
    );
}

function rankPosition(data, userId) {
  const index = rankMembers(data).findIndex((item) => item.userId === userId);
  return index === -1 ? null : index + 1;
}

function scoreLabel(value) {
  if (value >= 85) return "Excellent";
  if (value >= 70) return "Healthy";
  if (value >= 50) return "Needs work";
  return "At risk";
}

function calculateHealth(guild, data) {
  resetDailyIfNeeded(data);

  const memberCount = guild.memberCount || 0;
  const messages = data.stats.messagesWeek || 0;
  const joins = data.stats.joinsWeek || 0;
  const leaves = data.stats.leavesWeek || 0;
  const activeChannels = Object.values(data.stats.channelActivity).filter((x) => x.week > 0).length;
  const totalTextChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size || 1;

  const activityScore = Math.min(100, (messages / Math.max(20, memberCount * 3)) * 100);
  const retentionScore = joins === 0 ? 70 : Math.max(0, 100 - (leaves / Math.max(1, joins)) * 100);
  const channelScore = Math.min(100, (activeChannels / totalTextChannels) * 100);
  const setupScore =
    (data.settings.welcomeChannelId ? 25 : 0) +
    (data.settings.logChannelId ? 25 : 0) +
    (data.settings.memberRoleId ? 25 : 0) +
    (data.settings.onboardingChannelId ? 25 : 0);

  const overall = activityScore * 0.35 + retentionScore * 0.25 + channelScore * 0.2 + setupScore * 0.2;

  return {
    overall,
    activityScore,
    retentionScore,
    channelScore,
    setupScore,
    messages,
    joins,
    leaves,
    activeChannels,
    totalTextChannels,
  };
}

function topChannels(guild, data, limit = 5) {
  return Object.entries(data.stats.channelActivity)
    .map(([channelId, stats]) => ({
      channel: guild.channels.cache.get(channelId),
      week: stats.week || 0,
    }))
    .filter((item) => item.channel)
    .sort((a, b) => b.week - a.week)
    .slice(0, limit);
}

function topMembers(guild, data, limit = 5) {
  return Object.entries(data.stats.userActivity)
    .map(([userId, stats]) => ({
      userId,
      week: stats.week || 0,
    }))
    .sort((a, b) => b.week - a.week)
    .slice(0, limit);
}

function recommendationList(guild, data, health) {
  const items = [];

  if (!data.settings.welcomeChannelId) {
    items.push("Run `/setup` and add a welcome channel so new members land somewhere clear.");
  }
  if (!data.settings.onboardingChannelId) {
    items.push("Post `/onboarding` so new members know where to start.");
  }
  if (health.activityScore < 45) {
    items.push("Start a quick question or poll in your most active channel today.");
  }
  if (health.channelScore < 35) {
    items.push("Some channels look quiet. Archive dead channels or merge overlapping topics.");
  }
  if (health.retentionScore < 60) {
    items.push("New members are dropping too fast. Make the first welcome more direct and personal.");
  }
  if (items.length === 0) {
    items.push("The server looks steady. Schedule an event around your next activity peak.");
  }

  return items.slice(0, 5);
}

function renderTemplate(template, context) {
  return String(template || "")
    .replaceAll("{user}", `<@${context.user.id}>`)
    .replaceAll("{username}", context.user.username)
    .replaceAll("{server}", context.guild.name)
    .replaceAll("{memberCount}", `${context.guild.memberCount || 0}`);
}

function buildJoinDm(member, data) {
  const description = renderTemplate(data.settings.dmWelcomeMessage, {
    user: member.user,
    guild: member.guild,
  });

  const embed = brandEmbed(`Welcome to ${member.guild.name}`, description)
    .addFields(
      { name: "Start", value: data.settings.onboardingChannelId ? `Head to <#${data.settings.onboardingChannelId}> first.` : "Take a quick look through the main channels.", inline: true },
      { name: "Tip", value: "Pick your roles early so the server feels less noisy.", inline: true }
    );

  const buttons = [];

  if (data.settings.onboardingChannelId) {
    buttons.push(
      new ButtonBuilder()
        .setLabel("Open Onboarding")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${member.guild.id}/${data.settings.onboardingChannelId}`)
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setLabel("Beacon Dashboard")
      .setStyle(ButtonStyle.Link)
      .setURL(DASHBOARD_URL)
  );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(buttons.slice(0, 5))],
  };
}

async function sendJoinDm(member, data) {
  const payload = buildJoinDm(member, data);

  try {
    await member.send(withBrandFiles(payload));
    await log(member.guild, "Join DM sent", `Sent a welcome DM to ${member.user.tag}.`);
    return true;
  } catch {
    await log(member.guild, "Join DM blocked", `${member.user.tag} has DMs closed or blocked the bot.`);
    return false;
  }
}

/* Inlined command modules: kept in one deployable bot file. */

function cleanChannelName(value) {
  return String(value || "ticket")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "ticket";
}

function shortText(value, fallback = "Not provided", maxLength = 1024) {
  const text = String(value || "").trim() || fallback;
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
}

function ticketRenderTemplate(template, context) {
  return String(template || "")
    .replaceAll("{user}", `<@${context.user.id}>`)
    .replaceAll("{username}", context.user.username)
    .replaceAll("{server}", context.guild.name)
    .replaceAll("{memberCount}", `${context.guild.memberCount || 0}`);
}

function ticketForChannel(data, channelId) {
  return Object.values(data.tickets || {}).find((ticket) => ticket.channelId === channelId && ticket.status === "open");
}

function isTicketStaff(member, data) {
  return member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    (data.settings.ticketSupportRoleId && member.roles.cache.has(data.settings.ticketSupportRoleId));
}

function ticketChannelName(member, data) {
  const count = Object.keys(data.tickets || {}).length + 1;
  return cleanChannelName(data.settings.ticketNameFormat
    .replaceAll("{username}", member.user.username)
    .replaceAll("{userId}", member.user.id)
    .replaceAll("{count}", String(count).padStart(3, "0")));
}

function memberLabel(guild, userId, fallback = "member") {
  const member = guild.members.cache.get(userId);
  return member?.displayName || member?.user?.username || fallback;
}

function supportTeamLabel(guild, data) {
  if (!data.settings.ticketSupportRoleId) return "staff";
  return guild.roles.cache.get(data.settings.ticketSupportRoleId)?.name || "staff";
}

function ticketControlRow(data, ticket) {
  const claimed = Boolean(ticket?.claimedBy);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_claim")
      .setLabel(claimed ? "Claimed" : shortText(data.settings.ticketClaimButtonLabel, "Claim", 80))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(claimed),
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel(shortText(data.settings.ticketCloseButtonLabel, "Close", 80))
      .setStyle(ButtonStyle.Danger)
  );
}

function ticketOpenedEmbed(data, ticket, guild, description, ui) {
  const claimedBy = ticket.claimedBy ? memberLabel(guild, ticket.claimedBy, "staff") : null;
  return ui.brandEmbed(data.settings.ticketWelcomeTitle, shortText(description, "Tell us what you need and include screenshots, order IDs or context if it helps.", 800))
    .setThumbnail(null)
    .addFields(
      { name: "Owner", value: memberLabel(guild, ticket.ownerId, "member"), inline: true },
      { name: "Status", value: claimedBy ? "Claimed" : "Open", inline: true },
      { name: "Team", value: claimedBy || supportTeamLabel(guild, data), inline: true },
      { name: "Subject", value: shortText(ticket.subject, "No subject", 1024), inline: false },
      { name: "Details", value: shortText(ticket.details, "No details added yet.", 1024), inline: false },
      {
        name: "Controls",
        value: claimedBy
          ? `Claimed by ${claimedBy}. Close creates the transcript and removes the ticket channel.`
          : "Claim marks ownership for staff. Close creates the transcript and removes the ticket channel.",
        inline: false,
      }
    );
}

async function buildTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return Buffer.from("Transcript unavailable.", "utf8");

  const lines = [...messages.values()]
    .reverse()
    .map((msg) => {
      const time = msg.createdAt.toISOString();
      const content = msg.content || "[embed/attachment]";
      return `[${time}] ${msg.author.tag}: ${content}`;
    });

  return Buffer.from(lines.join("\n"), "utf8");
}

async function ticketSetup(interaction, data, ui) {
  const category = interaction.options.getChannel("category");
  const supportRole = interaction.options.getRole("support_role");
  const panelTitle = interaction.options.getString("panel_title");
  const panelMessage = interaction.options.getString("panel_message");
  const panelRules = interaction.options.getString("panel_rules");
  const buttonLabel = interaction.options.getString("button_label");
  const claimLabel = interaction.options.getString("claim_label");
  const closeLabel = interaction.options.getString("close_label");
  const welcomeTitle = interaction.options.getString("welcome_title");
  const welcomeMessage = interaction.options.getString("welcome_message");
  const nameFormat = interaction.options.getString("name_format");
  const closeMessage = interaction.options.getString("close_message");
  const subjectLabel = interaction.options.getString("subject_label");
  const detailsLabel = interaction.options.getString("details_label");
  const detailsPlaceholder = interaction.options.getString("details_placeholder");
  const maxOpen = interaction.options.getInteger("max_open");
  const dmTranscript = interaction.options.getBoolean("dm_transcript");

  if (category) data.settings.ticketCategoryId = category.id;
  if (supportRole) data.settings.ticketSupportRoleId = supportRole.id;
  if (panelTitle) data.settings.ticketPanelTitle = panelTitle;
  if (panelMessage) data.settings.ticketPanelMessage = panelMessage;
  if (panelRules) data.settings.ticketPanelRules = panelRules;
  if (buttonLabel) data.settings.ticketButtonLabel = buttonLabel;
  if (claimLabel) data.settings.ticketClaimButtonLabel = claimLabel;
  if (closeLabel) data.settings.ticketCloseButtonLabel = closeLabel;
  if (welcomeTitle) data.settings.ticketWelcomeTitle = welcomeTitle;
  if (welcomeMessage) data.settings.ticketWelcomeMessage = welcomeMessage;
  if (nameFormat) data.settings.ticketNameFormat = nameFormat;
  if (closeMessage) data.settings.ticketCloseMessage = closeMessage;
  if (subjectLabel) data.settings.ticketSubjectLabel = subjectLabel.slice(0, 45);
  if (detailsLabel) data.settings.ticketDetailsLabel = detailsLabel.slice(0, 45);
  if (detailsPlaceholder) data.settings.ticketDetailsPlaceholder = detailsPlaceholder.slice(0, 100);
  if (maxOpen) data.settings.ticketMaxOpenPerUser = maxOpen;
  if (dmTranscript !== null) data.settings.ticketDmTranscript = dmTranscript;
  ui.saveData();

  const embed = ui.successEmbed("Ticket setup saved", "Beacon tickets are ready. No log channel needed.")
    .addFields(
      { name: "Category", value: data.settings.ticketCategoryId ? `<#${data.settings.ticketCategoryId}>` : "Not set", inline: true },
      { name: "Support role", value: data.settings.ticketSupportRoleId ? `<@&${data.settings.ticketSupportRoleId}>` : "Not set", inline: true },
      { name: "Max open", value: `${data.settings.ticketMaxOpenPerUser} per member`, inline: true },
      { name: "Transcript DM", value: data.settings.ticketDmTranscript ? "Enabled" : "Disabled", inline: true },
      { name: "Panel title", value: data.settings.ticketPanelTitle, inline: false },
      { name: "Panel message", value: data.settings.ticketPanelMessage.slice(0, 1024), inline: false },
      { name: "Panel rules", value: data.settings.ticketPanelRules.slice(0, 1024), inline: false },
      { name: "Open button", value: data.settings.ticketButtonLabel, inline: true },
      { name: "Claim button", value: data.settings.ticketClaimButtonLabel, inline: true },
      { name: "Close button", value: data.settings.ticketCloseButtonLabel, inline: true },
      { name: "Modal", value: `${data.settings.ticketSubjectLabel}\n${data.settings.ticketDetailsLabel}`, inline: true },
      { name: "Name format", value: `\`${data.settings.ticketNameFormat}\``, inline: true }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("beacon_refresh_settings").setLabel("Settings").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket_open").setLabel(data.settings.ticketButtonLabel.slice(0, 80)).setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply(ui.withBrandFiles({ embeds: [embed], components: [row], ephemeral: true }));
}

async function ticketPanel(interaction, data, ui) {
  const channel = interaction.options.getChannel("channel");
  const embed = ui.brandEmbed(data.settings.ticketPanelTitle, data.settings.ticketPanelMessage)
    .addFields(
      { name: "Before you open one", value: data.settings.ticketPanelRules.slice(0, 1024), inline: false },
      { name: "What happens next", value: "Beacon asks for a short subject and details, then creates a private channel for you and the team.", inline: false },
      { name: "Current setup", value: `Support: ${data.settings.ticketSupportRoleId ? `<@&${data.settings.ticketSupportRoleId}>` : "staff only"}\nLimit: ${data.settings.ticketMaxOpenPerUser} open ticket(s) per member`, inline: false }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_open")
      .setLabel(data.settings.ticketButtonLabel.slice(0, 80))
      .setStyle(ButtonStyle.Secondary)
  );

  const sent = await channel.send(ui.withBrandFiles({ embeds: [embed], components: [row] }));
  await interaction.reply(ui.withBrandFiles({ embeds: [ui.successEmbed("Ticket panel posted", `Panel is live in ${channel}.\n[Open message](${sent.url})`)], ephemeral: true }));
}

async function ticketClose(interaction, data, ui) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  if (!ticket) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("This command only works inside an open ticket.")], ephemeral: true }));
    return;
  }
  if (!isTicketStaff(interaction.member, data) && ticket.ownerId !== interaction.user.id) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("Only the ticket owner or support team can close this ticket.")], ephemeral: true }));
    return;
  }

  await closeTicket(interaction, data, interaction.options.getString("reason") || "No reason provided.", ui);
}

async function ticketAdd(interaction, data, ui) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  const user = interaction.options.getUser("user");
  if (!ticket) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("This command only works inside an open ticket.")], ephemeral: true }));
    return;
  }
  if (!isTicketStaff(interaction.member, data)) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("Only the support team can add members to tickets.")], ephemeral: true }));
    return;
  }

  await interaction.channel.permissionOverwrites.edit(user.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
  });
  await interaction.reply(ui.withBrandFiles({ embeds: [ui.successEmbed("Member added", `${user} can now see this ticket.`)] }));
}

async function ticketRemove(interaction, data, ui) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  const user = interaction.options.getUser("user");
  if (!ticket) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("This command only works inside an open ticket.")], ephemeral: true }));
    return;
  }
  if (!isTicketStaff(interaction.member, data)) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("Only the support team can remove members from tickets.")], ephemeral: true }));
    return;
  }

  await interaction.channel.permissionOverwrites.edit(user.id, {
    ViewChannel: false,
    SendMessages: false,
  });
  await interaction.reply(ui.withBrandFiles({ embeds: [ui.successEmbed("Member removed", `${user} can no longer see this ticket.`)] }));
}

async function ticketRename(interaction, data, ui) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  const name = cleanChannelName(interaction.options.getString("name"));
  if (!ticket) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("This command only works inside an open ticket.")], ephemeral: true }));
    return;
  }
  if (!isTicketStaff(interaction.member, data)) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("Only the support team can rename tickets.")], ephemeral: true }));
    return;
  }

  await interaction.channel.setName(name);
  ticket.name = name;
  ui.saveData();
  await interaction.reply(ui.withBrandFiles({ embeds: [ui.successEmbed("Ticket renamed", `This ticket is now \`${name}\`.`)] }));
}

async function ticketInfo(interaction, data, ui) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  if (!ticket) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("This command only works inside an open ticket.")], ephemeral: true }));
    return;
  }

  const created = Math.floor(new Date(ticket.createdAt).getTime() / 1000);
  const embed = ui.brandEmbed("Ticket Info", ticket.subject || "No subject saved.")
    .addFields(
      { name: "Owner", value: `<@${ticket.ownerId}>`, inline: true },
      { name: "Status", value: ticket.status, inline: true },
      { name: "Opened", value: `<t:${created}:R>`, inline: true },
      { name: "Claimed by", value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Unclaimed", inline: true },
      { name: "Channel", value: `${interaction.channel}`, inline: true },
      { name: "Details", value: (ticket.details || "No details saved.").slice(0, 1024), inline: false }
    );

  await interaction.reply(ui.withBrandFiles({ embeds: [embed], ephemeral: true }));
}

async function ticketStats(interaction, data, ui) {
  const tickets = Object.values(data.tickets || {});
  const open = tickets.filter((ticket) => ticket.status === "open");
  const closed = tickets.filter((ticket) => ticket.status === "closed");
  const claimed = open.filter((ticket) => ticket.claimedBy);
  const unclaimed = open.filter((ticket) => !ticket.claimedBy);
  const newest = open
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  const embed = ui.brandEmbed("Ticket Stats", "Current ticket workload without needing a log channel.")
    .addFields(
      { name: "Open", value: `${open.length}`, inline: true },
      { name: "Closed", value: `${closed.length}`, inline: true },
      { name: "Claimed / Unclaimed", value: `${claimed.length} / ${unclaimed.length}`, inline: true },
      { name: "Support role", value: data.settings.ticketSupportRoleId ? `<@&${data.settings.ticketSupportRoleId}>` : "Not set", inline: true },
      { name: "Max open", value: `${data.settings.ticketMaxOpenPerUser} per member`, inline: true },
      { name: "Transcript DM", value: data.settings.ticketDmTranscript ? "Enabled" : "Disabled", inline: true },
      {
        name: "Newest open tickets",
        value: newest.length
          ? newest.map((ticket) => `<#${ticket.channelId}> - <@${ticket.ownerId}> - ${ticket.subject || "No subject"}`).join("\n").slice(0, 1024)
          : "No open tickets.",
        inline: false,
      }
    );

  await interaction.reply(ui.withBrandFiles({ embeds: [embed], ephemeral: true }));
}

async function showTicketModal(interaction, data) {
  const modal = new ModalBuilder()
    .setCustomId("ticket_open_modal")
    .setTitle(data.settings.ticketPanelTitle.slice(0, 45) || "Open Ticket");

  const subject = new TextInputBuilder()
    .setCustomId("ticket_subject")
    .setLabel(data.settings.ticketSubjectLabel.slice(0, 45) || "What is this about?")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(80)
    .setRequired(true);

  const details = new TextInputBuilder()
    .setCustomId("ticket_details")
    .setLabel(data.settings.ticketDetailsLabel.slice(0, 45) || "Explain what you need")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1500)
    .setPlaceholder(data.settings.ticketDetailsPlaceholder.slice(0, 100))
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(subject),
    new ActionRowBuilder().addComponents(details)
  );

  await interaction.showModal(modal);
}

async function openTicket(interaction, data, subject, details, ui) {
  const openTickets = Object.values(data.tickets || {}).filter((ticket) =>
    ticket.ownerId === interaction.user.id &&
    ticket.status === "open" &&
    interaction.guild.channels.cache.has(ticket.channelId)
  );

  if (openTickets.length >= data.settings.ticketMaxOpenPerUser) {
    const list = openTickets.map((ticket) => `<#${ticket.channelId}>`).join(", ");
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed(`You already have ${openTickets.length}/${data.settings.ticketMaxOpenPerUser} open ticket(s): ${list}`)], ephemeral: true }));
    return;
  }

  const channelName = ticketChannelName(interaction.member, data);
  const overwrites = [
    {
      id: interaction.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: interaction.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
    },
    {
      id: interaction.client.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
    },
  ];

  if (data.settings.ticketSupportRoleId) {
    overwrites.push({
      id: data.settings.ticketSupportRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }

  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: data.settings.ticketCategoryId || null,
    topic: `Beacon ticket for ${interaction.user.tag} (${interaction.user.id})`,
    permissionOverwrites: overwrites,
  });

  data.tickets[channel.id] = {
    channelId: channel.id,
    ownerId: interaction.user.id,
    openedBy: interaction.user.id,
    claimedBy: null,
    status: "open",
    name: channelName,
    subject,
    details,
    createdAt: new Date().toISOString(),
  };
  ui.saveData();

  const description = ticketRenderTemplate(data.settings.ticketWelcomeMessage, {
    user: interaction.user,
    guild: interaction.guild,
  });

  const ticket = data.tickets[channel.id];
  const embed = ticketOpenedEmbed(data, ticket, interaction.guild, description, ui);
  const row = ticketControlRow(data, ticket);

  await channel.send(ui.withBrandFiles({
    content: data.settings.ticketSupportRoleId ? `<@&${data.settings.ticketSupportRoleId}> ${interaction.user}` : `${interaction.user}`,
    embeds: [embed],
    components: [row],
    allowedMentions: { users: [interaction.user.id], roles: data.settings.ticketSupportRoleId ? [data.settings.ticketSupportRoleId] : [] },
  }));

  await interaction.reply(ui.withBrandFiles({ embeds: [ui.successEmbed("Ticket opened", `Your ticket is ready: ${channel}`)], ephemeral: true }));
}

async function claimTicket(interaction, data, ui) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  if (!ticket) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("This button only works inside an open ticket.")], ephemeral: true }));
    return;
  }
  if (!isTicketStaff(interaction.member, data)) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("Only the support team can claim tickets.")], ephemeral: true }));
    return;
  }
  if (ticket.claimedBy) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed(`This ticket is already claimed by ${memberLabel(interaction.guild, ticket.claimedBy, "staff")}.`)], ephemeral: true }));
    return;
  }

  ticket.claimedBy = interaction.user.id;
  ui.saveData();

  const ownerUser = interaction.client.users.cache.get(ticket.ownerId) || {
    id: ticket.ownerId,
    username: memberLabel(interaction.guild, ticket.ownerId, "member"),
  };
  const description = ticketRenderTemplate(data.settings.ticketWelcomeMessage, {
    user: ownerUser,
    guild: interaction.guild,
  });
  const embed = ticketOpenedEmbed(data, ticket, interaction.guild, description, ui);
  await interaction.update(ui.withBrandFiles({
    embeds: [embed],
    components: [ticketControlRow(data, ticket)],
  }));
}

async function closeTicket(interaction, data, reason, ui) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  if (!ticket) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("This only works inside an open ticket.")], ephemeral: true }));
    return;
  }
  if (!isTicketStaff(interaction.member, data) && ticket.ownerId !== interaction.user.id) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("Only the ticket owner or support team can close this ticket.")], ephemeral: true }));
    return;
  }

  const closeText = ticketRenderTemplate(data.settings.ticketCloseMessage, {
    user: interaction.user,
    guild: interaction.guild,
  });
  const transcript = await buildTranscript(interaction.channel);
  const transcriptFile = new AttachmentBuilder(transcript, { name: `${interaction.channel.name}-transcript.txt` });

  ticket.status = "closed";
  ticket.closedBy = interaction.user.id;
  ticket.closedAt = new Date().toISOString();
  ticket.closeReason = reason;
  ui.saveData();

  const logEmbed = ui.brandEmbed("Ticket closed", closeText)
    .addFields(
      { name: "Channel", value: interaction.channel.name, inline: true },
      { name: "Owner", value: `<@${ticket.ownerId}>`, inline: true },
      { name: "Closed by", value: `${interaction.user}`, inline: true },
      { name: "Reason", value: reason.slice(0, 1024), inline: false },
      { name: "Transcript", value: data.settings.ticketDmTranscript ? "Sent to the ticket owner by DM when possible." : "Transcript DMs are disabled.", inline: false }
    );

  if (data.settings.ticketDmTranscript) {
    const owner = await interaction.client.users.fetch(ticket.ownerId).catch(() => null);
    if (owner) {
      await owner.send(ui.withBrandFiles({ embeds: [logEmbed], files: [transcriptFile] })).catch(() => null);
    }
  }

  await interaction.reply(ui.withBrandFiles({ embeds: [ui.successEmbed("Ticket closing", data.settings.ticketDmTranscript ? "Transcript DM attempted. This channel will be deleted in 5 seconds." : "This channel will be deleted in 5 seconds.")] }));
  setTimeout(() => interaction.channel.delete(`Ticket closed by ${interaction.user.tag}`).catch(() => null), 5000);
}

const MAX_PURGE_COUNT = 99;
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

function countOption(required = true) {
  return (opt) =>
    opt
      .setName("count")
      .setDescription("Messages to scan or delete, max 99")
      .setMinValue(1)
      .setMaxValue(MAX_PURGE_COUNT)
      .setRequired(required);
}

function textOption(name, description) {
  return (opt) =>
    opt
      .setName(name)
      .setDescription(description)
      .setMaxLength(120)
      .setRequired(true);
}

const purgeCommands = [
  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete up to 99 recent messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(countOption(true))
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Optional cleanup reason")
        .setMaxLength(140)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("purge-after")
    .setDescription("Delete messages sent after a specific message ID or link.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((opt) =>
      opt
        .setName("message")
        .setDescription("Message ID or message link")
        .setMaxLength(220)
        .setRequired(true)
    )
    .addIntegerOption(countOption(false)),

  new SlashCommandBuilder()
    .setName("purge-user")
    .setDescription("Delete recent messages sent by one user.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((opt) => opt.setName("user").setDescription("User to clean").setRequired(true))
    .addIntegerOption(countOption(true)),

  new SlashCommandBuilder()
    .setName("purge-bots")
    .setDescription("Delete recent messages sent by bots.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(countOption(true)),

  new SlashCommandBuilder()
    .setName("purge-humans")
    .setDescription("Delete recent messages sent by humans.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(countOption(true)),

  new SlashCommandBuilder()
    .setName("purge-links")
    .setDescription("Delete recent messages that contain links.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(countOption(true)),

  new SlashCommandBuilder()
    .setName("purge-invites")
    .setDescription("Delete recent messages that contain Discord invites.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(countOption(true)),

  new SlashCommandBuilder()
    .setName("purge-images")
    .setDescription("Delete recent messages that contain images or files.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(countOption(true)),

  new SlashCommandBuilder()
    .setName("purge-embeds")
    .setDescription("Delete recent messages that contain embeds.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(countOption(true)),

  new SlashCommandBuilder()
    .setName("purge-mentions")
    .setDescription("Delete recent messages that mention users or roles.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(countOption(true)),

  new SlashCommandBuilder()
    .setName("purge-match")
    .setDescription("Delete recent messages that contain specific text.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(textOption("text", "Text that must appear in the message"))
    .addIntegerOption(countOption(true)),

  new SlashCommandBuilder()
    .setName("purge-startswith")
    .setDescription("Delete recent messages that start with selected text.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(textOption("text", "Text the message must start with"))
    .addIntegerOption(countOption(true)),

  new SlashCommandBuilder()
    .setName("purge-endswith")
    .setDescription("Delete recent messages that end with selected text.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(textOption("text", "Text the message must end with"))
    .addIntegerOption(countOption(true)),

  new SlashCommandBuilder()
    .setName("purge-not")
    .setDescription("Delete recent messages that do not contain selected text.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(textOption("text", "Text that must be missing"))
    .addIntegerOption(countOption(true)),
];

function clampCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return MAX_PURGE_COUNT;
  return Math.max(1, Math.min(MAX_PURGE_COUNT, Math.floor(count)));
}

function messageIdFromInput(input) {
  const match = String(input || "").match(/\d{17,22}/g);
  return match ? match.at(-1) : null;
}

function isBulkDeletable(message) {
  return Date.now() - message.createdTimestamp < TWO_WEEKS_MS;
}

function hasLink(message) {
  return /(https?:\/\/|www\.)\S+/i.test(message.content || "");
}

function hasInvite(message) {
  return /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)\S+/i.test(message.content || "");
}

function hasImageOrFile(message) {
  return message.attachments.size > 0 || message.embeds.some((embed) => embed.image || embed.thumbnail);
}

function hasMention(message) {
  return message.mentions.users.size > 0 || message.mentions.roles.size > 0 || message.mentions.everyone;
}

function normalizedContent(message) {
  return (message.content || "").toLowerCase().trim();
}

const resultTitles = {
  purge: "Purge complete",
  "purge-after": "Purge after complete",
  "purge-user": "User purge complete",
  "purge-bots": "Bot purge complete",
  "purge-humans": "Human purge complete",
  "purge-links": "Link purge complete",
  "purge-invites": "Invite purge complete",
  "purge-images": "Image purge complete",
  "purge-embeds": "Embed purge complete",
  "purge-mentions": "Mention purge complete",
  "purge-match": "Text purge complete",
  "purge-startswith": "Starts-with purge complete",
  "purge-endswith": "Ends-with purge complete",
  "purge-not": "Inverse text purge complete",
};

function purgeFilter(command, interaction) {
  if (command === "purge-user") {
    const user = interaction.options.getUser("user", true);
    return (message) => message.author?.id === user.id;
  }
  if (command === "purge-bots") return (message) => Boolean(message.author?.bot);
  if (command === "purge-humans") return (message) => !message.author?.bot;
  if (command === "purge-links") return hasLink;
  if (command === "purge-invites") return hasInvite;
  if (command === "purge-images") return hasImageOrFile;
  if (command === "purge-embeds") return (message) => message.embeds.length > 0;
  if (command === "purge-mentions") return hasMention;
  if (command === "purge-match") {
    const text = interaction.options.getString("text", true).toLowerCase();
    return (message) => normalizedContent(message).includes(text);
  }
  if (command === "purge-startswith") {
    const text = interaction.options.getString("text", true).toLowerCase();
    return (message) => normalizedContent(message).startsWith(text);
  }
  if (command === "purge-endswith") {
    const text = interaction.options.getString("text", true).toLowerCase();
    return (message) => normalizedContent(message).endsWith(text);
  }
  if (command === "purge-not") {
    const text = interaction.options.getString("text", true).toLowerCase();
    return (message) => !normalizedContent(message).includes(text);
  }
  return () => true;
}

async function ensureCanPurge(interaction, ui) {
  if (!interaction.inGuild() || !interaction.channel?.isTextBased()) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("Purge only works in a server text channel.")], ephemeral: true }));
    return false;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("You need Manage Messages to use purge.")], ephemeral: true }));
    return false;
  }

  const me = interaction.guild.members.me;
  if (!me?.permissionsIn(interaction.channel).has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply(ui.withBrandFiles({ embeds: [ui.errorEmbed("I need Manage Messages in this channel.")], ephemeral: true }));
    return false;
  }

  return true;
}

function buildResultEmbed(ui, label, scanned, matched, deleted, skipped) {
  const description = deleted > 0
    ? `Removed **${deleted}** message(s) from this channel.`
    : "No matching messages could be deleted.";
  return ui.successEmbed(label, description)
    .addFields(
      { name: "Scanned", value: `${scanned}`, inline: true },
      { name: "Matched", value: `${matched}`, inline: true },
      { name: "Deleted", value: `${deleted}`, inline: true },
      { name: "Skipped", value: `${skipped}`, inline: true },
      { name: "Note", value: "Discord bulk delete skips messages older than 14 days.", inline: false }
    );
}

async function deleteMessages(interaction, messages, ui, label, scannedCount) {
  const list = Array.isArray(messages) ? messages : [...messages.values()];
  const deletable = list.filter(isBulkDeletable);
  if (!deletable.length) {
    await interaction.editReply(ui.withBrandFiles({
      embeds: [buildResultEmbed(ui, label, scannedCount, list.length, 0, list.length)],
    }));
    return;
  }

  const deleted = await interaction.channel.bulkDelete(deletable, true);
  const skipped = Math.max(0, list.length - deleted.size);

  await interaction.editReply(ui.withBrandFiles({
    embeds: [buildResultEmbed(ui, label, scannedCount, list.length, deleted.size, skipped)],
  }));
}

async function handlePurgeCommand(interaction, ui) {
  if (!await ensureCanPurge(interaction, ui)) return true;

  const command = interaction.commandName;
  await interaction.deferReply({ ephemeral: true });

  if (command === "purge-after") {
    const id = messageIdFromInput(interaction.options.getString("message", true));
    if (!id) {
      await interaction.editReply(ui.withBrandFiles({ embeds: [ui.errorEmbed("Send a valid message ID or message link.")] }));
      return true;
    }

    const limit = clampCount(interaction.options.getInteger("count") || MAX_PURGE_COUNT);
    const fetched = await interaction.channel.messages.fetch({ after: id, limit: Math.min(100, limit) }).catch(() => null);
    if (!fetched?.size) {
      await interaction.editReply(ui.withBrandFiles({ embeds: [ui.errorEmbed("I could not find messages after that ID in this channel.")] }));
      return true;
    }
    await deleteMessages(interaction, fetched.first(limit), ui, resultTitles[command], fetched.size);
    return true;
  }

  const count = clampCount(interaction.options.getInteger("count", true));
  const fetched = await interaction.channel.messages.fetch({ limit: Math.min(100, count) });
  const filtered = fetched.filter(purgeFilter(command, interaction)).first(count);
  await deleteMessages(interaction, filtered, ui, resultTitles[command] || "Purge complete", fetched.size);
  return true;
}

function honeypotContainer(data) {
  const action = data.settings.honeypotAction || (data.settings.honeypotBanEnabled ? "ban" : "none");
  const actionLabel = {
    ban: "🔨 Banned",
    kick: "👢 Kicked",
    timeout: "⏱️ Timed out (10 min)",
    none: "Nur protokolliert",
  }[action] || "🔨 Banned";

  return new ContainerBuilder()
    .setAccentColor(BRAND_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## DO NOT SEND MESSAGES IN THIS CHANNEL\n${HONEYPOT_DESCRIPTION}`),
      new TextDisplayBuilder().setContent(
        `| Bereich | Aktion |\n| :-- | :-- |\n| Channel | <#${data.settings.honeypotChannelId}> |\n| Nachricht | Wird gelöscht |\n| User | ${actionLabel} |\n| Bans | ${data.settings.honeypotBanCount || 0} |`
      ),
      new TextDisplayBuilder().setContent("-# Powered by Beacon")
    );
}

async function honeypotSetup(interaction, data) {
  const channel = interaction.options.getChannel("channel", true);
  const enabled = interaction.options.getBoolean("enabled", true);
  const action = interaction.options.getString("action");
  const deleteMessage = interaction.options.getBoolean("delete");

  data.settings.honeypotChannelId = channel.id;
  data.settings.honeypotEnabled = enabled;
  if (action) {
    data.settings.honeypotAction = action;
    data.settings.honeypotBanEnabled = action === "ban";
  }
  if (deleteMessage !== null) data.settings.honeypotDeleteMessage = deleteMessage;
  saveData();

  const panel = await channel.send({ components: [honeypotContainer(data)], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
  if (panel) {
    data.settings.honeypotMessageId = panel.id;
    saveData();
  }
  await interaction.reply({
    components: [new ContainerBuilder().setAccentColor(BRAND_COLOR).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Honeypot configured\n${channel} is ${enabled ? "enabled" : "saved but disabled"}.\nAction: **${data.settings.honeypotAction || "ban"}** · ${data.settings.honeypotDeleteMessage ? "messages deleted" : "messages kept"}.`)
    )],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function honeypotDisable(interaction, data) {
  data.settings.honeypotEnabled = false;
  saveData();
  await interaction.reply({
    components: [new ContainerBuilder().setAccentColor(BRAND_COLOR).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Honeypot disabled\n${data.settings.honeypotChannelId ? `<#${data.settings.honeypotChannelId}> remains configured, but no users will be punished.` : "No honeypot channel is configured."}`)
    )],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function dmcaInfo(interaction) {
  await interaction.reply({
    components: [new ContainerBuilder().setAccentColor(BRAND_COLOR).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## DMCA and domain verification\nThe DMCA page shown in your screenshot verifies that you control beacon-bot.site.\n\n" +
        "**What to do**\nUse one of DMCA's verification methods: upload their validation file to the website root, add their meta tag to the homepage, create the requested DNS record, or verify by email.\n\n" +
        "**Beacon**\nBeacon does not submit DMCA takedowns automatically. This only explains the official verification step.\n\n" +
        `**Website**\n${DASHBOARD_URL}`
      )
    )],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function handleHoneypotMessage(message, data) {
  if (!data.settings.honeypotEnabled || !data.settings.honeypotChannelId || message.channel.id !== data.settings.honeypotChannelId) return false;

  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (data.settings.honeypotDeleteMessage) await message.delete().catch(() => null);

  const action = data.settings.honeypotAction || (data.settings.honeypotBanEnabled ? "ban" : "none");
  let actionDone = false;
  const me = message.guild.members.me;
  const permissions = me?.permissionsIn(message.channel);
  if (action === "ban" && member?.bannable && permissions?.has(PermissionFlagsBits.BanMembers)) {
    actionDone = Boolean(await member.ban({ reason: "Beacon honeypot anti-spam protection" }).then(() => true).catch(() => false));
  } else if (action === "kick" && member?.kickable && permissions?.has(PermissionFlagsBits.KickMembers)) {
    actionDone = Boolean(await member.kick("Beacon honeypot anti-spam protection").then(() => true).catch(() => false));
  } else if (action === "timeout" && member?.moderatable && permissions?.has(PermissionFlagsBits.ModerateMembers)) {
    actionDone = Boolean(await member.timeout(10 * 60 * 1000, "Beacon honeypot anti-spam protection").then(() => true).catch(() => false));
  }

  if (action === "ban" && actionDone) {
    data.settings.honeypotBanCount = (data.settings.honeypotBanCount || 0) + 1;
    saveData();
  }

  if (actionDone) saveData();
  if (data.settings.honeypotMessageId) {
    const panel = await message.channel.messages.fetch(data.settings.honeypotMessageId).catch(() => null);
    if (panel) await panel.edit({ components: [honeypotContainer(data)] }).catch(() => null);
  }

  await log(message.guild, "Honeypot triggered", `${message.author.tag} sent a message in <#${message.channel.id}>. Action: ${action}; ${actionDone ? "completed." : "could not be completed."}`);
  return true;
}

const pendingEmojiSteals = new Map();
const BEACON_YELLOW = 0xffb800;

function emojiAssetUrl(emoji) {
  return `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "png"}?quality=lossless`;
}

function cleanEmojiName(name, fallback = "stolen_emoji") {
  const cleaned = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
  return cleaned.length >= 2 ? cleaned : fallback;
}

function uniqueEmojiName(guild, baseName) {
  const base = cleanEmojiName(baseName);
  if (!guild.emojis.cache.some((emoji) => emoji.name === base)) return base;

  for (let index = 2; index <= 99; index += 1) {
    const suffix = `_${index}`;
    const candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`;
    if (!guild.emojis.cache.some((emoji) => emoji.name === candidate)) return candidate;
  }

  return `emoji_${Date.now().toString(36).slice(-8)}`;
}

function parseCustomEmojis(input, max = 25) {
  const seen = new Set();
  const emojis = [];
  const regex = /<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,22})>/g;
  let match;

  while ((match = regex.exec(String(input || ""))) && emojis.length < max) {
    const [, animatedFlag, name, id] = match;
    if (seen.has(id)) continue;
    seen.add(id);
    emojis.push({
      id,
      name,
      animated: animatedFlag === "a",
      mention: `<${animatedFlag ? "a" : ""}:${name}:${id}>`,
    });
  }

  return emojis;
}

function canManageGuildExpressions(member) {
  return member.permissions.has(PermissionFlagsBits.ManageGuildExpressions) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function botCanCreateGuildExpressions(guild) {
  const me = guild.members.me;
  return Boolean(me?.permissions.any(PermissionFlagsBits.CreateGuildExpressions | PermissionFlagsBits.ManageGuildExpressions));
}

function emojiPreviewList(emojis, keepName, showEmoji = false) {
  return emojis
    .map((emoji, index) => {
      const name = keepName ? emoji.name : `stolen_${String(index + 1).padStart(2, "0")}`;
      const preview = showEmoji ? emoji.mention : `[${emoji.name}](${emojiAssetUrl(emoji)})`;
      return `${index + 1}. ${preview} **${emoji.name}**  ->  \`${cleanEmojiName(name)}\``;
    })
    .join("\n")
    .slice(0, 3500);
}

function emojiConfirmRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`emoji_steal_confirm:${id}`).setLabel("Confirm").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`emoji_steal_cancel:${id}`).setLabel("Cancel").setStyle(ButtonStyle.Danger)
  );
}

function emojiConfirmContainer(id, emojis, keepName) {
  const heading = new TextDisplayBuilder().setContent(
    "### Are you sure you want to steal these emojis?\n" +
    "Review the source emojis and their new server names before continuing."
  );
  const preview = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(emojiPreviewList(emojis, keepName, true))
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(emojiAssetUrl(emojis[0]))
        .setDescription(`Preview of ${emojis[0].name}`)
    );
  const details = new TextDisplayBuilder().setContent(
    `**Amount**\n${emojis.length}\n\n**Keep original names**\n${keepName ? "Yes" : "No"}`
  );
  const footer = new TextDisplayBuilder().setContent(
    "-# This confirmation expires in 10 minutes. Nothing is added until you confirm."
  );

  return new ContainerBuilder()
    .setAccentColor(BEACON_YELLOW)
    .addTextDisplayComponents(heading)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(preview)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(details)
    .addActionRowComponents(emojiConfirmRow(id))
    .addTextDisplayComponents(footer);
}

function emojiProgressContainer(count) {
  return new ContainerBuilder()
    .setAccentColor(BEACON_YELLOW)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Stealing ${count === 1 ? "emoji" : "emojis"}...\n` +
        `Beacon is adding ${count} ${count === 1 ? "emoji" : "emojis"} to this server.`
      )
    );
}

function emojiResultContainer(title, description, success, failed = []) {
  const container = new ContainerBuilder()
    .setAccentColor(success ? 0x57f287 : 0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${title}\n${description}`)
    );

  if (failed.length) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Could not add**\n${failed.join("\n").slice(0, 3500)}`)
      );
  }

  return container;
}

function emojiSuccessEmbed(created, deps) {
  const description = created
    .map((emoji) => `Successfully Stole Emoji: ${emoji} - name: \`${emoji.name}\``)
    .join("\n")
    .slice(0, 4000);
  return deps.successEmbed(created.length === 1 ? "Emoji stolen" : "Emojis stolen", description).setThumbnail(created[0]?.imageURL?.() || null);
}

async function stealEmojiBatch(guild, emojis, keepName, moderatorTag) {
  const created = [];
  const failed = [];

  for (const [index, emoji] of emojis.entries()) {
    const baseName = keepName ? emoji.name : `stolen_${String(index + 1).padStart(2, "0")}`;
    const name = uniqueEmojiName(guild, baseName);
    try {
      const createdEmoji = await guild.emojis.create({
        attachment: emojiAssetUrl(emoji),
        name,
        reason: `Emoji steal confirmed by ${moderatorTag}`,
      });
      created.push(createdEmoji);
    } catch (err) {
      failed.push(`${emoji.mention} - ${err.message || "failed"}`);
    }
  }

  return { created, failed };
}

async function prepareEmojiSteal(interaction, bulk, deps) {
  if (!canManageGuildExpressions(interaction.member)) {
    await interaction.reply(deps.withBrandFiles({ embeds: [deps.errorEmbed("You need Manage Expressions permission to steal emojis.")], ephemeral: true }));
    return;
  }
  if (!botCanCreateGuildExpressions(interaction.guild)) {
    await interaction.reply(deps.withBrandFiles({ embeds: [deps.errorEmbed("Beacon needs Create Expressions or Manage Expressions permission before it can add emojis.")], ephemeral: true }));
    return;
  }

  const emojiText = interaction.options.getString(bulk ? "emojis" : "emoji", true);
  const keepName = interaction.options.getBoolean("keep_name", true);

  const emojis = parseCustomEmojis(emojiText, bulk ? 25 : 1);
  if (!emojis.length) {
    await interaction.reply(deps.withBrandFiles({ embeds: [deps.errorEmbed("Paste Discord custom emojis like `<:name:id>` or `<a:name:id>`. Normal Unicode emojis cannot be copied into the server.")], ephemeral: true }));
    return;
  }

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  pendingEmojiSteals.set(id, {
    guildId: interaction.guild.id,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    keepName,
    emojis,
    createdAt: Date.now(),
  });
  setTimeout(() => pendingEmojiSteals.delete(id), 10 * 60_000).unref?.();

  await interaction.reply({
    components: [emojiConfirmContainer(id, emojis, keepName)],
    flags: MessageFlags.IsComponentsV2,
  });
}

async function confirmEmojiSteal(interaction, id, deps) {
  const pending = pendingEmojiSteals.get(id);
  if (!pending) {
    await interaction.reply(deps.withBrandFiles({ embeds: [deps.errorEmbed("This emoji steal confirmation expired. Run the command again.")], ephemeral: true }));
    return;
  }
  if (pending.userId !== interaction.user.id || pending.guildId !== interaction.guild.id) {
    await interaction.reply(deps.withBrandFiles({ embeds: [deps.errorEmbed("Only the member who started this emoji steal can confirm it.")], ephemeral: true }));
    return;
  }
  if (!canManageGuildExpressions(interaction.member)) {
    await interaction.reply(deps.withBrandFiles({ embeds: [deps.errorEmbed("You need Manage Expressions permission to confirm this.")], ephemeral: true }));
    return;
  }
  if (!botCanCreateGuildExpressions(interaction.guild)) {
    await interaction.reply(deps.withBrandFiles({ embeds: [deps.errorEmbed("Beacon needs Create Expressions or Manage Expressions permission before it can add emojis.")], ephemeral: true }));
    return;
  }

  pendingEmojiSteals.delete(id);
  await interaction.deferUpdate();
  await interaction.editReply({
    components: [emojiProgressContainer(pending.emojis.length)],
    flags: MessageFlags.IsComponentsV2,
  });

  const { created, failed } = await stealEmojiBatch(interaction.guild, pending.emojis, pending.keepName, interaction.user.tag);
  const channel = interaction.guild.channels.cache.get(pending.channelId) || interaction.channel;

  if (created.length) {
    await channel.send(deps.withBrandFiles({ embeds: [emojiSuccessEmbed(created, deps)] })).catch(() => null);
  }

  const doneContainer = created.length
    ? emojiResultContainer(
      "Emoji steal complete",
      `${created.length}/${pending.emojis.length} ${pending.emojis.length === 1 ? "emoji was" : "emojis were"} added to this server.`,
      true,
      failed
    )
    : emojiResultContainer(
      "No emojis were added",
      "Check the server emoji limit, source file size, and Beacon's permissions.",
      false,
      failed
    );

  await interaction.editReply({
    components: [doneContainer],
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => null);
}

async function cancelEmojiSteal(interaction, id, deps) {
  const pending = pendingEmojiSteals.get(id);
  if (!pending) {
    await interaction.reply(deps.withBrandFiles({ embeds: [deps.errorEmbed("This emoji steal confirmation already expired.")], ephemeral: true }));
    return;
  }
  if (pending.userId !== interaction.user.id) {
    await interaction.reply(deps.withBrandFiles({ embeds: [deps.errorEmbed("Only the member who started this emoji steal can cancel it.")], ephemeral: true }));
    return;
  }
  pendingEmojiSteals.delete(id);
  await interaction.update({
    components: [emojiResultContainer("Emoji steal canceled", "Nothing was added to the server.", false)],
    flags: MessageFlags.IsComponentsV2,
  });
}

const pollTimers = new Map();

function pollButtonLabel(value, fallback) {
  return String(value || fallback).trim().slice(0, 80) || fallback;
}

function pollTotalVotes(poll) {
  return poll.options.reduce((total, option) => total + option.votes.length, 0);
}

function pollContainer(poll) {
  const total = pollTotalVotes(poll);
  const endText = poll.status === "open"
    ? `Ends <t:${Math.floor(new Date(poll.endsAt).getTime() / 1000)}:R>`
    : `Poll ${poll.status}`;
  const optionText = poll.options.map((option, index) =>
    `**${index + 1}. ${option.label}** — ${option.votes.length} participant${option.votes.length === 1 ? "" : "s"}`
  ).join("\n");
  const intro = new TextDisplayBuilder().setContent(
    `## ${poll.title}\n${poll.description || "Vote below to participate."}\n\n${optionText}\n\n**Participants:** ${total}\n**${endText}**`
  );
  const container = new ContainerBuilder().setAccentColor(0xffb800);
  if (poll.thumbnail) {
    container.addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(intro)
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(poll.thumbnail).setDescription(poll.title.slice(0, 100))));
  } else {
    container.addTextDisplayComponents(intro);
  }
  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      ...poll.options.map((option, index) => new ButtonBuilder()
        .setCustomId(`poll_vote:${poll.id}:${index}`)
        .setLabel(pollButtonLabel(option.label, `Option ${index + 1}`))
        .setStyle(index === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(poll.status !== "open"))
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Poll ID: ${poll.id} · One vote per participant · Vote again to change your choice.`));
  return container;
}

async function refreshPollMessage(guild, poll) {
  const channel = guild.channels.cache.get(poll.channelId);
  if (!channel) return false;
  const message = await channel.messages.fetch(poll.messageId).catch(() => null);
  if (!message) return false;
  await message.edit({ components: [pollContainer(poll)] }).catch(() => null);
  return true;
}

function schedulePollExpiry(guild, poll) {
  if (pollTimers.has(poll.id)) clearTimeout(pollTimers.get(poll.id));
  const delay = Math.max(0, new Date(poll.endsAt).getTime() - Date.now());
  const timer = setTimeout(async () => {
    if (poll.status !== "open") return;
    poll.status = "closed";
    saveData();
    await refreshPollMessage(guild, poll);
    pollTimers.delete(poll.id);
  }, delay);
  timer.unref?.();
  pollTimers.set(poll.id, timer);
}

async function pollCreate(interaction, data) {
  const title = interaction.options.getString("title", true);
  const description = interaction.options.getString("description") || "Vote below to participate.";
  const thumbnail = interaction.options.getString("thumbnail") || "";
  const duration = interaction.options.getInteger("duration", true);
  const options = [1, 2, 3, 4, 5].map((index) => interaction.options.getString(`option_${index}`)).filter(Boolean)
    .map((label) => ({ label: label.trim().slice(0, 80), votes: [] }));
  if (options.length < 2) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("A poll needs at least two options.")], ephemeral: true }));
    return;
  }
  if (thumbnail && !/^https:\/\//i.test(thumbnail)) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("The thumbnail must be an HTTPS image URL.")], ephemeral: true }));
    return;
  }
  const id = `poll_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const poll = { id, title: title.slice(0, 100), description: description.slice(0, 900), thumbnail, options, duration, status: "open", createdBy: interaction.user.id, channelId: interaction.channelId, messageId: null, createdAt: new Date().toISOString(), endsAt: new Date(Date.now() + duration * 60_000).toISOString() };
  const message = await interaction.channel.send({ components: [pollContainer(poll)], flags: MessageFlags.IsComponentsV2 });
  poll.messageId = message.id;
  data.polls[id] = poll;
  saveData();
  schedulePollExpiry(interaction.guild, poll);
  addBotLog(interaction.guild, "Poll created", `${interaction.user.tag} created poll ${id}.`);
  await interaction.reply(withBrandFiles({ embeds: [successEmbed("Poll created", `Poll **${title}** was posted. ID: \`${id}\``)], ephemeral: true }));
}

async function pollEdit(interaction, data) {
  const id = interaction.options.getString("poll_id", true);
  const poll = data.polls[id];
  if (!poll || poll.status === "deleted") {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("That poll does not exist.")], ephemeral: true }));
    return;
  }
  const title = interaction.options.getString("title");
  const description = interaction.options.getString("description");
  const thumbnail = interaction.options.getString("thumbnail");
  const duration = interaction.options.getInteger("duration");
  if (title) poll.title = title.slice(0, 100);
  if (description) poll.description = description.slice(0, 900);
  if (thumbnail !== null) {
    if (thumbnail && !/^https:\/\//i.test(thumbnail)) {
      await interaction.reply(withBrandFiles({ embeds: [errorEmbed("The thumbnail must be an HTTPS image URL.")], ephemeral: true }));
      return;
    }
    poll.thumbnail = thumbnail;
  }
  const editedOptions = [1, 2, 3, 4, 5].map((index) => interaction.options.getString(`option_${index}`)).filter(Boolean);
  if (editedOptions.length >= 2) poll.options = editedOptions.map((label) => ({ label: label.trim().slice(0, 80), votes: [] }));
  if (duration) poll.endsAt = new Date(Date.now() + duration * 60_000).toISOString();
  saveData();
  await refreshPollMessage(interaction.guild, poll);
  if (poll.status === "open") schedulePollExpiry(interaction.guild, poll);
  addBotLog(interaction.guild, "Poll edited", `${interaction.user.tag} edited poll ${id}.`);
  await interaction.reply(withBrandFiles({ embeds: [successEmbed("Poll updated", `Poll \`${id}\` was updated.`)], ephemeral: true }));
}

async function pollDelete(interaction, data) {
  const id = interaction.options.getString("poll_id", true);
  const poll = data.polls[id];
  if (!poll || poll.status === "deleted") {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("That poll does not exist.")], ephemeral: true }));
    return;
  }
  const channel = interaction.guild.channels.cache.get(poll.channelId);
  await channel?.messages.fetch(poll.messageId).then((message) => message.delete()).catch(() => null);
  poll.status = "deleted";
  clearTimeout(pollTimers.get(id));
  pollTimers.delete(id);
  saveData();
  addBotLog(interaction.guild, "Poll deleted", `${interaction.user.tag} deleted poll ${id}.`);
  await interaction.reply(withBrandFiles({ embeds: [successEmbed("Poll deleted", `Poll \`${id}\` was deleted.`)], ephemeral: true }));
}

async function handlePollVote(interaction, data) {
  const [, id, indexText] = interaction.customId.split(":");
  const poll = data.polls[id];
  const index = Number(indexText);
  if (!poll || poll.status !== "open" || !poll.options[index]) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("This poll is no longer active.")], ephemeral: true }));
    return;
  }
  for (const option of poll.options) option.votes = option.votes.filter((userId) => userId !== interaction.user.id);
  poll.options[index].votes.push(interaction.user.id);
  saveData();
  await interaction.update({ components: [pollContainer(poll)], flags: MessageFlags.IsComponentsV2 });
}

function scheduleExistingPolls() {
  for (const guild of client.guilds.cache.values()) {
    const data = guildData(guild.id);
    for (const poll of Object.values(data.polls)) if (poll.status === "open") schedulePollExpiry(guild, poll);
  }
}

const ticketHandlers = { ticketSetup, ticketPanel, ticketClose, ticketAdd, ticketRemove, ticketRename, ticketInfo, ticketStats, showTicketModal, openTicket, claimTicket, closeTicket };

const commands = [
  ...purgeCommands,

  new SlashCommandBuilder()
    .setName("poll-create")
    .setDescription("Create a V2 poll with live participant counts.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) => opt.setName("title").setDescription("Poll title").setMaxLength(100).setRequired(true))
    .addIntegerOption((opt) => opt.setName("duration").setDescription("Duration in minutes").setMinValue(1).setMaxValue(10080).setRequired(true))
    .addStringOption((opt) => opt.setName("option_1").setDescription("First option").setMaxLength(80).setRequired(true))
    .addStringOption((opt) => opt.setName("option_2").setDescription("Second option").setMaxLength(80).setRequired(true))
    .addStringOption((opt) => opt.setName("description").setDescription("Poll description").setMaxLength(900).setRequired(false))
    .addStringOption((opt) => opt.setName("option_3").setDescription("Third option").setMaxLength(80).setRequired(false))
    .addStringOption((opt) => opt.setName("option_4").setDescription("Fourth option").setMaxLength(80).setRequired(false))
    .addStringOption((opt) => opt.setName("option_5").setDescription("Fifth option").setMaxLength(80).setRequired(false))
    .addStringOption((opt) => opt.setName("thumbnail").setDescription("Optional HTTPS thumbnail URL").setMaxLength(500).setRequired(false)),

  new SlashCommandBuilder()
    .setName("poll-edit")
    .setDescription("Edit an existing Beacon poll.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) => opt.setName("poll_id").setDescription("Poll ID from the footer").setMaxLength(60).setRequired(true))
    .addStringOption((opt) => opt.setName("title").setDescription("New poll title").setMaxLength(100).setRequired(false))
    .addStringOption((opt) => opt.setName("description").setDescription("New poll description").setMaxLength(900).setRequired(false))
    .addIntegerOption((opt) => opt.setName("duration").setDescription("Reset duration in minutes").setMinValue(1).setMaxValue(10080).setRequired(false))
    .addStringOption((opt) => opt.setName("option_1").setDescription("Replace options: provide at least two").setMaxLength(80).setRequired(false))
    .addStringOption((opt) => opt.setName("option_2").setDescription("Second replacement option").setMaxLength(80).setRequired(false))
    .addStringOption((opt) => opt.setName("option_3").setDescription("Third replacement option").setMaxLength(80).setRequired(false))
    .addStringOption((opt) => opt.setName("option_4").setDescription("Fourth replacement option").setMaxLength(80).setRequired(false))
    .addStringOption((opt) => opt.setName("option_5").setDescription("Fifth replacement option").setMaxLength(80).setRequired(false))
    .addStringOption((opt) => opt.setName("thumbnail").setDescription("New HTTPS thumbnail URL; empty clears it").setMaxLength(500).setRequired(false)),

  new SlashCommandBuilder()
    .setName("poll-delete")
    .setDescription("Delete an existing Beacon poll.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) => opt.setName("poll_id").setDescription("Poll ID from the footer").setMaxLength(60).setRequired(true)),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show Beacon commands and quick actions."),

  new SlashCommandBuilder()
    .setName("quickstart")
    .setDescription("Show the recommended Beacon setup flow for this server."),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure Beacon channels and default member role.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt
        .setName("welcome")
        .setDescription("Channel for new member welcomes")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addChannelOption((opt) =>
      opt
        .setName("logs")
        .setDescription("Channel for system and moderation logs")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addChannelOption((opt) =>
      opt
        .setName("onboarding")
        .setDescription("Channel for onboarding")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addRoleOption((opt) =>
      opt
        .setName("member_role")
        .setDescription("Role given to new members")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("honeypot-setup")
    .setDescription("Configure a protected anti-spam honeypot channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to protect").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addBooleanOption((opt) => opt.setName("enabled").setDescription("Enable protection now").setRequired(true))
    .addStringOption((opt) => opt
      .setName("action")
      .setDescription("What happens to a user who posts there")
      .addChoices(
        { name: "Ban", value: "ban" },
        { name: "Kick", value: "kick" },
        { name: "Timeout (10 minutes)", value: "timeout" },
        { name: "Log only", value: "none" },
      )
      .setRequired(false))
    .addBooleanOption((opt) => opt.setName("delete").setDescription("Delete triggering messages").setRequired(false)),

  new SlashCommandBuilder()
    .setName("honeypot-disable")
    .setDescription("Disable the configured honeypot without deleting its channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("honeypot-configure")
    .setDescription("Configure the honeypot using the full configuration command.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to protect").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addBooleanOption((opt) => opt.setName("enabled").setDescription("Enable protection now").setRequired(true))
    .addStringOption((opt) => opt
      .setName("action")
      .setDescription("What happens to a user who posts there")
      .addChoices(
        { name: "Ban", value: "ban" },
        { name: "Kick", value: "kick" },
        { name: "Timeout (10 minutes)", value: "timeout" },
        { name: "Log only", value: "none" },
      )
      .setRequired(false))
    .addBooleanOption((opt) => opt.setName("delete").setDescription("Delete triggering messages").setRequired(false)),

  new SlashCommandBuilder()
    .setName("dmca-info")
    .setDescription("Show the DMCA domain verification guidance for Beacon."),

  new SlashCommandBuilder()
    .setName("health")
    .setDescription("Show this server's community health score."),

  new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Open the Beacon server dashboard inside Discord."),

  new SlashCommandBuilder()
    .setName("emoji-steal")
    .setDescription("Steal one custom emoji into this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .addStringOption((opt) =>
      opt
        .setName("emoji")
        .setDescription("Custom emoji to steal, like <:name:id> or <a:name:id>")
        .setMaxLength(120)
        .setRequired(true)
    )
    .addBooleanOption((opt) =>
      opt
        .setName("keep_name")
        .setDescription("Keep the original emoji name")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("emoji-steal-bulk")
    .setDescription("Steal multiple custom emojis into this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .addStringOption((opt) =>
      opt
        .setName("emojis")
        .setDescription("Custom emojis to steal, separated by spaces")
        .setMaxLength(1800)
        .setRequired(true)
    )
    .addBooleanOption((opt) =>
      opt
        .setName("keep_name")
        .setDescription("Keep the original emoji names")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send a clean announcement embed.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Where the announcement should be posted")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("title")
        .setDescription("Announcement title")
        .setMaxLength(100)
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("message")
        .setDescription("Announcement body")
        .setMaxLength(1800)
        .setRequired(true)
    )
    .addBooleanOption((opt) =>
      opt
        .setName("ping_everyone")
        .setDescription("Mention @everyone")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("onboarding")
    .setDescription("Post the onboarding panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Where the panel should be posted")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("dmwelcome")
    .setDescription("Turn join DMs on or off and set the message.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((opt) =>
      opt
        .setName("enabled")
        .setDescription("Send a DM when someone joins")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("message")
        .setDescription("DM text. Supports {user}, {server}, {memberCount}")
        .setMaxLength(1500)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("ticketsetup")
    .setDescription("Customize Beacon tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt
        .setName("category")
        .setDescription("Category where ticket channels should be created")
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false)
    )
    .addRoleOption((opt) =>
      opt
        .setName("support_role")
        .setDescription("Role that can see and manage tickets")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("panel_title")
        .setDescription("Title shown on the public ticket panel")
        .setMaxLength(100)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("panel_message")
        .setDescription("Text shown on the public ticket panel")
        .setMaxLength(1000)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("panel_rules")
        .setDescription("Small rules block shown on the ticket panel")
        .setMaxLength(1000)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("button_label")
        .setDescription("Text on the open ticket button")
        .setMaxLength(80)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("claim_label")
        .setDescription("Text on the claim button inside tickets")
        .setMaxLength(80)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("close_label")
        .setDescription("Text on the close button inside tickets")
        .setMaxLength(80)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("welcome_title")
        .setDescription("Title shown inside new ticket channels")
        .setMaxLength(100)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("welcome_message")
        .setDescription("Text shown inside new tickets. Supports {user}, {username}, {server}")
        .setMaxLength(1500)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("name_format")
        .setDescription("Channel format. Supports {username}, {userId}, {count}")
        .setMaxLength(80)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("close_message")
        .setDescription("Message used when a ticket is closed. Supports {user}, {server}")
        .setMaxLength(1000)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("subject_label")
        .setDescription("Modal question title for the ticket subject")
        .setMaxLength(45)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("details_label")
        .setDescription("Modal question title for ticket details")
        .setMaxLength(45)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("details_placeholder")
        .setDescription("Placeholder text inside the details box")
        .setMaxLength(100)
        .setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("max_open")
        .setDescription("Max open tickets per member")
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt
        .setName("dm_transcript")
        .setDescription("DM the transcript to the ticket owner when closed")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("ticketpanel")
    .setDescription("Post the customizable ticket panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Where the ticket panel should be posted")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ticketclose")
    .setDescription("Close the current ticket and create a transcript.")
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Optional close reason")
        .setMaxLength(500)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("ticketadd")
    .setDescription("Add a member to this ticket.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Member to add")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ticketremove")
    .setDescription("Remove a member from this ticket.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Member to remove")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ticketrename")
    .setDescription("Rename the current ticket channel.")
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription("New ticket channel name")
        .setMaxLength(80)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ticketinfo")
    .setDescription("Show details for the current ticket."),

  new SlashCommandBuilder()
    .setName("ticketstats")
    .setDescription("Show ticket system stats.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("rolepanel")
    .setDescription("Post a role selection menu.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Where the panel should be posted")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addRoleOption((opt) =>
      opt
        .setName("role_1")
        .setDescription("First selectable role")
        .setRequired(true)
    )
    .addRoleOption((opt) =>
      opt
        .setName("role_2")
        .setDescription("Second selectable role")
        .setRequired(false)
    )
    .addRoleOption((opt) =>
      opt
        .setName("role_3")
        .setDescription("Third selectable role")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("event")
    .setDescription("Create an event post with RSVP buttons.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Where the event should be posted")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("title")
        .setDescription("Event name")
        .setMaxLength(100)
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("time")
        .setDescription("When it happens, for example Friday 8 PM")
        .setMaxLength(80)
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("description")
        .setDescription("Short event description")
        .setMaxLength(900)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("member")
    .setDescription("Show a community profile for a member.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show a member's level, XP and prestige.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Member")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the server prestige leaderboard."),

  new SlashCommandBuilder()
    .setName("prestige")
    .setDescription("Reset your level at the cap and gain one prestige rank."),

  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Show Beacon settings for this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show bot status, uptime and system info."),
].map((cmd) => cmd.toJSON());

async function syncGuildCommands(rest, guildId) {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
  console.log(`[commands] Synced ${commands.length} guild slash commands for ${guildId}`);
}

async function syncCachedGuildCommands(rest) {
  for (const guildId of client.guilds.cache.keys()) {
    try {
      await syncGuildCommands(rest, guildId);
    } catch (err) {
      console.error(`[commands] Failed to sync guild commands for ${guildId}: ${err.message}`);
    }
  }
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
  console.log("[commands] Cleared global slash commands; using immediate guild commands");
  await syncCachedGuildCommands(rest);
}

client.once("clientReady", async () => {
  console.log(`Beacon is online as ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: BOT_STATUS, type: BOT_STATUS_TYPE }],
    status: "online",
  });

  startStatsSync();

  try {
    await registerCommands();
    await syncDiscordStats();
    scheduleExistingPolls();
  } catch (err) {
    console.error(`[commands] Failed to register slash commands: ${err.message}`);
  }
});

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(body);
}

function startProfileSyncServer() {
  const server = http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/api/profile-sync") return sendJson(response, 404, { error: "Not found" });
    if (request.headers.authorization !== `Bearer ${PROFILE_SYNC_AUTH}`) return sendJson(response, 401, { error: "Unauthorized" });
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 12 * 1024 * 1024) request.destroy();
    });
    request.on("error", () => {});
    request.on("end", async () => {
      try {
        const input = JSON.parse(raw || "{}");
        const guildId = String(input.guildId || "");
        if (!/^\d{17,22}$/.test(guildId)) return sendJson(response, 400, { error: "Invalid guild ID" });
        if (!client.isReady()) return sendJson(response, 503, { error: "Beacon is still connecting to Discord" });
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetchMe();
        const changes = {};
        for (const field of ["avatar", "banner", "bio"]) {
          if (Object.prototype.hasOwnProperty.call(input, field)) changes[field] = input[field];
        }
        if (!Object.keys(changes).length) return sendJson(response, 400, { error: "No profile changes" });
        const updated = await member.edit(changes);
        return sendJson(response, 200, { ok: true, message: "Beacon's server profile was updated by the bot.", profile: {
          avatar: updated.avatar || null, banner: updated.banner || null, bio: updated.bio || "", userId: client.user.id,
        } });
      } catch (error) {
        console.error("[profile-sync] failed", error);
        return sendJson(response, 502, { error: error?.message || "Discord profile update failed" });
      }
    });
  });
  server.listen(PROFILE_SYNC_PORT, "0.0.0.0", () => console.log(`[profile-sync] Listening on port ${PROFILE_SYNC_PORT}`));
}

client.on("guildCreate", async (guild) => {
  console.log(`[guild-join] Joined new guild: ${guild.name} (${guild.id}) with ${guild.memberCount} members`);
  guildData(guild.id); // Initialize guild data
  saveData();
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await syncGuildCommands(rest, guild.id);
  } catch (err) {
    console.error(`[commands] Failed to sync guild commands for ${guild.id}: ${err.message}`);
  }
  await syncDiscordStats(); // Immediately sync stats
});

client.on("guildDelete", async (guild) => {
  console.log(`[guild-leave] Left guild: ${guild.name} (${guild.id})`);
  await syncDiscordStats(); // Immediately sync stats
});

let memberSyncTimeout;

function debounceMemberSync() {
  clearTimeout(memberSyncTimeout);
  memberSyncTimeout = setTimeout(() => {
    syncDiscordStats();
  }, 2000);
}

client.on("guildMemberAdd", async (member) => {
  const data = guildData(member.guild.id);
  data.stats.joinsWeek += 1;
  data.members[member.id] = {
    joinedAt: new Date().toISOString(),
    messages: 0,
    warnings: 0,
    notes: [],
  };
  saveData();

  if (data.settings.memberRoleId) {
    const role = member.guild.roles.cache.get(data.settings.memberRoleId);
    if (role) await member.roles.add(role).catch(() => null);
  }

  const welcomeChannel = member.guild.channels.cache.get(data.settings.welcomeChannelId);
  if (welcomeChannel) {
    const embed = brandEmbed(
      `Welcome to ${member.guild.name}`,
      `Hey ${member}, glad you're here.\n\nStart with onboarding, pick your interests, and say a quick hello. Beacon will point you toward the right parts of the server.`
    )
      .addFields(
        { name: "Start here", value: data.settings.onboardingChannelId ? `<#${data.settings.onboardingChannelId}>` : "Take a quick look through the channels.", inline: true },
        { name: "Members", value: `${member.guild.memberCount}`, inline: true }
      );

    await welcomeChannel.send(withBrandFiles({ embeds: [embed] })).catch(() => null);
  }

  if (data.settings.dmWelcomeEnabled) {
    await sendJoinDm(member, data);
  }

  await log(member.guild, "Member joined", `${member.user.tag} joined the server.`);
  debounceMemberSync(); // Sync stats after member join
});

client.on("guildMemberRemove", async (member) => {
  const data = guildData(member.guild.id);
  data.stats.leavesWeek += 1;
  saveData();
  await log(member.guild, "Member left", `${member.user.tag} left the server.`);
  debounceMemberSync(); // Sync stats after member leave
});

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;

  const data = guildData(message.guild.id);
  if (await handleHoneypotMessage(message, data)) return;
  resetDailyIfNeeded(data);

  data.stats.messagesToday += 1;
  data.stats.messagesWeek += 1;

  if (!data.stats.channelActivity[message.channel.id]) {
    data.stats.channelActivity[message.channel.id] = { week: 0 };
  }
  data.stats.channelActivity[message.channel.id].week += 1;

  if (!data.stats.userActivity[message.author.id]) {
    data.stats.userActivity[message.author.id] = { week: 0, total: 0 };
  }
  data.stats.userActivity[message.author.id].week += 1;
  data.stats.userActivity[message.author.id].total += 1;

  const profile = ensureMemberProfile(data, message.author.id);
  profile.messages += 1;

  const cooldownKey = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const lastXpAt = xpCooldowns.get(cooldownKey) || 0;

  if (now - lastXpAt >= XP_COOLDOWN_MS) {
    xpCooldowns.set(cooldownKey, now);
    const earned = randomXpAmount();
    profile.xp += earned;
    profile.totalXp += earned;

    let leveledUp = false;
    while (profile.level < PRESTIGE_LEVEL_REQUIREMENT && profile.xp >= xpForNextLevel(profile.level, profile.prestige)) {
      profile.xp -= xpForNextLevel(profile.level, profile.prestige);
      profile.level += 1;
      leveledUp = true;
    }

    if (profile.level >= PRESTIGE_LEVEL_REQUIREMENT) {
      profile.level = PRESTIGE_LEVEL_REQUIREMENT;
      profile.xp = Math.min(profile.xp, xpForNextLevel(profile.level, profile.prestige));
    }

    if (leveledUp) {
      const embed = successEmbed(
        "Level up",
        `${message.author} reached **Level ${profile.level}**.`
      ).addFields(
        { name: "Prestige", value: `${profile.prestige}`, inline: true },
        { name: "Rank", value: `#${rankPosition(data, message.author.id) || "-"}`, inline: true },
        { name: "Next step", value: profile.level >= PRESTIGE_LEVEL_REQUIREMENT ? "Use `/prestige` to reset your level and climb higher." : "Keep chatting to earn more XP.", inline: false }
      );

      await message.channel.send(withBrandFiles({ embeds: [embed] })).catch(() => null);
    }
  }

  saveData();
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return;
    }
  } catch (err) {
    console.error(err);
    const payload = { embeds: [errorEmbed("Something broke. Check the bot permissions and console logs.")], ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(withBrandFiles(payload)).catch(() => null);
    else await interaction.reply(withBrandFiles(payload)).catch(() => null);
  }
});

async function handleCommand(interaction) {
  const command = interaction.commandName;
  const data = guildData(interaction.guild.id);
  addBotLog(interaction.guild, "Command executed", `${interaction.user.tag} used /${command}.`);

  if (command === "poll-create") return pollCreate(interaction, data);
  if (command === "poll-edit") return pollEdit(interaction, data);
  if (command === "poll-delete") return pollDelete(interaction, data);
  if (command === "help") return sendHelp(interaction);
  if (command === "quickstart") return quickStart(interaction, data);
  if (command === "setup") return setup(interaction, data);
  if (command === "honeypot-setup") return honeypotSetup(interaction, data);
  if (command === "honeypot-disable") return honeypotDisable(interaction, data);
  if (command === "honeypot-configure") return honeypotSetup(interaction, data);
  if (command === "dmca-info") return dmcaInfo(interaction);
  if (command === "health") return health(interaction, data);
  if (command === "dashboard") return dashboard(interaction, data);
  if (command === "emoji-steal") return prepareEmojiSteal(interaction, false, beaconUi());
  if (command === "emoji-steal-bulk") return prepareEmojiSteal(interaction, true, beaconUi());
  if (command === "purge" || command.startsWith("purge-")) return handlePurgeCommand(interaction, beaconUi());
  if (command === "announce") return announce(interaction);
  if (command === "onboarding") return onboarding(interaction, data);
  if (command === "dmwelcome") return dmWelcome(interaction, data);
  if (command === "ticketsetup") return ticketHandlers.ticketSetup(interaction, data, beaconUi());
  if (command === "ticketpanel") return ticketHandlers.ticketPanel(interaction, data, beaconUi());
  if (command === "ticketclose") return ticketHandlers.ticketClose(interaction, data, beaconUi());
  if (command === "ticketadd") return ticketHandlers.ticketAdd(interaction, data, beaconUi());
  if (command === "ticketremove") return ticketHandlers.ticketRemove(interaction, data, beaconUi());
  if (command === "ticketrename") return ticketHandlers.ticketRename(interaction, data, beaconUi());
  if (command === "ticketinfo") return ticketHandlers.ticketInfo(interaction, data, beaconUi());
  if (command === "ticketstats") return ticketHandlers.ticketStats(interaction, data, beaconUi());
  if (command === "rolepanel") return rolePanel(interaction, data);
  if (command === "event") return eventPost(interaction, data);
  if (command === "member") return memberProfile(interaction, data);
  if (command === "rank") return rank(interaction, data);
  if (command === "leaderboard") return leaderboard(interaction, data);
  if (command === "prestige") return prestige(interaction, data);
  if (command === "settings") return settings(interaction, data);
  if (command === "status") return status(interaction);
}

const helpPages = [
  {
    title: "Core tools",
    description: "The essentials for running a healthy Beacon server.",
    commands: [
      ["/poll-create /poll-edit /poll-delete", "Create and manage live V2 polls with participant counts."],
      ["/quickstart", "See the recommended setup flow."],
      ["/setup", "Configure welcome, logs, onboarding and the member role."],
      ["/health", "See the community health score and next actions."],
      ["/dashboard", "Open a live server snapshot."],
      ["/status", "Check uptime, ping, servers and memory."],
      ["/settings", "View the current Beacon configuration."],
    ],
  },
  {
    title: "Community tools",
    description: "Build engagement with onboarding, events and progression.",
    commands: [
      ["/onboarding", "Post a button-based onboarding panel."],
      ["/dmwelcome", "Configure private welcome messages."],
      ["/announce", "Post a clean announcement."],
      ["/event", "Create an event post with RSVP buttons."],
      ["/member", "View a member's community profile."],
      ["/rank", "View level, XP and prestige progress."],
      ["/leaderboard", "Show the server prestige leaderboard."],
      ["/prestige", `Prestige after reaching level ${PRESTIGE_LEVEL_REQUIREMENT}.`],
    ],
  },
  {
    title: "Support and moderation",
    description: "Keep support organized and moderation fast.",
    commands: [
      ["/ticketsetup", "Customize roles, text, limits and transcript DMs."],
      ["/ticketpanel", "Post the public panel that opens private tickets."],
      ["/ticketclose", "Close a ticket and create its transcript."],
      ["/ticketadd / /ticketremove", "Manage people in the current ticket."],
      ["/ticketrename", "Rename the current ticket channel."],
      ["/ticketinfo / /ticketstats", "Inspect ticket ownership and workload."],
      ["/rolepanel", "Create a selectable role menu."],
      ["/purge", "Clean recent messages with filters."],
      ["/emoji-steal / bulk", "Copy custom emojis with a confirmation step."],
      ["/honeypot-setup / /honeypot-configure / /honeypot-disable", "Protect a channel from spam and raid bots with configurable moderation."],
      ["/dmca-info", "Show the official domain-verification guidance; no automatic takedown claims are made."],
    ],
  },
];

function helpPageContainer(pageIndex) {
  const page = helpPages[pageIndex] || helpPages[0];
  const lines = page.commands.map(([name, description]) => `**${name}**\n${description}`).join("\n\n");
  const navigation = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`beacon_help_page:${pageIndex - 1}`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
    new ButtonBuilder().setCustomId(`beacon_help_page:${pageIndex + 1}`).setLabel(`Page ${pageIndex + 1}/${helpPages.length}`).setStyle(ButtonStyle.Primary).setDisabled(pageIndex === helpPages.length - 1),
    new ButtonBuilder().setLabel("Web Dashboard").setStyle(ButtonStyle.Link).setURL(DASHBOARD_URL)
  );

  return new ContainerBuilder()
    .setAccentColor(BRAND_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Beacon Help\n### ${page.title}\n${page.description}`),
      new TextDisplayBuilder().setContent(lines),
      new TextDisplayBuilder().setContent(`-# Page ${pageIndex + 1} of ${helpPages.length} · Everyone can use the buttons to browse.`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(navigation);
}

async function sendHelp(interaction) {
  await interaction.reply({
    components: [helpPageContainer(0)],
    flags: MessageFlags.IsComponentsV2,
  });
}

async function quickStart(interaction, data) {
  const checks = [
    { label: "Welcome channel", done: Boolean(data.settings.welcomeChannelId), value: data.settings.welcomeChannelId ? `<#${data.settings.welcomeChannelId}>` : "Run `/setup welcome:#channel`" },
    { label: "Log channel", done: Boolean(data.settings.logChannelId), value: data.settings.logChannelId ? `<#${data.settings.logChannelId}>` : "Run `/setup logs:#channel`" },
    { label: "Onboarding", done: Boolean(data.settings.onboardingChannelId), value: data.settings.onboardingChannelId ? `<#${data.settings.onboardingChannelId}>` : "Run `/onboarding channel:#channel`" },
    { label: "Join DMs", done: data.settings.dmWelcomeEnabled, value: data.settings.dmWelcomeEnabled ? "Enabled" : "Run `/dmwelcome enabled:true message:...`" },
  ];

  const embed = brandEmbed(
    "Beacon Quickstart",
    "Fast setup path for a new server. Do these once, then let Beacon track the pulse."
  ).addFields(
    checks.map((item) => ({
      name: `${item.done ? "Ready" : "Todo"} - ${item.label}`,
      value: item.value,
      inline: true,
    }))
  ).addFields(
    { name: "Suggested first hour", value: "1. Configure channels\n2. Post onboarding\n3. Enable join DMs\n4. Run `/health`\n5. Create your first event" }
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("beacon_refresh_settings").setLabel("Settings").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("beacon_refresh_dashboard").setLabel("Dashboard").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("beacon_refresh_health").setLabel("Health Check").setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply(withBrandFiles({ embeds: [embed], components: [row], ephemeral: true }));
}

async function setup(interaction, data) {
  const welcome = interaction.options.getChannel("welcome");
  const logs = interaction.options.getChannel("logs");
  const onboardingChannel = interaction.options.getChannel("onboarding");
  const memberRole = interaction.options.getRole("member_role");

  if (welcome) data.settings.welcomeChannelId = welcome.id;
  if (logs) data.settings.logChannelId = logs.id;
  if (onboardingChannel) data.settings.onboardingChannelId = onboardingChannel.id;
  if (memberRole) data.settings.memberRoleId = memberRole.id;
  saveData();

  const embed = successEmbed("Setup saved", "Beacon is ready to watch this server properly.")
    .addFields(
      { name: "Welcome", value: data.settings.welcomeChannelId ? `<#${data.settings.welcomeChannelId}>` : "Not set", inline: true },
      { name: "Logs", value: data.settings.logChannelId ? `<#${data.settings.logChannelId}>` : "Not set", inline: true },
      { name: "Onboarding", value: data.settings.onboardingChannelId ? `<#${data.settings.onboardingChannelId}>` : "Not set", inline: true },
      { name: "Member role", value: data.settings.memberRoleId ? `<@&${data.settings.memberRoleId}>` : "Not set", inline: true }
    );

  await interaction.reply(withBrandFiles({ embeds: [embed], ephemeral: true }));
}

async function health(interaction, data) {
  const score = calculateHealth(interaction.guild, data);
  const recs = recommendationList(interaction.guild, data, score);

  const embed = brandEmbed(
    "Community Health Score",
    `**${percent(score.overall)} - ${scoreLabel(score.overall)}**\n${progressBar(score.overall)}\n\nActivity, retention, channel coverage and setup quality in one read.`
  ).addFields(
    { name: "Activity", value: `${percent(score.activityScore)}\n${progressBar(score.activityScore, 10)}`, inline: true },
    { name: "Retention", value: `${percent(score.retentionScore)}\n${progressBar(score.retentionScore, 10)}`, inline: true },
    { name: "Channels", value: `${percent(score.channelScore)}\n${progressBar(score.channelScore, 10)}`, inline: true },
    { name: "Setup", value: `${percent(score.setupScore)}\n${progressBar(score.setupScore, 10)}`, inline: true },
    { name: "This week", value: `${score.messages} messages\n${score.joins} joins\n${score.leaves} leaves`, inline: true },
    { name: "Coverage", value: `${score.activeChannels}/${score.totalTextChannels} text channels active`, inline: true },
    { name: "Recommended moves", value: recs.map((x, i) => `**${i + 1}.** ${x}`).join("\n") }
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("beacon_refresh_health").setLabel("Refresh Score").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("beacon_refresh_dashboard").setLabel("View Dashboard").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel("Web Dashboard").setStyle(ButtonStyle.Link).setURL(DASHBOARD_URL)
  );

  await interaction.reply(withBrandFiles({ embeds: [embed], components: [row] }));
}

async function dashboard(interaction, data) {
  const score = calculateHealth(interaction.guild, data);
  const channels = topChannels(interaction.guild, data);
  const members = topMembers(interaction.guild, data);

  const embed = brandEmbed(
    "Beacon Dashboard",
    `**${interaction.guild.name}**\nHealth, activity and setup in one panel.`
  )
    .addFields(
      { name: "Health", value: `**${percent(score.overall)} - ${scoreLabel(score.overall)}**\n${progressBar(score.overall, 14)}`, inline: false },
      { name: "Messages today", value: `${data.stats.messagesToday}`, inline: true },
      { name: "Messages this week", value: `${data.stats.messagesWeek}`, inline: true },
      { name: "Active channels", value: `${score.activeChannels}/${score.totalTextChannels}`, inline: true },
      { name: "Joins / Leaves", value: `${score.joins} joined\n${score.leaves} left`, inline: true },
      { name: "Join DMs", value: data.settings.dmWelcomeEnabled ? "Enabled" : "Disabled", inline: true },
      { name: "Onboarding", value: data.settings.onboardingChannelId ? `<#${data.settings.onboardingChannelId}>` : "Not set", inline: true },
      {
        name: "Top Channels",
        value: channels.length ? channels.map((x, i) => `**${i + 1}.** ${x.channel} - ${x.week}`).join("\n") : "No data yet.",
        inline: true,
      },
      {
        name: "Top Members",
        value: members.length ? members.map((x, i) => `**${i + 1}.** <@${x.userId}> - ${x.week}`).join("\n") : "No data yet.",
        inline: true,
      },
      {
        name: "Next move",
        value: recommendationList(interaction.guild, data, score)[0],
        inline: false,
      },
      {
        name: "Panel actions",
        value: "`Refresh` updates this view\n`Health Check` opens the score breakdown\n`Web Dashboard` opens Beacon outside Discord",
        inline: false,
      }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("beacon_refresh_dashboard").setLabel("Refresh").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("beacon_refresh_health").setLabel("Health Check").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel("Web Dashboard").setStyle(ButtonStyle.Link).setURL(DASHBOARD_URL)
  );

  await interaction.reply(withBrandFiles({ embeds: [embed], components: [row] }));
}

async function announce(interaction) {
  const channel = interaction.options.getChannel("channel");
  const title = interaction.options.getString("title");
  const message = interaction.options.getString("message");
  const pingEveryone = interaction.options.getBoolean("ping_everyone") || false;

  if (pingEveryone && !interaction.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("You need the Mention Everyone permission for that.")], ephemeral: true }));
    return;
  }

  const embed = brandEmbed(title, message);

  const sent = await channel.send(withBrandFiles({
    content: pingEveryone ? "@everyone" : null,
    embeds: [embed],
    allowedMentions: pingEveryone ? { parse: ["everyone"] } : { parse: [] },
  }));

  await interaction.reply(withBrandFiles({
    embeds: [successEmbed("Announcement sent", `Posted in ${channel}.\n[Open message](${sent.url})`)],
    ephemeral: true,
  }));
}

async function onboarding(interaction, data) {
  const channel = interaction.options.getChannel("channel");
  data.settings.onboardingChannelId = channel.id;
  saveData();

  const embed = brandEmbed(
    "Start here",
    "Pick your first step below. Beacon will keep onboarding simple and help new members find the right place fast."
  ).addFields(
    { name: "New here", value: "Get the basics and your starter role.", inline: true },
    { name: "Interests", value: "Choose what you came here for.", inline: true },
    { name: "Support", value: "Find rules, help and useful links.", inline: true }
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("onboarding_start").setLabel("Start").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("onboarding_rules").setLabel("Rules").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("onboarding_support").setLabel("Support").setStyle(ButtonStyle.Secondary)
  );

  await channel.send(withBrandFiles({ embeds: [embed], components: [row] }));
  await interaction.reply(withBrandFiles({ embeds: [successEmbed("Onboarding posted", `The panel is live in ${channel}.`)], ephemeral: true }));
}

async function dmWelcome(interaction, data) {
  const enabled = interaction.options.getBoolean("enabled");
  const message = interaction.options.getString("message");

  data.settings.dmWelcomeEnabled = enabled;
  if (message) data.settings.dmWelcomeMessage = message;
  saveData();

  const preview = renderTemplate(data.settings.dmWelcomeMessage, {
    user: interaction.user,
    guild: interaction.guild,
  });

  const embed = successEmbed(
    enabled ? "Join DMs enabled" : "Join DMs disabled",
    enabled
      ? "Beacon will DM new members when they join."
      : "Beacon will no longer DM new members when they join."
  ).addFields(
    { name: "Message preview", value: preview.slice(0, 1024) || "No message set." },
    { name: "Placeholders", value: "`{user}` `{server}` `{memberCount}`", inline: false }
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("beacon_test_dm").setLabel("Send Test DM").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("beacon_refresh_settings").setLabel("View Settings").setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply(withBrandFiles({ embeds: [embed], components: [row], ephemeral: true }));
}

async function rolePanel(interaction, data) {
  const channel = interaction.options.getChannel("channel");
  const roles = [
    interaction.options.getRole("role_1"),
    interaction.options.getRole("role_2"),
    interaction.options.getRole("role_3"),
  ].filter(Boolean);

  const customId = `rolepanel_${Date.now()}`;
  data.rolePanels[customId] = roles.map((role) => role.id);
  saveData();

  const embed = brandEmbed(
    "Choose your roles",
    "Pick the roles that fit you. Select a role again later to remove it."
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder("Choose a role")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      roles.map((role) => ({
        label: role.name.slice(0, 100),
        value: role.id,
        description: `Toggle ${role.name}`.slice(0, 100),
      }))
    );

  await channel.send(withBrandFiles({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] }));
  await interaction.reply(withBrandFiles({ embeds: [successEmbed("Role panel posted", `The panel is live in ${channel}.`)], ephemeral: true }));
}

async function eventPost(interaction, data) {
  const channel = interaction.options.getChannel("channel");
  const title = interaction.options.getString("title");
  const time = interaction.options.getString("time");
  const description = interaction.options.getString("description") || "No description added.";
  const id = `event_${Date.now()}`;

  data.events.push({
    id,
    title,
    time,
    description,
    yes: [],
    maybe: [],
    no: [],
  });
  saveData();

  const embed = brandEmbed(title, description)
    .addFields(
      { name: "Time", value: time, inline: true },
      { name: "Going", value: "0", inline: true },
      { name: "Maybe", value: "0", inline: true }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${id}_yes`).setLabel("Going").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${id}_maybe`).setLabel("Maybe").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${id}_no`).setLabel("Can't make it").setStyle(ButtonStyle.Secondary)
  );

  const sent = await channel.send(withBrandFiles({ embeds: [embed], components: [row] }));
  await interaction.reply(withBrandFiles({
    embeds: [successEmbed("Event posted", `Posted in ${channel}.\n[Open message](${sent.url})`)],
    ephemeral: true,
  }));
}

async function memberProfile(interaction, data) {
  const user = interaction.options.getUser("user");
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const profile = ensureMemberProfile(data, user.id);
  const weekly = data.stats.userActivity[user.id]?.week || 0;
  const needed = xpForNextLevel(profile.level, profile.prestige);
  const progress = profile.level >= PRESTIGE_LEVEL_REQUIREMENT ? 100 : (profile.xp / needed) * 100;

  const embed = brandEmbed("Member Profile", `${user}`)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Name", value: user.tag, inline: true },
      { name: "Joined Discord", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "Joined Server", value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "Unknown", inline: true },
      { name: "Prestige", value: `${profile.prestige} - ${prestigeTitle(profile.prestige)}`, inline: true },
      { name: "Level", value: `${profile.level}/${PRESTIGE_LEVEL_REQUIREMENT}`, inline: true },
      { name: "Rank", value: `#${rankPosition(data, user.id) || "-"}`, inline: true },
      { name: "XP", value: profile.level >= PRESTIGE_LEVEL_REQUIREMENT ? "Ready to prestige" : `${profile.xp}/${needed}\n${progressBar(progress, 10)}`, inline: false },
      { name: "Messages this week", value: `${weekly}`, inline: true },
      { name: "Messages total", value: `${profile.messages}`, inline: true },
      { name: "Warnings", value: `${profile.warnings || 0}`, inline: true }
    );

  await interaction.reply(withBrandFiles({ embeds: [embed], ephemeral: true }));
}

async function rank(interaction, data) {
  const user = interaction.options.getUser("user") || interaction.user;
  const profile = ensureMemberProfile(data, user.id);
  const needed = xpForNextLevel(profile.level, profile.prestige);
  const progress = profile.level >= PRESTIGE_LEVEL_REQUIREMENT ? 100 : (profile.xp / needed) * 100;
  const placement = rankPosition(data, user.id);

  const embed = brandEmbed("Beacon Rank", `${user}`)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Prestige", value: `${profile.prestige}`, inline: true },
      { name: "Title", value: prestigeTitle(profile.prestige), inline: true },
      { name: "Leaderboard", value: placement ? `#${placement}` : "Unranked", inline: true },
      { name: "Level", value: `${profile.level}/${PRESTIGE_LEVEL_REQUIREMENT}`, inline: true },
      { name: "Total XP", value: `${profile.totalXp}`, inline: true },
      { name: "Messages", value: `${profile.messages}`, inline: true },
      {
        name: "Progress",
        value: profile.level >= PRESTIGE_LEVEL_REQUIREMENT
          ? "Ready. Use `/prestige` to reset your level and gain prestige."
          : `${profile.xp}/${needed} XP\n${progressBar(progress, 14)}`,
        inline: false,
      }
    );

  await interaction.reply(withBrandFiles({ embeds: [embed] }));
}

async function leaderboard(interaction, data) {
  const rows = rankMembers(data).slice(0, 10);
  const description = rows.length
    ? rows.map((item, index) => {
        return `**${index + 1}.** <@${item.userId}> - P${item.prestige} L${item.level} - ${item.totalXp} XP`;
      }).join("\n")
    : "No ranked members yet. Send messages to start earning XP.";

  const embed = brandEmbed("Prestige Leaderboard", description)
    .addFields(
      { name: "Level cap", value: `${PRESTIGE_LEVEL_REQUIREMENT}`, inline: true },
      { name: "XP cooldown", value: `${Math.round(XP_COOLDOWN_MS / 1000)}s`, inline: true },
      { name: "XP per message", value: `${XP_MIN_PER_MESSAGE}-${XP_MAX_PER_MESSAGE}`, inline: true }
    );

  await interaction.reply(withBrandFiles({ embeds: [embed] }));
}

async function prestige(interaction, data) {
  const profile = ensureMemberProfile(data, interaction.user.id);

  if (profile.level < PRESTIGE_LEVEL_REQUIREMENT) {
    const needed = xpForNextLevel(profile.level, profile.prestige);
    const remaining = Math.max(0, needed - profile.xp);
    await interaction.reply(withBrandFiles({
      embeds: [errorEmbed(`You need Level ${PRESTIGE_LEVEL_REQUIREMENT} before you can prestige. You are Level ${profile.level}; ${remaining} XP to the next level.`)],
      ephemeral: true,
    }));
    return;
  }

  profile.prestige += 1;
  profile.level = 1;
  profile.xp = 0;
  saveData();

  const embed = successEmbed(
    "Prestige gained",
    `${interaction.user} reached **Prestige ${profile.prestige}** and became **${prestigeTitle(profile.prestige)}**.`
  ).addFields(
    { name: "Level reset", value: `Back to Level 1`, inline: true },
    { name: "Leaderboard", value: `#${rankPosition(data, interaction.user.id) || "-"}`, inline: true },
    { name: "Next climb", value: `Reach Level ${PRESTIGE_LEVEL_REQUIREMENT} again to prestige higher.`, inline: false }
  );

  await interaction.reply(withBrandFiles({ embeds: [embed] }));
}

async function settings(interaction, data) {
  const embed = brandEmbed("Beacon Settings", "Current configuration for this server.")
    .addFields(
      { name: "Welcome", value: data.settings.welcomeChannelId ? `<#${data.settings.welcomeChannelId}>` : "Not set", inline: true },
      { name: "Logs", value: data.settings.logChannelId ? `<#${data.settings.logChannelId}>` : "Not set", inline: true },
      { name: "Onboarding", value: data.settings.onboardingChannelId ? `<#${data.settings.onboardingChannelId}>` : "Not set", inline: true },
      { name: "Member role", value: data.settings.memberRoleId ? `<@&${data.settings.memberRoleId}>` : "Not set", inline: true },
      { name: "Join DMs", value: data.settings.dmWelcomeEnabled ? "Enabled" : "Disabled", inline: true },
      { name: "DM message", value: data.settings.dmWelcomeMessage.slice(0, 1024) || "Not set", inline: false },
      { name: "Ticket category", value: data.settings.ticketCategoryId ? `<#${data.settings.ticketCategoryId}>` : "Not set", inline: true },
      { name: "Support role", value: data.settings.ticketSupportRoleId ? `<@&${data.settings.ticketSupportRoleId}>` : "Not set", inline: true },
      { name: "Ticket limit", value: `${data.settings.ticketMaxOpenPerUser} open per member`, inline: true },
      { name: "Transcript DM", value: data.settings.ticketDmTranscript ? "Enabled" : "Disabled", inline: true },
      { name: "Honeypot", value: data.settings.honeypotEnabled && data.settings.honeypotChannelId ? `<#${data.settings.honeypotChannelId}> · Enabled` : "Disabled", inline: true },
      { name: "Honeypot action", value: `${data.settings.honeypotBanEnabled ? "Ban" : "Log only"} / ${data.settings.honeypotDeleteMessage ? "Delete" : "Keep message"}`, inline: true },
      { name: "Ticket panel", value: `**${data.settings.ticketPanelTitle}**\n${data.settings.ticketPanelMessage.slice(0, 800)}`, inline: false },
      { name: "Ticket rules", value: data.settings.ticketPanelRules.slice(0, 800), inline: false },
      { name: "Ticket buttons", value: `${data.settings.ticketButtonLabel} / ${data.settings.ticketClaimButtonLabel} / ${data.settings.ticketCloseButtonLabel}`, inline: true },
      { name: "Ticket name format", value: `\`${data.settings.ticketNameFormat}\``, inline: true },
      { name: "Dashboard", value: DASHBOARD_URL, inline: false }
    );

  await interaction.reply(withBrandFiles({ embeds: [embed], ephemeral: true }));
}

function statusContainer() {
  const uptime = formatUptime(process.uptime());
  const memory = process.memoryUsage();
  const memoryMb = Math.round(memory.rss / 1024 / 1024);
  const guildCount = client.guilds.cache.size;
  const memberCount = client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount || 0), 0);

  const header = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("## Beacon Status\nOnline and tracking community signals."))
    .setButtonAccessory(new ButtonBuilder().setCustomId("beacon_refresh_status").setLabel("Reload").setStyle(ButtonStyle.Secondary));

  return new ContainerBuilder()
    .setAccentColor(BRAND_COLOR)
    .addSectionComponents(header)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `**Status**\nOnline\n\n**Uptime**\n${uptime}\n\n**Ping**\n${client.ws.ping}ms\n\n` +
      `**Servers**\n${guildCount}\n\n**Visible members**\n${memberCount}\n\n**RAM**\n${memoryMb} MB\n\n` +
      `**Node.js**\n${process.version}\n\n**Presence**\n${BOT_STATUS}`
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Press Reload to fetch the latest status."));
}

async function status(interaction) {
  await interaction.reply({
    components: [statusContainer()],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

function formatUptime(seconds) {
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function handleModal(interaction) {
  const data = guildData(interaction.guild.id);

  if (interaction.customId === "ticket_open_modal") {
    const subject = interaction.fields.getTextInputValue("ticket_subject");
    const details = interaction.fields.getTextInputValue("ticket_details");
    await ticketHandlers.openTicket(interaction, data, subject, details, beaconUi());
    return;
  }

}

async function handleButton(interaction) {
  const data = guildData(interaction.guild.id);

  if (interaction.customId.startsWith("poll_vote:")) {
    await handlePollVote(interaction, data);
    return;
  }

  if (interaction.customId.startsWith("emoji_steal_confirm:")) {
    await confirmEmojiSteal(interaction, interaction.customId.split(":")[1], beaconUi());
    return;
  }

  if (interaction.customId.startsWith("emoji_steal_cancel:")) {
    await cancelEmojiSteal(interaction, interaction.customId.split(":")[1], beaconUi());
    return;
  }

  if (interaction.customId.startsWith("beacon_help_page:")) {
    const pageIndex = Number(interaction.customId.split(":")[1]);
    await interaction.update({
      components: [helpPageContainer(Number.isInteger(pageIndex) ? pageIndex : 0)],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  if (interaction.customId === "beacon_refresh_health") {
    return health(interaction, data);
  }

  if (interaction.customId === "beacon_refresh_dashboard") {
    return dashboard(interaction, data);
  }

  if (interaction.customId === "beacon_refresh_settings") {
    return settings(interaction, data);
  }

  if (interaction.customId === "beacon_refresh_status") {
    await interaction.update({
      components: [statusContainer()],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  if (interaction.customId === "beacon_test_dm") {
    const fakeMember = {
      user: interaction.user,
      guild: interaction.guild,
      send: (payload) => interaction.user.send(payload),
    };

    const sent = await sendJoinDm(fakeMember, data);

    if (sent) {
      await interaction.reply(withBrandFiles({ embeds: [successEmbed("Test DM sent", "Check your DMs from Beacon.")], ephemeral: true }));
    } else {
      await interaction.reply(withBrandFiles({ embeds: [errorEmbed("I could not DM you. Make sure your DMs are open.")], ephemeral: true }));
    }
    return;
  }

  if (interaction.customId === "ticket_open") {
    await ticketHandlers.showTicketModal(interaction, data, beaconUi());
    return;
  }

  if (interaction.customId === "ticket_claim") {
    await ticketHandlers.claimTicket(interaction, data, beaconUi());
    return;
  }

  if (interaction.customId === "ticket_close") {
    await ticketHandlers.closeTicket(interaction, data, "Closed from ticket controls.", beaconUi());
    return;
  }

  if (interaction.customId === "onboarding_start") {
    if (data.settings.memberRoleId) {
      const role = interaction.guild.roles.cache.get(data.settings.memberRoleId);
      if (role) await interaction.member.roles.add(role).catch(() => null);
    }

    const embed = successEmbed(
      "You're in",
      "Introduce yourself, pick your interests, and start with the channels that matter most."
    ).addFields(
      { name: "Quick tip", value: "Servers with active introductions usually keep new members longer." }
    );
    await interaction.reply(withBrandFiles({ embeds: [embed], ephemeral: true }));
    return;
  }

  if (interaction.customId === "onboarding_rules") {
    await interaction.reply(withBrandFiles({
      embeds: [brandEmbed("Rules", "Be respectful, avoid spam, keep self-promo where it belongs, and use the right channel for the topic.")],
      ephemeral: true,
    }));
    return;
  }

  if (interaction.customId === "onboarding_support") {
    await interaction.reply(withBrandFiles({
      embeds: [brandEmbed("Support", "Need help? Ask the team or use the server's support channel.")],
      ephemeral: true,
    }));
    return;
  }

  if (interaction.customId.startsWith("event_")) {
    await handleEventButton(interaction, data);
  }
}

async function handleEventButton(interaction, data) {
  const parts = interaction.customId.split("_");
  const eventId = `${parts[0]}_${parts[1]}`;
  const choice = parts[2];
  const event = data.events.find((item) => item.id === eventId);

  if (!event) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("That event is no longer registered.")], ephemeral: true }));
    return;
  }

  event.yes = event.yes.filter((id) => id !== interaction.user.id);
  event.maybe = event.maybe.filter((id) => id !== interaction.user.id);
  event.no = event.no.filter((id) => id !== interaction.user.id);
  event[choice].push(interaction.user.id);
  saveData();

  const embed = brandEmbed(event.title, event.description)
    .addFields(
      { name: "Time", value: event.time, inline: true },
      { name: "Going", value: `${event.yes.length}`, inline: true },
      { name: "Maybe", value: `${event.maybe.length}`, inline: true }
    );

  await interaction.update(withBrandFiles({ embeds: [embed] }));
}

async function handleSelect(interaction) {
  const data = guildData(interaction.guild.id);
  const roles = data.rolePanels[interaction.customId];

  if (!roles) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("That role panel is no longer registered.")], ephemeral: true }));
    return;
  }

  const roleId = interaction.values[0];
  if (!roles.includes(roleId)) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("That role does not belong to this panel.")], ephemeral: true }));
    return;
  }

  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("That role no longer exists.")], ephemeral: true }));
    return;
  }

  if (interaction.member.roles.cache.has(roleId)) {
    await interaction.member.roles.remove(role).catch(() => null);
    await interaction.reply(withBrandFiles({ embeds: [successEmbed("Role removed", `${role} was removed from your profile.`)], ephemeral: true }));
  } else {
    await interaction.member.roles.add(role).catch(() => null);
    await interaction.reply(withBrandFiles({ embeds: [successEmbed("Role added", `${role} was added to your profile.`)], ephemeral: true }));
  }
}

function addBotLog(guild, title, description) {
  const data = guildData(guild.id);
  data.botLogs.unshift({
    title: String(title || "Bot action").slice(0, 100),
    description: String(description || "").slice(0, 300),
    at: new Date().toISOString(),
  });
  data.botLogs = data.botLogs.slice(0, 100);
  saveData();
}

async function log(guild, title, description) {
  addBotLog(guild, title, description);
  const data = guildData(guild.id);
  const channel = guild.channels.cache.get(data.settings.logChannelId);
  if (!channel) return;
  const embed = brandEmbed(title, description);
  await channel.send(withBrandFiles({ embeds: [embed] })).catch(() => null);
}

process.on("SIGINT", () => {
  saveData();
  process.exit(0);
});

startProfileSyncServer();
client.login(TOKEN)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
