const {
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");

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

module.exports = {
  purgeCommands,
  handlePurgeCommand,
};
