const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <title>Beacon Commands</title>
    <link rel="icon" type="image/png" href="/assets/beacon-logo.png?v=92" />
    <link rel="stylesheet" href="/commands.css?v=2" />
  </head>
  <body>
    <nav class="commands-nav" aria-label="Beacon commands navigation">
      <a class="commands-brand" href="https://beacon-bot.site/">
        <img src="/assets/beacon-logo.png?v=92" width="34" height="34" alt="" />
        <span>Beacon</span>
      </a>
      <a class="commands-back" href="https://beacon-bot.site/">Back to Beacon</a>
    </nav>
    <main class="commands-shell">
      <aside class="commands-sidebar" aria-label="Command sections">
        <div class="sidebar-product">
          <img src="/assets/beacon-logo.png?v=92" width="28" height="28" alt="" />
          <div>
            <strong>Beacon</strong>
            <span>Commands</span>
          </div>
        </div>
        <nav class="sidebar-list">
          <p>Server</p>
          <a href="#administration"><span>#</span>Administration</a>
          <a href="#verification"><span>#</span>Verification</a>
          <a href="#raid"><span>#</span>Raid Protection</a>
          <p>Growth</p>
          <a href="#tracking"><span>#</span>Invite Tracking</a>
          <a href="#analytics"><span>#</span>Analytics</a>
          <a href="#leaderboard"><span>#</span>Leaderboard</a>
          <p>Messages</p>
          <a href="#join"><span>#</span>Join Messages</a>
          <a href="#leave"><span>#</span>Leave Messages</a>
          <p>Tickets</p>
          <a class="is-active" href="#tickets"><span>#</span>Tickets</a>
          <a href="#ticketsetup"><span>#</span>Setup</a>
          <a href="#ticketpanel"><span>#</span>Panels</a>
          <p>Engagement</p>
          <a href="#counting"><span>#</span>Message Counting</a>
          <a href="#giveaways"><span>#</span>Giveaways</a>
        </nav>
      </aside>
      <section class="commands-doc" id="tickets">
        <p class="doc-kicker">Tickets</p>
        <h1>Ticket Commands</h1>
        <p class="doc-lead">Hier ist kurz das Ticket-System. Du stellst einmal alles ein, postest ein Panel, und User koennen dann private Support-Tickets oeffnen.</p>
        <div class="doc-panel">
          <h2>Wie es laeuft</h2>
          <p>Beacon fragt beim Oeffnen kurz Subject und Details ab. Danach erstellt der Bot einen privaten Channel fuer den User und dein Team. Kein wildes DM-Chaos, alles sauber in einem Ticket.</p>
        </div>
        <div class="command-list">
          <article id="ticketsetup" class="command-card"><div><code>/ticketsetup</code><p>Passt dein Ticket-System an. Also Support-Rolle, Texte, Button, Limits und wie der Channel heissen soll.</p></div><span>+17 Optionen</span></article>
          <article id="ticketpanel" class="command-card"><div><code>/ticketpanel</code><p>Postet das Ticket-Panel in den Channel. Da klicken User auf Open Ticket.</p></div><span>Panel</span></article>
          <article class="command-card"><div><code>/ticketadd</code><p>Fuegt jemanden zum aktuellen Ticket dazu, falls noch jemand mit reinschauen soll.</p></div><span>Staff</span></article>
          <article class="command-card"><div><code>/ticketclose</code><p>Schliesst das Ticket und erstellt einen Transcript, damit nichts verloren geht.</p></div><span>Close</span></article>
          <article class="command-card"><div><code>/ticketinfo</code><p>Zeigt dir Details zum aktuellen Ticket, also wer es geoeffnet hat und was drin ist.</p></div><span>Info</span></article>
        </div>
        <section class="options-block" aria-labelledby="setup-options">
          <h2 id="setup-options">/ticketsetup Optionen</h2>
          <p>Die wichtigsten Felder, die du beim Setup setzen kannst:</p>
          <div class="option-grid">
            <code>support_role</code><code>panel_title</code><code>panel_message</code><code>panel_rules</code><code>button_label</code><code>claim_label</code><code>close_label</code><code>welcome_title</code><code>welcome_message</code><code>name_format</code><code>close_message</code><code>subject_label</code><code>details_label</code><code>details_placeholder</code><code>max_open</code><code>dm_transcript</code><code>accent_color</code>
          </div>
        </section>
        <section class="preview-block" aria-label="Ticket panel preview">
          <h2>Panel Beispiel</h2>
          <div class="discord-preview">
            <div class="preview-logo"><img src="/assets/beacon-logo.png?v=92" width="36" height="36" alt="" /></div>
            <div class="preview-card">
              <strong>Beacon</strong>
              <h3>Need help?</h3>
              <p>Open a private ticket and the team will pick it up as soon as possible.</p>
              <b>Before you open one</b>
              <p>Use tickets fuer Support, Reports oder private Fragen. Bitte keine doppelten Tickets.</p>
              <button type="button">Open Ticket</button>
            </div>
          </div>
        </section>
      </section>
    </main>
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
