# Beacon Bot

## Website deployment (Cloudflare Pages)

Run `npm ci` and `npm run build:web`. Deploy only the generated `dist/` directory
with `npm run deploy:web`, never the repository root or an old deployment ZIP.
The build explicitly copies public assets and compiles Pages Functions into
`dist/_worker.js`. This worker is server-side code, not a downloadable asset.
For Git integration, use build command `npm run build:web` and output `dist`.
The bot still runs separately with `npm start`; a website deployment does not start it.

After deploying, verify `/api/discord-stats` returns JSON and
`/api/auth/discord/login` redirects to Discord, not the homepage.
Verify `/bot.js`, `/env.example`, `/.env`, `/package.json`, `/functions/`,
`/app.sjs` and deployment ZIP paths return 404. Public browser scripts such as
`/app.js` must remain accessible; hiding them would break the website.

Preserve the production `STATUS_DB` / `DISCORD_STATS` bindings and OAuth secrets.
The Discord redirect URI must be `https://beacon-bot.site/api/auth/discord/callback`.
If sensitive files were publicly served, rotate affected credentials separately
and remove obsolete deployments; blocking new requests cannot revoke downloaded copies.

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

## Prestige system

- Members earn 15-25 XP from messages, with a 60 second cooldown per user.
- `/rank` shows level, XP, prestige and leaderboard position.
- `/leaderboard` shows the top 10 members by prestige, level and XP.
- `/prestige` resets a member to level 1 after level 25 and adds one prestige rank.
