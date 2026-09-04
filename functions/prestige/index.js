const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#050505" />
    <meta name="description" content="Beacon Prestige is a lifetime upgrade for Discord communities that want premium growth tools." />
    <title>Beacon Prestige | Lifetime Premium</title>
    <link rel="icon" type="image/png" href="/assets/prestige-logo.png?v=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/prestige.css?v=4" />
  </head>
  <body>
    <nav class="prestige-nav" aria-label="Beacon Prestige navigation">
      <a class="prestige-brand" href="https://beacon-bot.site/">
        <img src="/assets/prestige-logo.png?v=1" width="34" height="34" alt="" />
        <span>Beacon Prestige</span>
      </a>
      <div class="prestige-nav__links">
        <a class="prestige-nav__button" href="https://beacon-bot.site/">Back to Beacon</a>
      </div>
    </nav>

    <main>
      <section class="server-strip" aria-label="Featured servers using Beacon">
        <p>Actual servers running Beacon Prestige</p>
        <div class="marquee marquee--left">
          <div class="marquee__track" data-server-track="primary"></div>
        </div>
        <div class="marquee marquee--right">
          <div class="marquee__track" data-server-track="secondary"></div>
        </div>
      </section>

      <section class="prestige-hero">
        <div class="hero-copy">
          <h1>Get more out of every Discord server you run.</h1>
          <p>Higher limits, exclusive tools and quality-of-life upgrades for communities that have outgrown the free tier.</p>
        </div>

        <aside class="prestige-showcase" aria-label="Beacon Prestige plan">
          <div class="logo-orbit">
            <img src="/assets/prestige-logo.png?v=1" width="320" height="320" alt="Beacon Prestige logo" />
          </div>
          <article class="price-card is-coming-soon" id="plan">
            <div class="coming-soon-overlay" role="status"><span>Coming Soon</span><small>The Prestige checkout is being prepared.</small></div>
            <div class="price-card-content">
            <div class="plan-head">
              <div>
                <h2>Prestige</h2>
                <p>Lifetime premium for one server.</p>
              </div>
              <span>Lifetime</span>
            </div>
            <div class="price"><strong>$9.99</strong><small>one time</small></div>
            <a class="buy-button" href="/api/auth/discord/login" aria-disabled="true" tabindex="-1">Get Prestige</a>
            <ul>
              <li>Prestige leaderboard with custom public link.</li>
              <li>Exclusive prestige profile and leaderboard features.</li>
              <li>Premium rank visuals and profile badges.</li>
              <li>Higher XP limits and faster community progression.</li>
              <li>Priority setup help for your server.</li>
            </ul>
            <p class="purchase-note">Price: $9.99 one-time for one server. The purchase flow will show the final total price, provider, payment terms, withdrawal information and cancellation/support options before payment. See the <a href="/tos/">Terms of Use</a> and <a href="/privacy/">Privacy Policy</a>.</p>
            </div>
          </article>
        </aside>
      </section>
    </main>
    <script src="/prestige.js?v=2"></script>
  </body>
</html>
`;

export function onRequest() {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
