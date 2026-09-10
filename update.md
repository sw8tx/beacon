# Beacon Bot — Release Notes

Release Notes: 10 September 2026

## New commands

This update adds new welcome, sticky, Automod, moderation and audit tools.

## Welcome panels

Welcome messages now use a Components V2 panel with custom text, an uploaded thumbnail and one or two buttons.

- `/welcome-configure` — Configure the welcome channel, title, message, thumbnail, first button and second button.
- `/welcome-create` — Post the configured V2 welcome panel.
- `/welcome-preview` — Preview the panel privately before posting it.
- `/welcome-remove` — Disable automatic welcome messages without deleting the saved configuration.

Supported placeholders:

- `{user}` — Mentions the member who joined.
- `{servermember}` — Mentions the new server member.
- `{membercount}` — Shows the current member count.
- `{server}` — Shows the server name.

The first and second button can each open their own HTTPS link. Existing welcome options remain available alongside the new link options.

## Sticky Notes

Sticky panels stay at the bottom of a channel. When a new message arrives, Beacon removes the previous sticky and posts it again below the latest message.

- `/sticky-create` — Create a V2 sticky with title, message, thumbnail and an optional link button.
- `/sticky-configure` — Edit an existing sticky and update the live panel.
- `/sticky-remove` — Remove the saved sticky and its live message.
- `/sticky-list` — Browse the private sticky media library.

Sticky refreshes are queued per channel to prevent duplicate panels. The sticky ID is shown in the footer.

## Automod

Automod can watch every text channel or a selected channel. Spam, links, images/files and spam pings can be configured independently.

- `/automod-configure` — Set the channel, rules, action, duration and enabled state.
- `/automod-enable` — Enable the saved Automod configuration.
- `/automod-disable` — Disable Automod without clearing its settings.
- `/automod-status` — Show the current Automod policy privately to staff.

When Automod removes a message, the member receives a short warning DM and a ten-second timeout. The warning explains that they should stop. If the timeout is already active, Beacon does not endlessly extend it on every message.

## Moderation timeout

- `/timeout` — Timeout a member after confirmation with a configurable duration and optional branded DM.

The timeout DM includes the server name, server icon, duration and reason. The `dm` option can be disabled when a private notification is not wanted.

## Central audit logging

- `/log-setup` — Select the central audit channel and enable or disable logging.

The new audit log records command usage, bans, unbans, timeouts, Automod actions, ticket events, ticket transcripts, DMs, purges, message deletions and sticky reposts. Each entry includes a readable `.txt` audit file.

Thanks for using Beacon Bot.

https://beacon-bot.site/
