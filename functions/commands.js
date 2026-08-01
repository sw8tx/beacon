const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <title>Beacon Commands</title>
    <link rel="icon" type="image/png" href="/assets/beacon-logo.png?v=92" />
    <link rel="stylesheet" href="/commands.css?v=1" />
  </head>
  <body>
    <nav class="commands-nav" aria-label="Beacon commands navigation">
      <a class="commands-brand" href="https://beacon-bot.site/">
        <img src="/assets/beacon-logo.png?v=92" width="34" height="34" alt="" />
        <span>Beacon</span>
      </a>
      <a class="commands-back" href="https://beacon-bot.site/">Back to Beacon</a>
    </nav>
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
