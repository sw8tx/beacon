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

function createPendingCard() {
  return createServerCard({
    name: "Beacon server",
    members: 0,
    iconUrl: null,
  });
}

function fillTrack(track, servers) {
  const realServers = servers.filter((server) => server && server.name);
  const source = realServers.length ? realServers : [null];
  const repeated = [];

  while (repeated.length < 12) {
    repeated.push(...source);
  }

  track.replaceChildren(
    ...repeated.slice(0, Math.max(12, source.length * 2)).map((server) => (
      server ? createServerCard(server) : createPendingCard()
    ))
  );
}

async function loadServers() {
  try {
    const response = await fetch("/api/discord-stats", { cache: "no-store" });
    const stats = await response.json();
    const servers = Array.isArray(stats.servers) ? stats.servers : [];

    tracks.forEach((track, index) => {
      fillTrack(track, index % 2 === 0 ? servers : [...servers].reverse());
    });
  } catch {
    tracks.forEach((track) => fillTrack(track, []));
  }
}

loadServers();
setInterval(loadServers, 60000);
