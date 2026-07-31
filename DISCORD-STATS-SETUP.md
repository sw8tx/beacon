# Discord Stats Setup

Set these in Cloudflare Pages for the `beacon-bot.site` project.

## Environment variable

Optional name:

```txt
STATS_SECRET
```

Value: the same secret used on the Discord bot host. When this is omitted, the bot uses `DISCORD_TOKEN` and Pages verifies it against `DISCORD_BOT_TOKEN`.

## D1 binding

Create the `beacon-status` D1 database, apply `status-schema.sql`, and bind it to Pages with this variable name:

```txt
STATUS_DB
```

The website API stores the latest heartbeat and the 30-day history in D1. `DISCORD_STATS` remains an optional fallback binding.

## Endpoint

The Discord bot posts to:

```txt
https://beacon-bot.site/api/discord-stats
```

The public website reads from:

```txt
/api/discord-stats
```

The bot sends a heartbeat immediately when Discord is ready and then every 30 seconds. The public status page refreshes every five seconds.
