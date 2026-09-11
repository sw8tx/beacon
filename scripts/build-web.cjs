const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Unsafe output path');
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('Output must not be a symlink');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);

const files = ['index.html', '404.html', 'styles.css', '404.css', 'marquee.css', 'commands-page.css', 'commands.css', 'legal.css', 'prestige.css', 'prestige.js', 'dmca-validation.html'];
const directories = ['assets', 'badges', 'commands', 'welcome', 'cookies', 'copyright', 'eula', 'gdpr', 'prestige', 'privacy', 'status', 'tos'];
const assetTypes = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.avif', '.woff', '.woff2', '.ttf']);
const publicTypes = new Set(['.html', '.css', '.js', ...assetTypes]);

function copyPublic(relative, types) {
  const source = path.join(root, relative);
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Symlink not allowed in public output: ${relative}`);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(source)) {
      if (!name.startsWith('.')) copyPublic(path.join(relative, name), types);
    }
  } else if (types.has(path.extname(relative).toLowerCase())) {
    const target = path.join(output, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

for (const file of files) copyPublic(file, publicTypes);
for (const directory of directories) copyPublic(directory, directory === 'assets' ? assetTypes : publicTypes);
const sharedCommandFooter = '<footer class="site-footer commands-site-footer"><div class="footer-brand"><a href="/"><img src="/assets/beacon-logo.png?v=92" width="32" height="32" alt=""><strong>Beacon</strong></a><span>Built with ♥ by a solo developer</span></div><nav class="footer-legal" aria-label="Legal navigation"><a href="/tos">Terms of Use</a><a href="/privacy">Privacy Policy</a><a href="/copyright">Copyright Dispute</a><a href="/gdpr">GDPR Notice</a><a href="/cookies">Cookie Policy</a><a href="/eula">EULA</a><a href="/imprint/">Imprint</a></nav><p class="footer-rights">© 2026 Beacon. All rights reserved. Beacon is not affiliated with Discord Inc.</p></footer>';
function addFooterToCommandPages(directory) {
  const absolute = path.join(output, directory);
  if (!fs.existsSync(absolute)) return;
  for (const name of fs.readdirSync(absolute)) {
    const entry = path.join(absolute, name);
    const stat = fs.lstatSync(entry);
    if (stat.isDirectory()) addFooterToCommandPages(path.join(directory, name));
    else if (name.endsWith('.html')) {
      const html = fs.readFileSync(entry, 'utf8');
      if (html.includes('class="commands-page"') && !html.includes('commands-site-footer')) {
        fs.writeFileSync(entry, html.replace('</body>', `${sharedCommandFooter}<script src="/site-runtime.js?v=120"></script></body>`));
      }
    }
  }
}
addFooterToCommandPages('commands');
const badgeRuntime = transformSync(fs.readFileSync(path.join(root, 'badges', 'badges.js'), 'utf8'), {
  minify: true,
  legalComments: 'none',
  sourcemap: false,
}).code;
fs.writeFileSync(path.join(output, 'badges', 'runtime.js'), badgeRuntime);
fs.rmSync(path.join(output, 'badges', 'badges.js'), { force: true });
const runtime = transformSync(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), {
  minify: true,
  legalComments: 'none',
  sourcemap: false,
}).code;
fs.writeFileSync(path.join(output, 'site-runtime.js'), runtime);
fs.writeFileSync(path.join(output, '404.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found</title><h1>404 — Not found</h1><a href="/">Beacon home</a></html>');
fs.writeFileSync(path.join(output, '_routes.json'), JSON.stringify({ version: 1, include: ['/*'], exclude: [] }));
fs.writeFileSync(path.join(output, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/index.html
  Cache-Control: no-store, max-age=0

/status/*
  Cache-Control: no-store, max-age=0
`);
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const build = spawnSync(process.execPath, [wrangler, 'pages', 'functions', 'build', 'functions', '--outdir', path.join(output, '_worker.js')], { cwd: root, stdio: 'inherit' });
if (build.status !== 0 || !fs.existsSync(path.join(output, '_worker.js'))) throw new Error('Functions build failed; do not deploy this directory');
console.log('Safe website and server-side Functions built in dist/');
