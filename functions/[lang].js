const LANGUAGES = {
  en: ["en", "Beacon – Discord Bot for Tickets, Moderation & Community", "Beacon is a Discord bot for tickets, moderation, automation and community management."],
  de: ["de", "Beacon – Discord Bot für Tickets, Moderation & Community", "Beacon ist ein Discord-Bot für Tickets, Moderation, Automatisierung und Community-Management."],
  fr: ["fr", "Beacon – Bot Discord pour tickets, modération et communauté", "Beacon est un bot Discord pour les tickets, la modération, l’automatisation et la gestion de communauté."],
  es: ["es", "Beacon – Bot de Discord para tickets, moderación y comunidad", "Beacon es un bot de Discord para tickets, moderación, automatización y gestión de comunidades."],
  tr: ["tr", "Beacon – Ticket, moderasyon ve topluluk için Discord botu", "Beacon; ticket, moderasyon, otomasyon ve topluluk yönetimi için bir Discord botudur."],
  ar: ["ar", "Beacon – بوت Discord للتذاكر والإشراف والمجتمعات", "Beacon هو بوت Discord للتذاكر والإشراف والأتمتة وإدارة المجتمعات."],
  pt: ["pt", "Beacon – Bot Discord para tickets, moderação e comunidade", "Beacon é um bot Discord para tickets, moderação, automação e gestão de comunidades."],
  "pt-BR": ["pt-BR", "Beacon – Bot Discord para tickets, moderação e comunidade", "Beacon é um bot Discord para tickets, moderação, automação e gestão de comunidades."],
  it: ["it", "Beacon – Bot Discord per ticket, moderazione e community", "Beacon è un bot Discord per ticket, moderazione, automazione e gestione della community."],
  nl: ["nl", "Beacon – Discord-bot voor tickets, moderatie en community", "Beacon is een Discord-bot voor tickets, moderatie, automatisering en communitybeheer."],
};

export async function onRequest(context) {
  const key = context.params.lang;
  const language = LANGUAGES[key];
  if (!language) return context.env.ASSETS.fetch(context.request);
  const pathname = new URL(context.request.url).pathname;
  if (pathname !== `/${key}` && pathname !== `/${key}/`) {
    return context.env.ASSETS.fetch(context.request);
  }
  if (context.request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });

  const rootUrl = new URL("/", context.request.url);
  const response = await context.env.ASSETS.fetch(new Request(rootUrl, context.request));
  if (!response.ok) return response;
  let html = await response.text();
  html = html
    .replace(/<html lang="[^"]+">/, `<html lang="${language[0]}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${language[1]}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${language[2]}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${new URL(`/${key}/`, context.request.url).toString()}" />`);
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "content-language": language[0], "cache-control": "public, max-age=0, must-revalidate" } });
}
