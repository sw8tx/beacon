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
  MessageFlags,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN || "PASTE_NEW_DISCORD_BOT_TOKEN_HERE";
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || "1529195963787251784";
const DEV_GUILD_ID = process.env.DEV_GUILD_ID || "";
const STATS_SECRET = process.env.STATS_SECRET || "";
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://beacon-bot.site";
const STATS_SYNC_ENDPOINT = process.env.STATS_SYNC_ENDPOINT || "https://beacon-bot.site/api/discord-stats";
const STATS_SYNC_INTERVAL_MS = Number(process.env.STATS_SYNC_INTERVAL_MS || 30_000);
const BOT_STATUS = process.env.BOT_STATUS || "Community health";
const BOT_STATUS_TYPE = Number(process.env.BOT_STATUS_TYPE || 3); // 0 = Playing, 2 = Listening, 3 = Watching, 5 = Competing
const STATS_AUTH_TOKEN = STATS_SECRET || TOKEN;
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
      name: guild.name,
      members: guild.memberCount || guild.members.cache.size || 0,
      iconUrl: guild.iconURL({ extension: "png", size: 64 }) || null,
    }))
    .sort((left, right) => right.members - left.members)
    .slice(0, 12);

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
  const headers = { Authorization: `Bearer ${STATS_AUTH_TOKEN}` };
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

function cleanChannelName(value) {
  return String(value || "ticket")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "ticket";
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

const commands = [
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
    .setName("health")
    .setDescription("Show this server's community health score."),

  new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Open the Beacon server dashboard inside Discord."),

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

async function registerGuildCommands(rest, guildId) {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
  console.log(`[commands] Synced ${commands.length} slash commands for guild ${guildId}`);
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log(`[commands] Synced ${commands.length} global slash commands`);

  for (const guildId of client.guilds.cache.keys()) {
    await registerGuildCommands(rest, guildId);
  }
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
  } catch (err) {
    console.error(`[commands] Failed to register slash commands: ${err.message}`);
  }
});

client.on("guildCreate", async (guild) => {
  console.log(`[guild-join] Joined new guild: ${guild.name} (${guild.id}) with ${guild.memberCount} members`);
  guildData(guild.id); // Initialize guild data
  saveData();
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await registerGuildCommands(rest, guild.id);
  } catch (err) {
    console.error(`[commands] Failed to sync slash commands for ${guild.id}: ${err.message}`);
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

  if (command === "help") return sendHelp(interaction);
  if (command === "quickstart") return quickStart(interaction, data);
  if (command === "setup") return setup(interaction, data);
  if (command === "health") return health(interaction, data);
  if (command === "dashboard") return dashboard(interaction, data);
  if (command === "announce") return announce(interaction);
  if (command === "onboarding") return onboarding(interaction, data);
  if (command === "dmwelcome") return dmWelcome(interaction, data);
  if (command === "ticketsetup") return ticketSetup(interaction, data);
  if (command === "ticketpanel") return ticketPanel(interaction, data);
  if (command === "ticketclose") return ticketClose(interaction, data);
  if (command === "ticketadd") return ticketAdd(interaction, data);
  if (command === "ticketremove") return ticketRemove(interaction, data);
  if (command === "ticketrename") return ticketRename(interaction, data);
  if (command === "ticketinfo") return ticketInfo(interaction, data);
  if (command === "ticketstats") return ticketStats(interaction, data);
  if (command === "rolepanel") return rolePanel(interaction, data);
  if (command === "event") return eventPost(interaction, data);
  if (command === "member") return memberProfile(interaction, data);
  if (command === "rank") return rank(interaction, data);
  if (command === "leaderboard") return leaderboard(interaction, data);
  if (command === "prestige") return prestige(interaction, data);
  if (command === "settings") return settings(interaction, data);
  if (command === "status") return status(interaction);
}

async function sendHelp(interaction) {
  const embed = brandEmbed(
    "Beacon Control",
    "Server tools, health checks, welcome flows and admin panels. Built to keep a community moving."
  ).addFields(
    { name: "/quickstart", value: "See the clean setup flow for a new Beacon server." },
    { name: "/setup", value: "Set welcome, logs, onboarding and default member role." },
    { name: "/health", value: "See the community health score and next best actions." },
    { name: "/dashboard", value: "Open a live server snapshot with buttons." },
    { name: "/announce", value: "Post a clean announcement embed." },
    { name: "/onboarding", value: "Post a button-based onboarding panel." },
    { name: "/dmwelcome", value: "Send a private welcome message when someone joins." },
    { name: "/ticketsetup", value: "Customize support role, category, text, modal, limits and transcript DMs." },
    { name: "/ticketpanel", value: "Post the public panel that opens private tickets." },
    { name: "/ticketclose", value: "Close the ticket and DM the transcript if enabled." },
    { name: "/ticketadd / /ticketremove", value: "Add or remove people from the current ticket." },
    { name: "/ticketrename", value: "Rename the current ticket channel." },
    { name: "/ticketinfo", value: "Show owner, subject, claim state and ticket age." },
    { name: "/ticketstats", value: "Show open/closed tickets and support workload." },
    { name: "/rolepanel", value: "Create a role menu with selectable roles." },
    { name: "/event", value: "Create an event post with RSVP buttons." },
    { name: "/member", value: "View a member's community profile." },
    { name: "/rank", value: "View level, XP and prestige progress." },
    { name: "/leaderboard", value: "Show the server prestige leaderboard." },
    { name: "/prestige", value: `Prestige after reaching level ${PRESTIGE_LEVEL_REQUIREMENT}.` },
    { name: "/status", value: "Check uptime, ping, server count and memory." }
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("beacon_refresh_dashboard").setLabel("Open Dashboard").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("beacon_refresh_health").setLabel("Run Health Check").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel("Web Dashboard").setStyle(ButtonStyle.Link).setURL(DASHBOARD_URL)
  );

  await interaction.reply(withBrandFiles({ embeds: [embed], components: [row], ephemeral: true }));
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

async function ticketSetup(interaction, data) {
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
  saveData();

  const embed = successEmbed("Ticket setup saved", "Beacon tickets are ready. No log channel needed.")
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

  await interaction.reply(withBrandFiles({ embeds: [embed], components: [row], ephemeral: true }));
}

async function ticketPanel(interaction, data) {
  const channel = interaction.options.getChannel("channel");
  const embed = brandEmbed(data.settings.ticketPanelTitle, data.settings.ticketPanelMessage)
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

  const sent = await channel.send(withBrandFiles({ embeds: [embed], components: [row] }));
  await interaction.reply(withBrandFiles({ embeds: [successEmbed("Ticket panel posted", `Panel is live in ${channel}.\n[Open message](${sent.url})`)], ephemeral: true }));
}

async function ticketClose(interaction, data) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  if (!ticket) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("This command only works inside an open ticket.")], ephemeral: true }));
    return;
  }
  if (!isTicketStaff(interaction.member, data) && ticket.ownerId !== interaction.user.id) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("Only the ticket owner or support team can close this ticket.")], ephemeral: true }));
    return;
  }

  await closeTicket(interaction, data, interaction.options.getString("reason") || "No reason provided.");
}

async function ticketAdd(interaction, data) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  const user = interaction.options.getUser("user");
  if (!ticket) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("This command only works inside an open ticket.")], ephemeral: true }));
    return;
  }
  if (!isTicketStaff(interaction.member, data)) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("Only the support team can add members to tickets.")], ephemeral: true }));
    return;
  }

  await interaction.channel.permissionOverwrites.edit(user.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
  });
  await interaction.reply(withBrandFiles({ embeds: [successEmbed("Member added", `${user} can now see this ticket.`)] }));
}

async function ticketRemove(interaction, data) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  const user = interaction.options.getUser("user");
  if (!ticket) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("This command only works inside an open ticket.")], ephemeral: true }));
    return;
  }
  if (!isTicketStaff(interaction.member, data)) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("Only the support team can remove members from tickets.")], ephemeral: true }));
    return;
  }

  await interaction.channel.permissionOverwrites.edit(user.id, {
    ViewChannel: false,
    SendMessages: false,
  });
  await interaction.reply(withBrandFiles({ embeds: [successEmbed("Member removed", `${user} can no longer see this ticket.`)] }));
}

async function ticketRename(interaction, data) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  const name = cleanChannelName(interaction.options.getString("name"));
  if (!ticket) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("This command only works inside an open ticket.")], ephemeral: true }));
    return;
  }
  if (!isTicketStaff(interaction.member, data)) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("Only the support team can rename tickets.")], ephemeral: true }));
    return;
  }

  await interaction.channel.setName(name);
  ticket.name = name;
  saveData();
  await interaction.reply(withBrandFiles({ embeds: [successEmbed("Ticket renamed", `This ticket is now \`${name}\`.`)] }));
}

async function ticketInfo(interaction, data) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  if (!ticket) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("This command only works inside an open ticket.")], ephemeral: true }));
    return;
  }

  const created = Math.floor(new Date(ticket.createdAt).getTime() / 1000);
  const embed = brandEmbed("Ticket Info", ticket.subject || "No subject saved.")
    .addFields(
      { name: "Owner", value: `<@${ticket.ownerId}>`, inline: true },
      { name: "Status", value: ticket.status, inline: true },
      { name: "Opened", value: `<t:${created}:R>`, inline: true },
      { name: "Claimed by", value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Unclaimed", inline: true },
      { name: "Channel", value: `${interaction.channel}`, inline: true },
      { name: "Details", value: (ticket.details || "No details saved.").slice(0, 1024), inline: false }
    );

  await interaction.reply(withBrandFiles({ embeds: [embed], ephemeral: true }));
}

async function ticketStats(interaction, data) {
  const tickets = Object.values(data.tickets || {});
  const open = tickets.filter((ticket) => ticket.status === "open");
  const closed = tickets.filter((ticket) => ticket.status === "closed");
  const claimed = open.filter((ticket) => ticket.claimedBy);
  const unclaimed = open.filter((ticket) => !ticket.claimedBy);
  const newest = open
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  const embed = brandEmbed("Ticket Stats", "Current ticket workload without needing a log channel.")
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

  await interaction.reply(withBrandFiles({ embeds: [embed], ephemeral: true }));
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
      { name: "Ticket panel", value: `**${data.settings.ticketPanelTitle}**\n${data.settings.ticketPanelMessage.slice(0, 800)}`, inline: false },
      { name: "Ticket rules", value: data.settings.ticketPanelRules.slice(0, 800), inline: false },
      { name: "Ticket buttons", value: `${data.settings.ticketButtonLabel} / ${data.settings.ticketClaimButtonLabel} / ${data.settings.ticketCloseButtonLabel}`, inline: true },
      { name: "Ticket name format", value: `\`${data.settings.ticketNameFormat}\``, inline: true },
      { name: "Dashboard", value: DASHBOARD_URL, inline: false }
    );

  await interaction.reply(withBrandFiles({ embeds: [embed], ephemeral: true }));
}

async function status(interaction) {
  const uptime = formatUptime(process.uptime());
  const memory = process.memoryUsage();
  const memoryMb = Math.round(memory.rss / 1024 / 1024);
  const guildCount = client.guilds.cache.size;
  const memberCount = client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount || 0), 0);

  const embed = brandEmbed("Beacon Status", "Online and tracking community signals.")
    .addFields(
      { name: "Status", value: "Online", inline: true },
      { name: "Uptime", value: uptime, inline: true },
      { name: "Ping", value: `${client.ws.ping}ms`, inline: true },
      { name: "Servers", value: `${guildCount}`, inline: true },
      { name: "Visible members", value: `${memberCount}`, inline: true },
      { name: "RAM", value: `${memoryMb} MB`, inline: true },
      { name: "Node.js", value: process.version, inline: true },
      { name: "Presence", value: BOT_STATUS, inline: true }
    );

  await interaction.reply(withBrandFiles({ embeds: [embed], ephemeral: true }));
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

async function openTicket(interaction, data, subject, details) {
  const openTickets = Object.values(data.tickets || {}).filter((ticket) =>
    ticket.ownerId === interaction.user.id &&
    ticket.status === "open" &&
    interaction.guild.channels.cache.has(ticket.channelId)
  );

  if (openTickets.length >= data.settings.ticketMaxOpenPerUser) {
    const list = openTickets.map((ticket) => `<#${ticket.channelId}>`).join(", ");
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed(`You already have ${openTickets.length}/${data.settings.ticketMaxOpenPerUser} open ticket(s): ${list}`)], ephemeral: true }));
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
      id: client.user.id,
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
  saveData();

  const description = renderTemplate(data.settings.ticketWelcomeMessage, {
    user: interaction.user,
    guild: interaction.guild,
  });

  const embed = brandEmbed(data.settings.ticketWelcomeTitle, description)
    .addFields(
      { name: "Owner", value: `${interaction.user}`, inline: true },
      { name: "Status", value: "Open", inline: true },
      { name: "Team", value: data.settings.ticketSupportRoleId ? `<@&${data.settings.ticketSupportRoleId}>` : "No support role set", inline: true },
      { name: "Subject", value: subject.slice(0, 1024), inline: false },
      { name: "Details", value: details.slice(0, 1024), inline: false },
      { name: "Controls", value: `${data.settings.ticketClaimButtonLabel} marks ownership for staff\n${data.settings.ticketCloseButtonLabel} closes the channel${data.settings.ticketDmTranscript ? " and DMs a transcript" : ""}`, inline: false }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_claim").setLabel(data.settings.ticketClaimButtonLabel.slice(0, 80)).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket_close").setLabel(data.settings.ticketCloseButtonLabel.slice(0, 80)).setStyle(ButtonStyle.Danger)
  );

  await channel.send(withBrandFiles({
    content: data.settings.ticketSupportRoleId ? `<@&${data.settings.ticketSupportRoleId}> ${interaction.user}` : `${interaction.user}`,
    embeds: [embed],
    components: [row],
    allowedMentions: { users: [interaction.user.id], roles: data.settings.ticketSupportRoleId ? [data.settings.ticketSupportRoleId] : [] },
  }));

  await interaction.reply(withBrandFiles({ embeds: [successEmbed("Ticket opened", `Your ticket is ready: ${channel}`)], ephemeral: true }));
}

async function claimTicket(interaction, data) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  if (!ticket) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("This button only works inside an open ticket.")], ephemeral: true }));
    return;
  }
  if (!isTicketStaff(interaction.member, data)) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("Only the support team can claim tickets.")], ephemeral: true }));
    return;
  }

  ticket.claimedBy = interaction.user.id;
  saveData();

  const embed = successEmbed("Ticket claimed", `${interaction.user} is handling this ticket now.`)
    .addFields(
      { name: "Owner", value: `<@${ticket.ownerId}>`, inline: true },
      { name: "Claimed by", value: `${interaction.user}`, inline: true }
    );

  await interaction.reply(withBrandFiles({ embeds: [embed] }));
}

async function closeTicket(interaction, data, reason) {
  const ticket = ticketForChannel(data, interaction.channel.id);
  if (!ticket) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("This only works inside an open ticket.")], ephemeral: true }));
    return;
  }
  if (!isTicketStaff(interaction.member, data) && ticket.ownerId !== interaction.user.id) {
    await interaction.reply(withBrandFiles({ embeds: [errorEmbed("Only the ticket owner or support team can close this ticket.")], ephemeral: true }));
    return;
  }

  const closeText = renderTemplate(data.settings.ticketCloseMessage, {
    user: interaction.user,
    guild: interaction.guild,
  });
  const transcript = await buildTranscript(interaction.channel);
  const transcriptFile = new AttachmentBuilder(transcript, { name: `${interaction.channel.name}-transcript.txt` });

  ticket.status = "closed";
  ticket.closedBy = interaction.user.id;
  ticket.closedAt = new Date().toISOString();
  ticket.closeReason = reason;
  saveData();

  const logEmbed = brandEmbed("Ticket closed", closeText)
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
      await owner.send(withBrandFiles({ embeds: [logEmbed], files: [transcriptFile] })).catch(() => null);
    }
  }

  await interaction.reply(withBrandFiles({ embeds: [successEmbed("Ticket closing", data.settings.ticketDmTranscript ? "Transcript DM attempted. This channel will be deleted in 5 seconds." : "This channel will be deleted in 5 seconds.")] }));
  setTimeout(() => interaction.channel.delete(`Ticket closed by ${interaction.user.tag}`).catch(() => null), 5000);
}

async function handleModal(interaction) {
  const data = guildData(interaction.guild.id);

  if (interaction.customId === "ticket_open_modal") {
    const subject = interaction.fields.getTextInputValue("ticket_subject");
    const details = interaction.fields.getTextInputValue("ticket_details");
    await openTicket(interaction, data, subject, details);
  }
}

async function handleButton(interaction) {
  const data = guildData(interaction.guild.id);

  if (interaction.customId === "beacon_refresh_health") {
    return health(interaction, data);
  }

  if (interaction.customId === "beacon_refresh_dashboard") {
    return dashboard(interaction, data);
  }

  if (interaction.customId === "beacon_refresh_settings") {
    return settings(interaction, data);
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
    await showTicketModal(interaction, data);
    return;
  }

  if (interaction.customId === "ticket_claim") {
    await claimTicket(interaction, data);
    return;
  }

  if (interaction.customId === "ticket_close") {
    await closeTicket(interaction, data, "Closed from ticket controls.");
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

async function log(guild, title, description) {
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

registerCommands()
  .then(() => client.login(TOKEN))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
