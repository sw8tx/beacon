const fs = require("fs");
const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  TextDisplayBuilder,
} = require("discord.js");

const STATE_FILE = path.join(__dirname, "announcement-state.json");
const ANNOUNCEMENT_VERSION = 2;
const EMOJI = "<:beacon:1549063970734735422>";
const SUPPORT_URL = "https://discord.gg/chWbkz8Gfj";
const SITE_URL = "https://beacon-bot.site/";
const STATUS_URL = "https://status.beacon-bot.site/";

function loadState() {
  try {
    const value = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

let state = loadState();

function saveState() {
  const temporaryFile = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(state, null, 2));
  fs.renameSync(temporaryFile, STATE_FILE);
}

function announcementContainer() {
  return new ContainerBuilder()
    .setAccentColor(0xffb800)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${EMOJI} Beacon security update\n\n` +
        "We want to be transparent about a recent security incident involving Beacon. " +
        "For a limited period of time, an account connected to the Beacon team was compromised. " +
        "The incident has been contained and the affected account has been removed from the team and banned.\n\n" +
        `${EMOJI} **What happened**\n` +
        "An unauthorized person gained access to the affected account and used that access in a way that did not represent Beacon or its team. " +
        "We are treating this seriously and have reviewed the relevant access, account activity and connected systems.\n\n" +
        `${EMOJI} **How we fixed it**\n` +
        "The compromised account was disabled, removed from the team and banned. Access was reviewed and additional protection measures were introduced, including stronger credential handling, tighter permissions and improved monitoring. " +
        "We are also continuing to review logs and connected services for anything unusual.\n\n" +
        `${EMOJI} **What you should do**\n` +
        "Please ignore suspicious messages, links or direct messages claiming to be from Beacon. Do not share passwords, tokens or recovery codes. " +
        "If you noticed anything suspicious, report it through our support server.\n\n" +
        `${EMOJI} **Remaining risks**\n` +
        "No active compromise is currently known. As with any online service, phishing, stolen sessions and impersonation remain possible risks. " +
        "We will continue monitoring the situation and will publish further updates if anything important changes.\n\n" +
        "We are sorry for the concern and disruption this may have caused. Thank you for your patience while we strengthen Beacon's security."
      ),
      new TextDisplayBuilder().setContent(
        `Updates and help: [Support Server](${SUPPORT_URL})`
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("View Site").setStyle(ButtonStyle.Link).setURL(SITE_URL),
        new ButtonBuilder().setLabel("Support").setStyle(ButtonStyle.Link).setURL(SUPPORT_URL),
        new ButtonBuilder().setCustomId("beacon_announcement_ping").setLabel("Check ping").setStyle(ButtonStyle.Secondary)
      )
    );
}

function isWritableAnnouncementChannel(guild, channel) {
  if (!channel || typeof channel.send !== "function") return false;
  if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return false;
  if (typeof channel.isThread === "function" && channel.isThread()) return false;

  const me = guild.members.me;
  const permissions = me && typeof channel.permissionsFor === "function"
    ? channel.permissionsFor(me)
    : null;
  return Boolean(
    channel.isTextBased?.() &&
    permissions?.has(PermissionFlagsBits.ViewChannel) &&
    permissions.has(PermissionFlagsBits.SendMessages)
  );
}

async function candidateChannels(guild) {
  // Refresh the channel objects. On startup the cache can contain partial or
  // stale entries, which do not always expose TextChannel#send yet.
  const fetched = await guild.channels.fetch().catch(() => null);
  const collection = fetched || guild.channels.cache;
  return [...collection.values()].filter((channel) => isWritableAnnouncementChannel(guild, channel));
}

async function handleExisting(guild, record) {
  if (record.version !== ANNOUNCEMENT_VERSION) {
    if (record.channelId && record.messageId) {
      const oldChannel = await guild.channels.fetch(record.channelId).catch(() => null);
      const oldMessage = oldChannel?.messages
        ? await oldChannel.messages.fetch(record.messageId).catch(() => null)
        : null;
      if (oldMessage) await oldMessage.delete().catch(() => null);
    }
    delete state[guild.id];
    saveState();
    return false;
  }

  if (record.deleted || !record.channelId || !record.messageId) return true;
  const channel = guild.channels.cache.get(record.channelId) || await guild.channels.fetch(record.channelId).catch(() => null);
  if (!channel?.isTextBased()) return false;
  const message = await channel.messages.fetch(record.messageId).catch(() => null);
  if (message) return true;

  // The announcement was deleted. Remember that it was already posted and never repost it.
  state[guild.id] = { ...record, deleted: true, deletedAt: new Date().toISOString() };
  saveState();
  return true;
}

async function postAnnouncement(guild) {
  const record = state[guild.id];
  if (record && await handleExisting(guild, record)) return false;

  const channels = await candidateChannels(guild);
  if (!channels.length) {
    console.warn(`[announcement] No writable text channel in ${guild.name} (${guild.id})`);
    return false;
  }

  let channel = null;
  let message = null;
  for (const candidate of channels) {
    // Fetch the individual channel once more so the send call always uses a
    // fully hydrated Discord.js channel object.
    const freshChannel = await guild.channels.fetch(candidate.id).catch(() => null);
    if (!isWritableAnnouncementChannel(guild, freshChannel)) continue;

    try {
      message = await freshChannel.send({
        components: [announcementContainer()],
        flags: MessageFlags.IsComponentsV2,
      });
      channel = freshChannel;
      break;
    } catch (error) {
      console.warn(`[announcement] Could not post in ${guild.name} #${freshChannel.name || freshChannel.id}: ${error.message}`);
    }
  }

  if (!message || !channel) {
    console.error(`[announcement] Could not post in any writable channel in ${guild.name} (${guild.id})`);
    return false;
  }

  state[guild.id] = {
    version: ANNOUNCEMENT_VERSION,
    channelId: channel.id,
    messageId: message.id,
    postedAt: new Date().toISOString(),
    deleted: false,
  };
  saveState();
  console.log(`[announcement] Posted once in ${guild.name} #${channel.name}`);
  return true;
}

async function postAnnouncements(client) {
  for (const guild of client.guilds.cache.values()) {
    await postAnnouncement(guild).catch((error) => {
      console.error(`[announcement] Failed for ${guild.name} (${guild.id}): ${error.message}`);
    });
  }
}

async function handleAnnouncementButton(interaction, client) {
  if (!interaction.isButton() || interaction.customId !== "beacon_announcement_ping") return false;
  const ping = Math.max(0, Math.round(client.ws.ping));
  await interaction.reply({
    components: [new ContainerBuilder().setAccentColor(0xffb800).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${EMOJI} Beacon status\n\nBot latency: **${ping} ms**\nStatus: **online**\n[Open status page](${STATUS_URL})`)
    )],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
  return true;
}

module.exports = { postAnnouncements, postAnnouncement, handleAnnouncementButton };
