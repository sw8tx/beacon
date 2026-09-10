# Beacon Bot — Release Notes

Release Notes: 10 September 2026

## Welcome panels

Welcome messages now use a clean Components V2 panel with a thumbnail, custom text and one or two buttons. Button URLs open directly when a new member clicks them.

- `/welcome-configure` — Set the channel, title, message, thumbnail, first button and second button.
- `/welcome-create` — Post the configured welcome panel in the selected channel.
- `/welcome-preview` — Preview the panel privately before posting it.
- `/welcome-remove` — Disable automatic welcome messages without losing the saved configuration.

Supported placeholders:

- `{user}` — Mentions the member who joined.
- `{servermember}` — Mentions the new member in the welcome message.
- `{membercount}` — Shows the current server member count.
- `{server}` — Shows the server name.

Both `{server}` and `{Server}` are accepted. Thumbnail uploads support PNG, JPG, GIF and WEBP files. Button links must use HTTPS.

## Sticky Notes

Sticky panels stay at the bottom of the channel. When a member sends a new message, Beacon deletes the previous sticky message and posts the panel again below the latest message. Refreshes are queued per channel so a burst of messages cannot create duplicate panels.

- `/sticky-create` — Create a V2 sticky with title, message, thumbnail and an optional link button.
- `/sticky-list` — Open the private sticky media library and choose a panel.
- `/sticky-configure` — Edit a saved sticky and update the live panel.
- `/sticky-remove` — Remove the saved sticky and delete its live message.

The sticky ID is shown in the footer of the panel. It is not inserted into the main message text.

## Automod

Automod can watch every text channel or a selected channel. Rules can be enabled independently for spam, links, images/files and spam pings.

- `/automod-configure` — Select the channel, rules, action, duration and enabled state.
- `/automod-enable` — Enable the saved Automod configuration.
- `/automod-disable` — Disable Automod without clearing its settings.
- `/automod-status` — Show the current Automod policy privately to staff.

When a message is removed, the member receives a short warning DM and a ten-second timeout. The DM explains that they should stop before another violation is handled. If the timeout is already active, Beacon does not endlessly extend it on every message. Stronger configured actions remain available: delete, timeout, kick, ban or log only.

## Central audit logging

`/log-setup` creates one central audit destination for the server.

- `/log-setup channel:#mod-logs enabled:true` — Enable logging in a selected channel.
- Commands include the command name and source channel.
- Bans, unbans and timeouts include the target and reason.
- Automod actions include the rule, channel and action taken.
- Tickets include lifecycle events, transcripts and deletion events.
- Sent moderation and Automod DMs are recorded as delivery events.
- Purges and other message deletions are recorded.
- Every audit entry includes a readable `.txt` file.

## Moderation DMs

`/ban`, `/ban-id` and `/timeout` now have a `dm` option. When enabled, the target receives a short Beacon message with the server name, server icon, action, duration and reason. A closed DM never cancels a successful moderation action.

- `/ban` — Ban a server member after confirmation.
- `/ban-id` — Ban a Discord user ID after confirmation, even if they are not currently in the server.
- `/timeout` — Timeout a member for 10 seconds up to 28 days after confirmation.
- `/unban` — Unban a selected user.
- `/unban-id` — Unban a user by Discord ID.

## Tickets

Ticket panels support custom layouts, multiple buttons, dropdown choices, support roles, limits, transcripts, archives, ratings and logs.

- `/ticketsetup` — Configure ticket categories, roles, labels, limits, transcripts and archive behavior.
- `/ticketpanel` — Post the configured ticket panel.
- `/ticket priority` — Change the priority of the current ticket.
- `/ticket transfer` — Transfer a ticket to another staff member.
- `/ticket rating` — Request a rating from the ticket owner.
- `/ticket archive` — Archive a ticket instead of deleting it.
- `/ticketclose` — Close a ticket and create a transcript.
- `/ticketadd` and `/ticketremove` — Manage ticket members.
- `/ticketrename` — Rename the current ticket.
- `/ticketinfo` and `/ticketstats` — Inspect ticket ownership and workload.

## Community tools

- `/onboarding` — Post a button-based onboarding panel.
- `/dmwelcome` — Enable or disable join DMs and customize their message.
- `/announce` — Post a clean announcement in a selected channel.
- `/event` — Create an RSVP event panel.
- `/rolepanel` — Create a selectable role panel.
- `/member` — View a member profile.
- `/serverinfo` — Browse members, channels, roles, bots, emojis and security settings.
- `/rank` and `/leaderboard` — View progression and prestige standings.
- `/badges` — Browse the Beacon badge collection.
- `/quickstart` — Show the recommended setup order for a new server.
- `/setup` — Configure welcome, log, onboarding and member-role defaults.
- `/dashboard` — Open a live server snapshot.
- `/settings` — View the current Beacon configuration.
- `/status` — View uptime, latency and service information.
- `/dmca-info` — Show the Beacon domain-verification guidance.

## Emoji tools

- `/emoji-steal` — Copy one custom emoji into the server after confirmation.
- `/emoji-steal-bulk` — Copy multiple custom emojis in one controlled action.

## Polls and cleanup

- `/poll-create` — Create a live Components V2 poll with vote counts and an end time.
- `/poll-edit` — Edit an open poll.
- `/poll-delete` — Remove a poll.
- `/purge` — Delete recent messages with filters for users, bots, links, invites, files, embeds, mentions and text.

## Security tools

- `/honeypot-setup` — Configure a protected decoy channel.
- `/honeypot-configure` — Change the channel, status, action and message cleanup.
- `/honeypot-disable` — Disable the honeypot without deleting its settings.
- `/health` — View the server health score and recommended setup steps.

Thanks for using Beacon Bot.

https://beacon-bot.site/
