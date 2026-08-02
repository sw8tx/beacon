const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <title>Beacon Commands</title>
    <link rel="icon" type="image/png" href="/assets/beacon-logo.png?v=92" />
    <link rel="stylesheet" href="/commands.css?v=5" />
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
        <nav class="sidebar-list">
          <a class="is-active" href="#tickets"><span>#</span>Tickets</a>
          <a href="#emoji-steal"><span>#</span>Emoji Steal</a>
        </nav>
      </aside>
      <section class="commands-doc" id="tickets">
        <h1>Ticket Commands</h1>
        <p class="doc-lead">Set up a clean support flow for your server. Configure the panel once, let members open private tickets, and keep every support case in one place. This is made for normal support, reports, orders, appeals, or anything that should not happen in public chat.</p>
        <div class="doc-panel">
          <h2>How it works</h2>
          <p>When someone opens a ticket, Beacon asks for a short subject and details, then creates a private channel for the member and your staff team. Staff can claim the ticket, add another person if needed, and close it when the issue is done. The close action can also create a transcript, so the important stuff is not lost.</p>
        </div>
        <section class="flow-grid" aria-label="Ticket flow"><article><span>1</span><h2>Configure</h2><p>Use <code>/ticketsetup</code> to set the support role, panel text, modal labels, open limit, transcript behavior, and the color style.</p></article><article><span>2</span><h2>Post panel</h2><p>Use <code>/ticketpanel</code> in the channel where members should open tickets. Beacon posts the embed and the button.</p></article><article><span>3</span><h2>Handle ticket</h2><p>Staff can claim, add users, check ticket info, and close the channel once the support case is finished.</p></article></section>
        <div class="command-list">
          <article id="ticketsetup" class="command-card"><div><code>/ticketsetup</code><p>Customize the ticket system: support role, panel text, button labels, limits, transcripts, channel names, and more.</p></div><span>+17 options</span></article>
          <article id="ticketpanel" class="command-card"><div><code>/ticketpanel</code><p>Post the ticket panel in the current channel so members can open a private ticket with one click.</p></div><span>Panel</span></article>
          <article class="command-card"><div><code>/ticketadd</code><p>Add another member or staff user to the current ticket when someone else needs access.</p></div><span>Staff</span></article>
          <article class="command-card"><div><code>/ticketclose</code><p>Close the current ticket and create a transcript so the conversation is saved.</p></div><span>Close</span></article>
          <article class="command-card"><div><code>/ticketinfo</code><p>Show the current ticket details, including who opened it and what the ticket is about.</p></div><span>Info</span></article>
        </div>
        <section class="options-block" aria-labelledby="setup-options">
          <h2 id="setup-options">/ticketsetup options</h2>
          <p>Click an option to see what it changes.</p>
          <div class="option-grid">
            <details><summary><code>support_role</code></summary><p>Staff role that can see and handle opened tickets.</p></details><details><summary><code>panel_title</code></summary><p>Main title on the public ticket panel.</p></details><details><summary><code>panel_message</code></summary><p>Short text telling members what the ticket panel is for.</p></details><details><summary><code>panel_rules</code></summary><p>Small note before opening, like no duplicate tickets.</p></details><details><summary><code>button_label</code></summary><p>Text on the open button. Default is Open Ticket.</p></details><details><summary><code>claim_label</code></summary><p>Text on the staff claim button inside a ticket.</p></details><details><summary><code>close_label</code></summary><p>Text on the close button inside a ticket.</p></details><details><summary><code>welcome_title</code></summary><p>Title shown when a ticket channel is created.</p></details><details><summary><code>welcome_message</code></summary><p>First message inside the ticket. Supports placeholders like <code>{user}</code> and <code>{server}</code>.</p></details><details><summary><code>name_format</code></summary><p>Channel name format, for example <code>ticket-{username}</code>.</p></details><details><summary><code>close_message</code></summary><p>Message Beacon posts when the ticket is closed.</p></details><details><summary><code>subject_label</code></summary><p>Label for the short subject field in the open modal.</p></details><details><summary><code>details_label</code></summary><p>Label for the longer details field in the open modal.</p></details><details><summary><code>details_placeholder</code></summary><p>Gray helper text shown before the member types details.</p></details><details><summary><code>max_open</code></summary><p>How many open tickets one member can have at the same time.</p></details><details><summary><code>dm_transcript</code></summary><p>Sends the transcript by DM after closing, when possible.</p></details><details><summary><code>accent_color</code></summary><p>Embed accent color for ticket panels and ticket messages.</p></details>
          </div>
        </section>
        <section class="preview-block" aria-label="Ticket panel preview">
          <h2>Screenshots</h2>
          <p>These previews show what members and staff will see after setup.</p>
          <div class="screenshot-frame"><div class="screenshot-top"><span></span><strong>Ticket panel</strong></div><div class="discord-preview discord-preview--panel"><div class="preview-logo"><img src="/assets/beacon-logo.png?v=92" width="36" height="36" alt="" /></div><div class="preview-card"><strong>Beacon</strong><h3>Need help?</h3><p>Open a private ticket and the team will pick it up as soon as possible.</p><b>Before you open one</b><p>Use tickets for support, reports, orders, or private questions. Please do not open duplicate tickets.</p><b>What happens next</b><p>Beacon asks for a subject and details, then creates a private channel for you and the team.</p><button type="button">Open Ticket</button></div></div></div>
          <div class="screenshot-frame"><div class="screenshot-top"><span></span><strong>Opened ticket</strong></div><div class="discord-preview discord-preview--opened"><div class="preview-logo"><img src="/assets/beacon-logo.png?v=92" width="36" height="36" alt="" /></div><div class="preview-card"><strong>Beacon</strong><h3>Ticket opened</h3><p>Thanks. Tell us what you need and include screenshots, order IDs, or context if it helps.</p><div class="ticket-fields"><div><b>Owner</b><span>member</span></div><div><b>Status</b><span>Open</span></div><div><b>Team</b><span>staff</span></div></div><b>Subject</b><p>Order help</p><b>Details</b><p>I need help with my setup.</p><b>Controls</b><p>Claim marks ownership for staff. Close closes the channel and can send a transcript.</p><div class="preview-actions"><button type="button">Claim</button><button class="danger" type="button">Close</button></div></div></div></div>
        </section>
      </section>
      <section class="commands-doc" id="emoji-steal">
        <h1>Emoji Steal Commands</h1>
        <p class="doc-lead">Copy custom Discord emojis into your server without guessing names or pasting weird links. Paste the emoji, choose if Beacon should keep the original name, confirm it, and the result gets posted back into the channel.</p>
        <div class="doc-panel"><h2>How it works</h2><p>Run one of the commands, paste custom emojis into the dark modal field, set <code>keep_name</code> to <code>true</code> or <code>false</code>, then confirm. Beacon lists every emoji before adding anything, so staff can cancel before the server changes.</p></div>
        <div class="command-list">
          <article class="command-card"><div><code>/emoji-steal</code><p>Steal one custom emoji into the current server with a confirm step.</p></div><span>Single</span></article>
          <article class="command-card"><div><code>/emoji-steal-bulk</code><p>Paste multiple custom emojis and add them in one run after confirming the list.</p></div><span>Bulk</span></article>
        </div>
        <section class="flow-grid" aria-label="Emoji steal flow"><article><span>1</span><h2>Paste</h2><p>Use custom emojis like <code>&lt;:name:id&gt;</code> or animated ones like <code>&lt;a:name:id&gt;</code>.</p></article><article><span>2</span><h2>Confirm</h2><p>Beacon shows an embed with Confirm and Cancel buttons before stealing anything.</p></article><article><span>3</span><h2>Post</h2><p>After Confirm, Beacon posts <code>Successfully Stole Emoji</code> with the new emoji and name.</p></article></section>
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
