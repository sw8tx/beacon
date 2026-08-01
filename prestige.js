const tracks = Array.from(document.querySelectorAll("[data-server-track]"));
const numberFormatter = new Intl.NumberFormat("en-US");

function getInitials(name) {
  return String(name || "Beacon")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function createServerCard(server) {
  const card = document.createElement("article");
  card.className = "server-card";

  const avatar = server.iconUrl ? document.createElement("img") : document.createElement("span");
  avatar.className = "server-avatar";
  if (server.iconUrl) {
    avatar.src = server.iconUrl;
    avatar.alt = "";
    avatar.loading = "lazy";
    avatar.decoding = "async";
  } else {
    avatar.textContent = getInitials(server.name);
  }

  const title = document.createElement("strong");
  title.textContent = server.name;

  const meta = document.createElement("small");
  const dot = document.createElement("i");
  meta.append(dot, `${numberFormatter.format(server.members || 0)} members`);

  card.append(avatar, title, meta);
  return card;
}

function createCountCard(index, members) {
  return createServerCard({
    name: `Beacon server ${index + 1}`,
    members,
    iconUrl: null,
  });
}

function buildCountFallback(stats) {
  const count = Math.max(0, Number(stats?.guilds) || 0);
  const users = Math.max(0, Number(stats?.users) || 0);
  if (!count) return [];
  const baseMembers = Math.floor(users / count);
  const remainder = users % count;
  return Array.from({ length: count }, (_, index) => ({
    name: `Beacon server ${index + 1}`,
    members: baseMembers + (index < remainder ? 1 : 0),
    iconUrl: null,
  }));
}

function fillTrack(track, servers, stats) {
  const realServers = servers.filter((server) => server && server.name);
  const source = realServers.length ? realServers : buildCountFallback(stats);
  const repeated = [];

  while (repeated.length < 12) {
    repeated.push(...source);
  }

  track.replaceChildren(
    ...repeated.slice(0, Math.max(12, source.length * 2)).map((server, index) => (
      server ? createServerCard(server) : createCountCard(index, 0)
    ))
  );
}

async function loadServers() {
  try {
    const response = await fetch("/api/discord-stats", { cache: "no-store" });
    const stats = await response.json();
    const servers = Array.isArray(stats.servers) ? stats.servers : [];

    tracks.forEach((track, index) => {
      fillTrack(track, index % 2 === 0 ? servers : [...servers].reverse(), stats);
    });
  } catch {
    tracks.forEach((track) => fillTrack(track, [], { guilds: 1, users: 0 }));
  }
}

loadServers();
setInterval(loadServers, 60000);
