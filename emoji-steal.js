const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require("discord.js");

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

module.exports = {
  prepareEmojiSteal,
  confirmEmojiSteal,
  cancelEmojiSteal,
};
