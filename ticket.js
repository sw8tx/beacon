const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

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

function renderTemplate(template, context) {
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

  const description = renderTemplate(data.settings.ticketWelcomeMessage, {
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
  const description = renderTemplate(data.settings.ticketWelcomeMessage, {
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

module.exports = {
  cleanChannelName,
  ticketSetup,
  ticketPanel,
  ticketClose,
  ticketAdd,
  ticketRemove,
  ticketRename,
  ticketInfo,
  ticketStats,
  showTicketModal,
  openTicket,
  claimTicket,
  closeTicket,
};
