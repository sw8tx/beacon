export function onRequest() {
  return new Response(null, {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}
