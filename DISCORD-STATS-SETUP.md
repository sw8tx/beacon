# Discord Stats Setup

Set these in Cloudflare Pages for the `beacon-bot.site` project.

## Environment variable

Name:

```txt
STATS_SECRET
```

Value: the same secret used on the Discord bot host.

## KV binding

Create a KV namespace and bind it to Pages with this variable name:

```txt
DISCORD_STATS
```

The website API stores the latest bot payload at the key `latest`.

## Endpoint

The Discord bot posts to:

```txt
https://beacon-bot.site/api/discord-stats
```

The public website reads from:

```txt
/api/discord-stats
```
