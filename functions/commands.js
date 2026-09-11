export async function onRequest({ request, env }) {
  const assetUrl = new URL('/commands/index.html', request.url);
  return env.ASSETS.fetch(new Request(assetUrl, request));
}
