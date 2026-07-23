const FALLBACK_STATS = {
  guilds: 0,
  users: 0,
  ping: 0,
  uptime: 0,
  online: false,
  updatedAt: null
};

let memoryStats = { ...FALLBACK_STATS };

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function normalizeStats(input) {
  return {
    guilds: cleanNumber(input.guilds),
    users: cleanNumber(input.users),
    ping: cleanNumber(input.ping),
    uptime: cleanNumber(input.uptime),
    online: true,
    updatedAt: new Date().toISOString()
  };
}

async function readStats(env) {
  if (env.DISCORD_STATS) {
    const stored = await env.DISCORD_STATS.get("latest", "json");
    return stored || FALLBACK_STATS;
  }

  return memoryStats;
}

async function writeStats(env, stats) {
  if (env.DISCORD_STATS) {
    await env.DISCORD_STATS.put("latest", JSON.stringify(stats));
  }

  memoryStats = stats;
}

export async function onRequestGet({ env }) {
  return json(await readStats(env));
}

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get("authorization");

  if (!env.STATS_SECRET || auth !== `Bearer ${env.STATS_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const stats = normalizeStats(payload);
  await writeStats(env, stats);

  return json({ ok: true, updatedAt: stats.updatedAt });
}
