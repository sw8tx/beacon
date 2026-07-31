# Beacon Bot

## Start locally

1. Copy .env.example to .env
2. Fill in your Discord bot token and secret values
3. Run `npm install`
4. Run `npm start`

## Required environment variables

- DISCORD_TOKEN
- DISCORD_CLIENT_ID
- DISCORD_CLIENT_SECRET (Cloudflare Pages secret for Discord OAuth)
- DISCORD_BOT_TOKEN (Cloudflare Pages secret; the bot token used to join authenticated users to the Support Server)
- DISCORD_SUPPORT_GUILD_ID (Cloudflare Pages secret; the Support Server ID)
- AUTH_SESSION_SECRET (Cloudflare Pages secret; use a long random value)
- STATS_SECRET (optional when the bot and Pages use the same Discord bot token)
- DEV_GUILD_ID (optional)
- DASHBOARD_URL (optional)
- STATS_SYNC_ENDPOINT (optional)
- STATS_SYNC_INTERVAL_MS (optional)
- BOT_STATUS (optional)
- BOT_STATUS_TYPE (optional)
