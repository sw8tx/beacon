const {
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");

const MAX_PURGE_COUNT = 99;
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

const purgeCommands = [
  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete up to 99 recent messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt
        .setName("count")
        .setDescription("How many messages to delete, max 99")
        .setMinValue(1)
        .setMaxValue(MAX_PURGE_COUNT)
        .setRequired(true)
    )
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
    .addIntegerOption((opt) =>
      opt
        .setName("count")
        .setDescription("Max messages to delete after it, default 99")
        .setMinValue(1)
        .setMaxValue(MAX_PURGE_COUNT)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("purge-user")
    .setDescription("Delete recent messages sent by one user.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((opt) => opt.setName("user").setDescription("User to clean").setRequired(true))
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("Messages to scan, max 99").setMinValue(1).setMaxValue(MAX_PURGE_COUNT).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge-bots")
    .setDescription("Delete recent messages sent by bots.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("Messages to scan, max 99").setMinValue(1).setMaxValue(MAX_PURGE_COUNT).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge-humans")
    .setDescription("Delete recent messages sent by humans.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("Messages to scan, max 99").setMinValue(1).setMaxValue(MAX_PURGE_COUNT).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge-links")
    .setDescription("Delete recent messages that contain links.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("Messages to scan, max 99").setMinValue(1).setMaxValue(MAX_PURGE_COUNT).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge-invites")
    .setDescription("Delete recent messages that contain Discord invites.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("Messages to scan, max 99").setMinValue(1).setMaxValue(MAX_PURGE_COUNT).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge-images")
    .setDescription("Delete recent messages that contain images or files.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("Messages to scan, max 99").setMinValue(1).setMaxValue(MAX_PURGE_COUNT).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge-embeds")
    .setDescription("Delete recent messages that contain embeds.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("Messages to scan, max 99").setMinValue(1).setMaxValue(MAX_PURGE_COUNT).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge-match")
    .setDescription("Delete recent messages that contain specific text.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((opt) =>
      opt.setName("text").setDescription("Text to match").setMaxLength(120).setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("Messages to scan, max 99").setMinValue(1).setMaxValue(MAX_PURGE_COUNT).setRequired(true)
    ),
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
  if (command === "purge-match") {
    const text = interaction.options.getString("text", true).toLowerCase();
    return (message) => (message.content || "").toLowerCase().includes(text);
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

async function deleteMessages(interaction, messages, ui, label) {
  const list = Array.isArray(messages) ? messages : [...messages.values()];
  const deletable = list.filter(isBulkDeletable);
  if (!deletable.length) {
    await interaction.editReply(ui.withBrandFiles({ embeds: [ui.errorEmbed("No matching messages could be deleted. Discord blocks bulk deletion for messages older than 14 days.")] }));
    return;
  }

  const deleted = await interaction.channel.bulkDelete(deletable, true);
  const skipped = list.length - deleted.size;
  const details = skipped > 0
    ? `Deleted **${deleted.size}** message(s). Skipped **${skipped}** older or unavailable message(s).`
    : `Deleted **${deleted.size}** message(s).`;

  await interaction.editReply(ui.withBrandFiles({ embeds: [ui.successEmbed(label, details)] }));
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
    await deleteMessages(interaction, fetched.first(limit), ui, "Purge after complete");
    return true;
  }

  const count = clampCount(interaction.options.getInteger("count", true));
  const fetched = await interaction.channel.messages.fetch({ limit: Math.min(100, count) });
  const filtered = fetched.filter(purgeFilter(command, interaction)).first(count);
  await deleteMessages(interaction, filtered, ui, command === "purge" ? "Purge complete" : `${command.replace("purge-", "Purge ")} complete`);
  return true;
}

module.exports = {
  purgeCommands,
  handlePurgeCommand,
};
