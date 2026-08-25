const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealElements = [...document.querySelectorAll("[data-reveal]")];
const languageMenu = document.querySelector(".language-menu");
const languageOptions = [...document.querySelectorAll("[data-lang]")];
const languageCode = document.querySelector(".language-current-code");
const languageLabel = document.querySelector(".language-current-label");
const discordLogin = document.querySelector("#discord-login");
const discordLoginLinks = [...document.querySelectorAll('#discord-login, .hero-button--dark[href="/api/auth/discord/login"]')];
const discordAccount = document.querySelector("#discord-account");
const discordAvatar = document.querySelector("#discord-avatar");
const discordUsername = document.querySelector("#discord-username");
const discordLogout = document.querySelector("#discord-logout");
const authToast = document.querySelector("#auth-toast");
const authRequiredLinks = [...document.querySelectorAll("[data-requires-auth]")];
const heroTypewriter = document.querySelector("[data-typewriter-lines]");
let heroTypewriterTimer = null;
let isDiscordSignedIn = false;

const translations = {
  en: { label: "English", code: "US", bot: "Beacon Bot", support: "Support Server", join: "Join our Discord", help: "Help", commands: "Commands", status: "Status", ping: "Ping", prestige: "Beacon Prestige", new: "New!", add: "Add to Server", login: "Login with Discord", eyebrow: "The ultimate server growth bot", heroLineOne: "Grow your server.", heroLineTwo: "Empower your community.", heroDescription: "Beacon is an all-in-one Discord bot built to help you grow, manage, and engage your server with powerful tools and an easy-to-use dashboard.", checkOne: "Ticket System", checkTwo: "Auto Responder", checkThree: "Sticky Notes", checkFour: "Server Statistics", checkFive: "/Say Command", checkSix: "And much more...", heroAdd: "Add to Server", heroLogin: "Login with Discord", docs: "View Docs", heroNote: "Trusted by growing communities everywhere", livePreview: "Live dashboard preview", builtFor: "Built for your next level", liveStatus: "Live system status", statServers: "Servers connected", statUsers: "Members reached", statPing: "Average ping", statUptime: "Always available", featureOverline: "Everything in one place", featureTitle: "Your community,\nin its element.", featureDescription: "Powerful automation, effortless moderation, and the clarity to make better decisions for your server.", featureOneTitle: "Automate the busywork", featureOneCopy: "Let Beacon handle repetitive tasks while you focus on the people who make your community special.", featureTwoTitle: "See what matters", featureTwoCopy: "Real-time server statistics and clean insights, right when you need them.", featureThreeTitle: "Make it yours", featureThreeCopy: "Flexible commands and thoughtful tools that fit the way your server works.", learnMore: "Explore feature", finalOverline: "Ready when you are", finalTitle: "Give your server\nthe Beacon treatment.", footer: "Built for communities with ambition." },
  fr: { label: "Francais", code: "FR", bot: "Bot Beacon", support: "Serveur support", join: "Rejoindre Discord", help: "Aide", commands: "Commandes", status: "Statut", ping: "Ping", prestige: "Beacon Prestige", new: "Nouveau!", add: "Ajouter au serveur", login: "Connexion Discord", eyebrow: "Le bot ultime pour votre serveur", heroLineOne: "Faites grandir votre serveur.", heroLineTwo: "Renforcez votre communaute.", heroDescription: "Beacon est un bot Discord complet pour developper, gerer et engager votre serveur avec des outils puissants.", checkOne: "Systeme de tickets", checkTwo: "Repondeur automatique", checkThree: "Notes epinglees", checkFour: "Statistiques serveur", checkFive: "/Say Command", checkSix: "Et bien plus...", heroAdd: "Ajouter au serveur", heroLogin: "Connexion Discord", docs: "Voir la documentation", heroNote: "Adopte par des communautes en croissance", livePreview: "Apercu du tableau de bord", builtFor: "Pour votre prochaine etape", liveStatus: "Etat du systeme", statServers: "Serveurs connectes", statUsers: "Membres atteints", statPing: "Ping moyen", statUptime: "Toujours disponible", featureOverline: "Tout au meme endroit", featureTitle: "Votre communaute,\na son meilleur.", featureDescription: "Automatisation puissante, moderation simple et informations claires pour votre serveur.", featureOneTitle: "Automatisez le travail", featureOneCopy: "Beacon gere les taches repetitives pendant que vous vous concentrez sur votre communaute.", featureTwoTitle: "Voyez l'essentiel", featureTwoCopy: "Des statistiques en temps reel et des informations claires au bon moment.", featureThreeTitle: "Faites-le votre", featureThreeCopy: "Des commandes flexibles qui s'adaptent a votre serveur.", learnMore: "Decouvrir", finalOverline: "Pret quand vous l'etes", finalTitle: "Offrez a votre serveur\nle traitement Beacon.", footer: "Concu pour les communautes ambitieuses." },
  es: { label: "Espanol", code: "ES", bot: "Bot Beacon", support: "Servidor de soporte", join: "Unete a Discord", help: "Ayuda", commands: "Comandos", status: "Estado", ping: "Ping", prestige: "Beacon Prestige", new: "Nuevo!", add: "Agregar al servidor", login: "Iniciar con Discord", eyebrow: "El bot definitivo para crecer", heroLineOne: "Haz crecer tu servidor.", heroLineTwo: "Impulsa tu comunidad.", heroDescription: "Beacon es un bot de Discord todo en uno para hacer crecer, gestionar y conectar tu servidor.", checkOne: "Sistema de tickets", checkTwo: "Respuesta automatica", checkThree: "Notas fijadas", checkFour: "Estadisticas", checkFive: "/Say Command", checkSix: "Y mucho mas...", heroAdd: "Agregar al servidor", heroLogin: "Iniciar con Discord", docs: "Ver documentos", heroNote: "Comunidades en crecimiento confian en Beacon", livePreview: "Vista previa en vivo", builtFor: "Creado para tu siguiente nivel", liveStatus: "Estado en vivo", statServers: "Servidores conectados", statUsers: "Miembros alcanzados", statPing: "Ping promedio", statUptime: "Siempre disponible", featureOverline: "Todo en un solo lugar", featureTitle: "Tu comunidad,\nen su elemento.", featureDescription: "Automatizacion potente, moderacion sencilla y claridad para decidir mejor.", featureOneTitle: "Automatiza lo repetitivo", featureOneCopy: "Deja que Beacon se encargue de las tareas repetitivas.", featureTwoTitle: "Mira lo importante", featureTwoCopy: "Estadisticas en tiempo real cuando las necesitas.", featureThreeTitle: "Hazlo tuyo", featureThreeCopy: "Comandos flexibles para la forma en que funciona tu servidor.", learnMore: "Explorar", finalOverline: "Listo cuando tu quieras", finalTitle: "Dale a tu servidor\nel tratamiento Beacon.", footer: "Creado para comunidades ambiciosas." },
  de: { label: "Deutsch", code: "DE", bot: "Beacon Bot", support: "Support Server", join: "Join our Discord", help: "Help", commands: "Commands", status: "Status", ping: "Ping", prestige: "Beacon Prestige", new: "New!", add: "Add to Server", login: "Login with Discord", eyebrow: "Der ultimative Server-Growth-Bot", heroLineOne: "Grow deinen Server.", heroLineTwo: "Staerke deine Community.", heroDescription: "Beacon hilft dir, deinen Discord-Server mit starken Tools aufzubauen, zu verwalten und zu verbinden.", checkOne: "Ticket-System", checkTwo: "Auto-Responder", checkThree: "Sticky Notes", checkFour: "Server-Statistiken", checkFive: "/Say Command", checkSix: "Und vieles mehr...", heroAdd: "Add to Server", heroLogin: "Login with Discord", docs: "View Docs", heroNote: "Von wachsenden Communities genutzt", livePreview: "Live-Dashboard-Vorschau", builtFor: "Fuer dein naechstes Level", liveStatus: "Live-Systemstatus", statServers: "Server verbunden", statUsers: "Mitglieder erreicht", statPing: "Durchschnittlicher Ping", statUptime: "Immer verfuegbar", featureOverline: "Alles an einem Ort", featureTitle: "Deine Community,\nin ihrem Element.", featureDescription: "Starke Automatisierung, einfache Moderation und klare Einblicke fuer bessere Entscheidungen.", featureOneTitle: "Routine automatisieren", featureOneCopy: "Beacon uebernimmt wiederkehrende Aufgaben, damit du dich auf deine Community konzentrieren kannst.", featureTwoTitle: "Das Wichtige sehen", featureTwoCopy: "Echtzeit-Statistiken und klare Einblicke, genau dann, wenn du sie brauchst.", featureThreeTitle: "Mach es zu deinem", featureThreeCopy: "Flexible Commands und Tools, die zu deinem Server passen.", learnMore: "Feature ansehen", finalOverline: "Bereit, wenn du es bist", finalTitle: "Gib deinem Server\nden Beacon-Touch.", footer: "Fuer Communities mit Ambition gebaut." },
  tr: { label: "Turkce", code: "TR", bot: "Beacon Bot", support: "Destek sunucusu", join: "Discord'a katil", help: "Yardim", commands: "Komutlar", status: "Durum", ping: "Ping", prestige: "Beacon Prestige", new: "Yeni!", add: "Sunucuya ekle", login: "Discord ile giris", eyebrow: "Sunucular icin guc", heroLineOne: "Sunucunu buyut.", heroLineTwo: "Toplulugunu guclendir.", heroDescription: "Beacon, Discord sunucunu buyutmek, yonetmek ve toplulugunla etkilesim kurmak icin hepsi bir arada bir bottur.", checkOne: "Bilet sistemi", checkTwo: "Otomatik yanit", checkThree: "Sabit notlar", checkFour: "Sunucu istatistikleri", checkFive: "/Say Komutu", checkSix: "Ve cok daha fazlasi...", heroAdd: "Sunucuya ekle", heroLogin: "Discord ile giris", docs: "Belgeleri gor", heroNote: "Buyuyen topluluklar tarafindan kullaniliyor", livePreview: "Canli panel onizlemesi", builtFor: "Bir sonraki seviyen icin", liveStatus: "Canli sistem durumu", statServers: "Bagli sunucular", statUsers: "Ulasilan uyeler", statPing: "Ortalama ping", statUptime: "Her zaman aktif", featureOverline: "Her sey tek yerde", featureTitle: "Toplulugun,\nen iyi halinde.", featureDescription: "Guclu otomasyon, kolay moderasyon ve daha iyi kararlar icin net bilgiler.", featureOneTitle: "Tekrari otomatiklestir", featureOneCopy: "Beacon tekrar eden isleri ustlenirken sen topluluguna odaklan.", featureTwoTitle: "Onemli olanı gor", featureTwoCopy: "Ihtiyacin oldugunda gercek zamanli istatistikler.", featureThreeTitle: "Kendine gore yap", featureThreeCopy: "Sunucunun calisma sekline uyan esnek komutlar.", learnMore: "Incele", finalOverline: "Hazir oldugunda", finalTitle: "Sunucuna\nBeacon dokunusu kat.", footer: "Hedefleri olan topluluklar icin." },
  ar: { label: "Arabic", code: "SA", bot: "Beacon Bot", support: "Support Server", join: "Join our Discord", help: "Help", commands: "Commands", status: "Status", ping: "Ping", prestige: "Beacon Prestige", new: "New!", add: "Add to Server", login: "Login with Discord", eyebrow: "The ultimate server growth bot", heroLineOne: "Grow your server.", heroLineTwo: "Empower your community.", heroDescription: "Beacon is an all-in-one Discord bot built to help you grow, manage, and engage your server.", checkOne: "Ticket System", checkTwo: "Auto Responder", checkThree: "Sticky Notes", checkFour: "Server Statistics", checkFive: "/Say Command", checkSix: "And much more...", heroAdd: "Add to Server", heroLogin: "Login with Discord", docs: "View Docs", heroNote: "Trusted by growing communities everywhere", livePreview: "Live dashboard preview", builtFor: "Built for your next level", liveStatus: "Live system status", statServers: "Servers connected", statUsers: "Members reached", statPing: "Average ping", statUptime: "Always available", featureOverline: "Everything in one place", featureTitle: "Your community,\nin its element.", featureDescription: "Powerful automation and clear insights for your server.", featureOneTitle: "Automate the busywork", featureOneCopy: "Let Beacon handle repetitive tasks.", featureTwoTitle: "See what matters", featureTwoCopy: "Real-time server statistics when you need them.", featureThreeTitle: "Make it yours", featureThreeCopy: "Flexible commands for your server.", learnMore: "Explore feature", finalOverline: "Ready when you are", finalTitle: "Give your server\nthe Beacon treatment.", footer: "Built for ambitious communities." },
  pt: { label: "Portugues", code: "PT", bot: "Bot Beacon", support: "Servidor de suporte", join: "Entrar no Discord", help: "Ajuda", commands: "Comandos", status: "Status", ping: "Ping", prestige: "Beacon Prestige", new: "Novo!", add: "Adicionar ao servidor", login: "Entrar com Discord", eyebrow: "O bot definitivo para crescer", heroLineOne: "Faca seu servidor crescer.", heroLineTwo: "Fortaleca sua comunidade.", heroDescription: "Beacon e um bot Discord completo para ajudar voce a crescer, gerenciar e envolver seu servidor.", checkOne: "Sistema de tickets", checkTwo: "Resposta automatica", checkThree: "Notas fixadas", checkFour: "Estatisticas do servidor", checkFive: "/Say Command", checkSix: "E muito mais...", heroAdd: "Adicionar ao servidor", heroLogin: "Entrar com Discord", docs: "Ver documentos", heroNote: "Confiado por comunidades em crescimento", livePreview: "Previa do painel ao vivo", builtFor: "Feito para seu proximo nivel", liveStatus: "Status do sistema", statServers: "Servidores conectados", statUsers: "Membros alcancados", statPing: "Ping medio", statUptime: "Sempre disponivel", featureOverline: "Tudo em um so lugar", featureTitle: "Sua comunidade,\nem seu elemento.", featureDescription: "Automacao poderosa, moderacao simples e clareza para decidir melhor.", featureOneTitle: "Automatize o trabalho", featureOneCopy: "Deixe o Beacon cuidar das tarefas repetitivas.", featureTwoTitle: "Veja o que importa", featureTwoCopy: "Estatisticas em tempo real quando precisar.", featureThreeTitle: "Deixe com a sua cara", featureThreeCopy: "Comandos flexiveis para seu servidor.", learnMore: "Explorar", finalOverline: "Pronto quando voce estiver", finalTitle: "De ao seu servidor\no toque Beacon.", footer: "Feito para comunidades ambiciosas." },
  "pt-BR": { label: "Portugues (BR)", code: "BR", bot: "Bot Beacon", support: "Servidor de suporte", join: "Entrar no Discord", help: "Ajuda", commands: "Comandos", status: "Status", ping: "Ping", prestige: "Beacon Prestige", new: "Novo!", add: "Adicionar ao servidor", login: "Entrar com Discord", eyebrow: "O bot definitivo para crescer", heroLineOne: "Faca seu servidor crescer.", heroLineTwo: "Fortaleca sua comunidade.", heroDescription: "Beacon e um bot Discord completo para ajudar voce a crescer, gerenciar e envolver seu servidor.", checkOne: "Sistema de tickets", checkTwo: "Resposta automatica", checkThree: "Notas fixadas", checkFour: "Estatisticas do servidor", checkFive: "/Say Command", checkSix: "E muito mais...", heroAdd: "Adicionar ao servidor", heroLogin: "Entrar com Discord", docs: "Ver documentos", heroNote: "Confiado por comunidades em crescimento", livePreview: "Previa do painel ao vivo", builtFor: "Feito para seu proximo nivel", liveStatus: "Status do sistema", statServers: "Servidores conectados", statUsers: "Membros alcancados", statPing: "Ping medio", statUptime: "Sempre disponivel", featureOverline: "Tudo em um so lugar", featureTitle: "Sua comunidade,\nem seu elemento.", featureDescription: "Automacao poderosa, moderacao simples e clareza para decidir melhor.", featureOneTitle: "Automatize o trabalho", featureOneCopy: "Deixe o Beacon cuidar das tarefas repetitivas.", featureTwoTitle: "Veja o que importa", featureTwoCopy: "Estatisticas em tempo real quando precisar.", featureThreeTitle: "Deixe com a sua cara", featureThreeCopy: "Comandos flexiveis para seu servidor.", learnMore: "Explorar", finalOverline: "Pronto quando voce estiver", finalTitle: "De ao seu servidor\no toque Beacon.", footer: "Feito para comunidades ambiciosas." },
  it: { label: "Italiano", code: "IT", bot: "Bot Beacon", support: "Server supporto", join: "Unisciti a Discord", help: "Aiuto", commands: "Comandi", status: "Stato", ping: "Ping", prestige: "Beacon Prestige", new: "Nuovo!", add: "Aggiungi al server", login: "Accedi con Discord", eyebrow: "Il bot definitivo per il tuo server", heroLineOne: "Fai crescere il tuo server.", heroLineTwo: "Potenzia la tua community.", heroDescription: "Beacon e un bot Discord completo per far crescere, gestire e coinvolgere il tuo server.", checkOne: "Sistema ticket", checkTwo: "Risposta automatica", checkThree: "Note fissate", checkFour: "Statistiche server", checkFive: "/Say Command", checkSix: "E molto altro...", heroAdd: "Aggiungi al server", heroLogin: "Accedi con Discord", docs: "Vedi documenti", heroNote: "Scelto da community in crescita", livePreview: "Anteprima dashboard live", builtFor: "Per il tuo prossimo livello", liveStatus: "Stato del sistema", statServers: "Server collegati", statUsers: "Membri raggiunti", statPing: "Ping medio", statUptime: "Sempre disponibile", featureOverline: "Tutto in un unico posto", featureTitle: "La tua community,\nal meglio.", featureDescription: "Automazione potente e dati chiari per gestire meglio il tuo server.", featureOneTitle: "Automatizza il lavoro", featureOneCopy: "Lascia a Beacon le attivita ripetitive.", featureTwoTitle: "Vedi cio che conta", featureTwoCopy: "Statistiche in tempo reale quando servono.", featureThreeTitle: "Rendilo tuo", featureThreeCopy: "Comandi flessibili per il tuo server.", learnMore: "Esplora", finalOverline: "Pronto quando vuoi", finalTitle: "Dai al tuo server\nil tocco Beacon.", footer: "Creato per community ambiziose." },
  nl: { label: "Nederlands", code: "NL", bot: "Beacon Bot", support: "Supportserver", join: "Word lid van Discord", help: "Help", commands: "Commands", status: "Status", ping: "Ping", prestige: "Beacon Prestige", new: "Nieuw!", add: "Toevoegen aan server", login: "Login met Discord", eyebrow: "De ultieme bot voor servergroei", heroLineOne: "Laat je server groeien.", heroLineTwo: "Versterk je community.", heroDescription: "Beacon is een complete Discord-bot om je server te laten groeien, beheren en verbinden.", checkOne: "Ticketsysteem", checkTwo: "Auto responder", checkThree: "Vastgezette notities", checkFour: "Serverstatistieken", checkFive: "/Say Command", checkSix: "En nog veel meer...", heroAdd: "Toevoegen aan server", heroLogin: "Login met Discord", docs: "Bekijk docs", heroNote: "Vertrouwd door groeiende communities", livePreview: "Live dashboard preview", builtFor: "Voor je volgende niveau", liveStatus: "Live systeemstatus", statServers: "Servers verbonden", statUsers: "Leden bereikt", statPing: "Gemiddelde ping", statUptime: "Altijd beschikbaar", featureOverline: "Alles op een plek", featureTitle: "Jouw community,\nin haar element.", featureDescription: "Krachtige automatisering, eenvoudige moderatie en heldere inzichten.", featureOneTitle: "Automatiseer werk", featureOneCopy: "Laat Beacon terugkerende taken afhandelen.", featureTwoTitle: "Zie wat telt", featureTwoCopy: "Realtime serverstatistieken wanneer je ze nodig hebt.", featureThreeTitle: "Maak het eigen", featureThreeCopy: "Flexibele commands voor jouw server.", learnMore: "Ontdek", finalOverline: "Klaar wanneer jij dat bent", finalTitle: "Geef je server\nde Beacon-touch.", footer: "Gebouwd voor ambitieuze communities." }
};

const interfaceTranslations = {
  en: { navBadges: "Badges", navCommands: "Commands", navDashboard: "Dashboard", navPrestige: "Prestige", navDocs: "Docs", navSupport: "Support", navStatus: "Status", heroLineOne: "Build a\ncommunity\npeople stay for.", checkFive: "Welcome Messages", checkSix: "Community Health Score", footerProduct: "Product", footerDocumentation: "Documentation", footerPrivacy: "Privacy", footerTerms: "Terms", footerImprint: "Imprint" },
  fr: { navBadges: "Badges", navCommands: "Commandes", navDashboard: "Tableau de bord", navPrestige: "Prestige", navDocs: "Docs", navSupport: "Support", navStatus: "Statut", checkFive: "Messages de bienvenue", checkSix: "Score de sante communautaire", footerProduct: "Produit", footerDocumentation: "Documentation", footerPrivacy: "Confidentialite", footerTerms: "Conditions", footerImprint: "Mentions legales" },
  es: { navBadges: "Badges", navCommands: "Comandos", navDashboard: "Panel", navPrestige: "Prestige", navDocs: "Docs", navSupport: "Soporte", navStatus: "Estado", checkFive: "Mensajes de bienvenida", checkSix: "Salud de la comunidad", footerProduct: "Producto", footerDocumentation: "Documentacion", footerPrivacy: "Privacidad", footerTerms: "Terminos", footerImprint: "Aviso legal" },
  de: { navBadges: "Badges", navCommands: "Commands", navDashboard: "Dashboard", navPrestige: "Prestige", navDocs: "Docs", navSupport: "Support", navStatus: "Status", heroLineOne: "Build a\ncommunity\npeople stay for.", checkFive: "Welcome Messages", checkSix: "Community Health Score", footerProduct: "Produkt", footerDocumentation: "Dokumentation", footerPrivacy: "Datenschutz", footerTerms: "Nutzungsbedingungen", footerImprint: "Impressum" },
  tr: { navBadges: "Badges", navCommands: "Komutlar", navDashboard: "Panel", navPrestige: "Prestige", navDocs: "Belgeler", navSupport: "Destek", navStatus: "Durum", checkFive: "Karsilama mesajlari", checkSix: "Topluluk saglik puani", footerProduct: "Urun", footerDocumentation: "Belgeler", footerPrivacy: "Gizlilik", footerTerms: "Kosullar", footerImprint: "Kunye" },
  ar: { navBadges: "Badges", navCommands: "Commands", navDashboard: "Dashboard", navPrestige: "Prestige", navDocs: "Docs", navSupport: "Support", navStatus: "Status", checkFive: "Welcome Messages", checkSix: "Community Health Score", footerProduct: "Product", footerDocumentation: "Documentation", footerPrivacy: "Privacy", footerTerms: "Terms", footerImprint: "Imprint" },
  pt: { navBadges: "Badges", navCommands: "Comandos", navDashboard: "Painel", navPrestige: "Prestige", navDocs: "Docs", navSupport: "Suporte", navStatus: "Status", checkFive: "Mensagens de boas-vindas", checkSix: "Saude da comunidade", footerProduct: "Produto", footerDocumentation: "Documentacao", footerPrivacy: "Privacidade", footerTerms: "Termos", footerImprint: "Aviso legal" },
  "pt-BR": { navBadges: "Badges", navCommands: "Comandos", navDashboard: "Painel", navPrestige: "Prestige", navDocs: "Docs", navSupport: "Suporte", navStatus: "Status", checkFive: "Mensagens de boas-vindas", checkSix: "Saude da comunidade", footerProduct: "Produto", footerDocumentation: "Documentacao", footerPrivacy: "Privacidade", footerTerms: "Termos", footerImprint: "Aviso legal" },
  it: { navBadges: "Badges", navCommands: "Comandi", navDashboard: "Dashboard", navPrestige: "Prestige", navDocs: "Docs", navSupport: "Supporto", navStatus: "Stato", checkFive: "Messaggi di benvenuto", checkSix: "Salute della community", footerProduct: "Prodotto", footerDocumentation: "Documentazione", footerPrivacy: "Privacy", footerTerms: "Termini", footerImprint: "Note legali" },
  nl: { navBadges: "Badges", navCommands: "Commands", navDashboard: "Dashboard", navPrestige: "Prestige", navDocs: "Docs", navSupport: "Support", navStatus: "Status", checkFive: "Welkomstberichten", checkSix: "Community health score", footerProduct: "Product", footerDocumentation: "Documentatie", footerPrivacy: "Privacy", footerTerms: "Voorwaarden", footerImprint: "Colofon" },
};

Object.entries(interfaceTranslations).forEach(([language, values]) => Object.assign(translations[language], values));

function setLanguage(language) {
  const dictionary = translations[language] || translations.de;
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const value = dictionary[element.dataset.i18n];
    if (value) element.textContent = value;
  });
  startHeroTypewriter(heroTypewriter?.dataset.typewriterLines || dictionary.heroLineOne || "");
  if (languageCode) languageCode.textContent = dictionary.code;
  if (languageLabel) languageLabel.textContent = dictionary.label;
  languageOptions.forEach((option) => option.classList.toggle("is-selected", option.dataset.lang === language));
  try { localStorage.setItem("beacon-language", language); } catch (_) { /* private browsing can block storage */ }
}

function startHeroTypewriter(text) {
  if (!heroTypewriter) return;
  if (heroTypewriterTimer) window.clearTimeout(heroTypewriterTimer);
  const lines = String(text || "")
    .split("|")
    .map((line) => line.trim().replace(/\\n/g, "\n"))
    .filter(Boolean);
  if (reduceMotion || !lines.length) {
    heroTypewriter.textContent = lines[0] || "";
    heroTypewriter.classList.remove("hero-typewriter");
    return;
  }

  heroTypewriter.classList.add("hero-typewriter");
  heroTypewriter.setAttribute("aria-label", lines.join(" "));
  let lineIndex = 0;
  let index = 0;
  let deleting = false;

  const tick = () => {
    const fullText = lines[lineIndex];
    heroTypewriter.textContent = fullText.slice(0, index);

    if (!deleting && index < fullText.length) {
      index += 1;
      heroTypewriterTimer = window.setTimeout(tick, fullText[index - 1] === "\n" ? 260 : 54);
      return;
    }

    if (!deleting && index >= fullText.length) {
      deleting = true;
      heroTypewriterTimer = window.setTimeout(tick, 1750);
      return;
    }

    if (deleting && index > 0) {
      index -= 1;
      heroTypewriterTimer = window.setTimeout(tick, fullText[index] === "\n" ? 150 : 32);
      return;
    }

    deleting = false;
    lineIndex = (lineIndex + 1) % lines.length;
    heroTypewriterTimer = window.setTimeout(tick, 520);
  };

  tick();
}

languageOptions.forEach((option) => option.addEventListener("click", (event) => {
  event.preventDefault();
  setLanguage(option.dataset.lang);
  languageMenu?.removeAttribute("open");
}));

let savedLanguage = "de";
try { savedLanguage = localStorage.getItem("beacon-language") || "de"; } catch (_) {}
setLanguage(savedLanguage);

async function loadDiscordSession() {
  if (!discordLogin || !discordAccount || !window.fetch) return;
  try {
    const response = await fetch("/api/auth/discord/session", { cache: "no-store" });
    if (!response.ok) return;
    const { user } = await response.json();
    if (!user?.username) return;
    isDiscordSignedIn = true;
    discordAvatar.src = user.avatar || "assets/beacon-logo.png?v=92";
    discordAvatar.alt = `${user.username} profile picture`;
    discordUsername.textContent = user.username;
    discordLoginLinks.forEach((link) => {
      link.hidden = true;
      link.setAttribute("aria-hidden", "true");
      link.tabIndex = -1;
    });
    discordAccount.hidden = false;
    discordAccount.setAttribute("aria-label", `Signed in as ${user.username}`);
  } catch (_) {}
}

function showAuthRequired() {
  document.body.classList.remove("auth-flash", "show-auth-toast");
  void document.body.offsetWidth;
  document.body.classList.add("auth-flash", "show-auth-toast");
  window.setTimeout(() => document.body.classList.remove("auth-flash"), 1000);
  window.setTimeout(() => document.body.classList.remove("show-auth-toast"), 2300);
}

let discordSessionPromise = null;

authRequiredLinks.forEach((link) => link.addEventListener("click", async (event) => {
  if (isDiscordSignedIn) return;
  event.preventDefault();
  await discordSessionPromise;
  if (isDiscordSignedIn) {
    window.location.assign(link.href);
    return;
  }
  showAuthRequired();
}));

discordLogout?.addEventListener("click", async () => {
  await fetch("/api/auth/discord/logout", { method: "POST" }).catch(() => {});
  window.location.assign("/");
});

discordSessionPromise = loadDiscordSession();

if (new URLSearchParams(window.location.search).has("login_required")) {
  window.history.replaceState({}, "", window.location.pathname);
  showAuthRequired();
}

const statusValues = [...document.querySelectorAll("[data-stat]")];
const serverTracks = [...document.querySelectorAll("[data-server-track]")];
const liveFields = [...document.querySelectorAll("[data-live-field]")];
const KNOWN_COMMAND_COUNT = 24;
const numberFormatter = new Intl.NumberFormat("en-US");
let statsRequest = null;
const DEFAULT_SERVERS = [
  { name: "Beacon", members: 57, iconUrl: "assets/beacon-logo.png?v=92" },
  { name: "Apex Design V2", members: 72, iconUrl: null },
  { name: "Gelsenkirchen RP", members: 61, iconUrl: null },
  { name: "BotTest123", members: 21, iconUrl: null },
  { name: "Sparkle Stock Reborn", members: 9, iconUrl: null },
  { name: "lettersniper's server", members: 6, iconUrl: null },
  { name: "MM MUSIC OFFICIAL", members: 115, iconUrl: null },
  { name: "smm2.org", members: 248, iconUrl: null },
];

function formatStatusNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString() : "--";
}

async function fetchLiveStats() {
  if (!window.fetch) return null;
  if (!statsRequest) {
    statsRequest = fetch("/api/discord-stats", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null)
      .finally(() => {
        window.setTimeout(() => { statsRequest = null; }, 750);
      });
  }
  return statsRequest;
}

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

function buildServerFallback(stats) {
  const count = Math.max(1, Number(stats?.guilds) || 1);
  const users = Math.max(0, Number(stats?.users) || 0);
  if (!users && DEFAULT_SERVERS.length) return DEFAULT_SERVERS;
  const visibleCount = Math.min(12, count);
  const baseMembers = Math.floor(users / visibleCount);
  const remainder = users % visibleCount;
  return Array.from({ length: visibleCount }, (_, index) => ({
    name: `Beacon server ${index + 1}`,
    members: baseMembers + (index < remainder ? 1 : 0),
    iconUrl: null,
  }));
}

function fillServerTrack(track, servers, stats) {
  const source = (Array.isArray(servers) ? servers : []).filter((server) => server?.name);
  const cards = source.length ? source : buildServerFallback(stats);
  const repeated = [];
  while (repeated.length < 16) repeated.push(...cards);
  track.replaceChildren(...repeated.slice(0, Math.max(16, cards.length * 2)).map(createServerCard));
}

function updateServerTracks(stats) {
  if (!serverTracks.length) return;
  const servers = (Array.isArray(stats?.servers) ? stats.servers : [])
    .slice()
    .sort((left, right) => (Number(right?.members) || 0) - (Number(left?.members) || 0));
  serverTracks.forEach((track, index) => {
    fillServerTrack(track, index % 2 === 0 ? servers : [...servers].reverse(), stats);
  });
}

function updateLiveFields(stats) {
  if (!liveFields.length) return;
  const commands = Number(stats?.commands) || KNOWN_COMMAND_COUNT;
  const users = Number(stats?.users) || 0;
  const values = {
    entries: numberFormatter.format(Math.max(1200, Math.round(users * 2.14))),
    messages: numberFormatter.format(Math.max(12408, commands * 517)),
  };
  liveFields.forEach((element) => {
    element.textContent = values[element.dataset.liveField] || element.textContent;
  });
}

async function syncLiveStats() {
  if ((!statusValues.length && !serverTracks.length && !liveFields.length) || !window.fetch) return;
  try {
    const stats = await fetchLiveStats();
    if (!stats) return;
    const values = {
      commands: Number(stats.commands) > 0 ? formatStatusNumber(Number(stats.commands)) : String(KNOWN_COMMAND_COUNT),
      ping: Number.isFinite(Number(stats.ping)) ? `${Math.round(Number(stats.ping))} ms` : "--",
      guilds: formatStatusNumber(Number(stats.guilds)),
      users: formatStatusNumber(Number(stats.users)),
    };
    statusValues.forEach((element) => {
      element.textContent = values[element.dataset.stat] || "--";
    });
    updateServerTracks(stats);
    updateLiveFields(stats);
  } catch (_) {}
}

updateServerTracks({ guilds: DEFAULT_SERVERS.length, users: 589, servers: DEFAULT_SERVERS });
updateLiveFields({ commands: KNOWN_COMMAND_COUNT, users: 600 });
syncLiveStats();
window.setInterval(syncLiveStats, 60_000);

function revealOnScroll() {
  revealElements.forEach((element) => {
    if (element.getBoundingClientRect().top < window.innerHeight * .88) element.classList.add("revealed");
  });
}
window.addEventListener("scroll", revealOnScroll, { passive: true });
window.addEventListener("resize", revealOnScroll);
window.addEventListener("load", revealOnScroll);

function makeDashboardTexture(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  function roundRect(x, y, width, height, radius, fill, stroke) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    if (fill) { context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.stroke(); }
  }
  function text(value, x, y, size, color, weight = "500", align = "left") {
    context.fillStyle = color;
    context.font = `${weight} ${size}px Arial, sans-serif`;
    context.textAlign = align;
    context.fillText(value, x, y);
  }
  function draw(time) {
    const pulse = Math.sin(time * .0017) * 2;
    context.fillStyle = "#202623";
    context.fillRect(0, 0, 1200, 720);
    context.fillStyle = "#111614";
    context.fillRect(0, 0, 208, 720);
    context.strokeStyle = "rgba(255,255,255,.13)";
    context.beginPath(); context.moveTo(208, 0); context.lineTo(208, 720); context.stroke();
    context.fillStyle = "#ffc31c";
    context.beginPath(); context.arc(39, 47, 12, 0, Math.PI * 2); context.fill();
    text("BEACON", 62, 54, 22, "#f6f3ea", "700");
    text("COMMUNITY OS", 62, 74, 8, "#777f78", "600");
    const nav = ["Dashboard", "Tickets", "Automation", "Analytics", "Settings"];
    nav.forEach((label, index) => {
      const y = 145 + index * 48;
      if (index === 0) roundRect(20, y - 24, 168, 38, 7, "rgba(255,195,28,.24)", "rgba(255,195,28,.34)");
      context.fillStyle = index === 0 ? "#ffc31c" : "#7f8881";
      context.beginPath(); context.arc(40, y - 4, 4, 0, Math.PI * 2); context.fill();
      text(label, 57, y, 14, index === 0 ? "#ffc31c" : "#a5aba6", "600");
    });
    text("BEACON PRESTIGE", 28, 650, 9, "#ffc31c", "700");
    text("Your server is glowing.", 28, 669, 11, "#68716b");
    text("Good evening, Agent", 248, 42, 13, "#7d8780");
    text("Overview", 248, 78, 30, "#f4f3eb", "700");
    roundRect(1004, 25, 145, 39, 7, "#29312d", "rgba(120,217,151,.22)");
    context.fillStyle = "#72d391"; context.beginPath(); context.arc(1025, 44, 5, 0, Math.PI * 2); context.fill();
    text("All systems live", 1038, 49, 11, "#b6c1b8", "600");
    const metrics = [["1,542", "SERVERS", "+12 this week"], ["98,421", "MEMBERS", "+842 this week"], ["23ms", "PING", "Excellent"], ["99.9%", "UPTIME", "Operational"]];
    metrics.forEach((metric, index) => {
      const x = 248 + index * 225;
      roundRect(x, 110, 207, 115, 9, "#29302d", "rgba(255,255,255,.14)");
      text(metric[1], x + 18, 139, 10, "#7e8880", "700");
      text(metric[0], x + 18, 180, 28, "#f1f0e9", "700");
      text(metric[2], x + 18, 204, 10, index > 1 ? "#72d391" : "#ffc31c", "600");
    });
    roundRect(248, 251, 432, 265, 9, "#252c29", "rgba(255,255,255,.14)");
    text("SERVER ACTIVITY", 270, 280, 11, "#ffc31c", "700");
    text("last 7 days", 655, 280, 10, "#68716b", "600", "right");
    context.strokeStyle = "rgba(255,255,255,.08)";
    for (let i = 0; i < 4; i++) { context.beginPath(); context.moveTo(275, 325 + i * 43); context.lineTo(650, 325 + i * 43); context.stroke(); }
    context.beginPath(); context.moveTo(275, 454); context.bezierCurveTo(330, 429 + pulse, 350, 447, 390, 405); context.bezierCurveTo(433, 359, 447, 427, 486, 382); context.bezierCurveTo(530, 336, 555, 383, 595, 345); context.bezierCurveTo(620, 324, 638, 350, 650, 323); context.strokeStyle = "#ffc31c"; context.lineWidth = 4; context.stroke(); context.lineWidth = 1;
    context.fillStyle = "#ffc31c"; context.beginPath(); context.arc(650, 323, 5, 0, Math.PI * 2); context.fill();
    const boxes = [[700, 251, 213, 126, "RECENT TICKETS"], [930, 251, 218, 126, "AUTO RESPONDER"], [700, 390, 213, 126, "STICKY NOTES"], [930, 390, 218, 126, "SERVER ACTIVITY"]];
    boxes.forEach(([x, y, w, h, label], boxIndex) => {
      roundRect(x, y, w, h, 9, "#252c29", "rgba(255,255,255,.14)");
      text(label, x + 17, y + 29, 10, "#ffc31c", "700");
      for (let row = 0; row < 3; row++) {
        const rowY = y + 55 + row * 20;
        context.fillStyle = boxIndex === 1 ? "#ffc31c" : row === 1 ? "#72d391" : "#59645c";
        context.beginPath(); context.arc(x + 20, rowY - 3, 4, 0, Math.PI * 2); context.fill();
        text(["User feedback", "Role request", "Welcome message"][row], x + 34, rowY, 10, "#c1c7c0", "600");
      }
    });
    text("Beacon Intelligence / Live", 248, 570, 10, "#68716b", "600");
    context.fillStyle = "rgba(255,195,28,.1)"; context.fillRect(248, 590, 900, 1);
    text("Turn activity into momentum.", 248, 624, 18, "#d8dbd2", "600");
    texture.needsUpdate = true;
  }
  return { texture, draw };
}

async function initThreeLaptop() {
  const stage = document.querySelector(".hero-stage");
  if (!stage || reduceMotion) return;
  try {
    stage.classList.remove("is-fallback");
    const waitForStageSize = () => new Promise((resolve) => {
      const check = () => {
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        if (width > 40 && height > 40) {
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
    await waitForStageSize();

    const THREE = await import("https://unpkg.com/three@0.166.1/build/three.module.js");
    const { RoundedBoxGeometry } = await import("https://unpkg.com/three@0.166.1/examples/jsm/geometries/RoundedBoxGeometry.js");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, stage.clientWidth / stage.clientHeight, .1, 100);
    const isCompactViewport = () => window.matchMedia("(max-width: 900px)").matches;
    camera.position.set(0, .45, isCompactViewport() ? 11.9 : 10.6);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    stage.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xfff1cf, 0x111513, 2.35));
    const key = new THREE.DirectionalLight(0xffc02c, 5.3); key.position.set(-4, 6, 7); scene.add(key);
    const rim = new THREE.PointLight(0xffa916, 11, 15); rim.position.set(4, 1, 3); scene.add(rim);
    const fill = new THREE.PointLight(0xffe5a1, 4, 16); fill.position.set(-4, 0, 4); scene.add(fill);
    const laptop = new THREE.Group(); laptop.rotation.y = -.18; laptop.rotation.x = -.03; scene.add(laptop);
    const black = new THREE.MeshStandardMaterial({ color: 0x171b19, roughness: .36, metalness: .62 });
    const edge = new THREE.MeshStandardMaterial({ color: 0x454c47, roughness: .3, metalness: .58 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffbd16, roughness: .27, metalness: .55, emissive: 0x8c5d00, emissiveIntensity: .23 });
    const screenBezel = new THREE.Mesh(new RoundedBoxGeometry(6.5, 4.25, .27, .18, 6), black);
    screenBezel.position.set(0, 1.28, -.85); laptop.add(screenBezel);
    const screenCanvas = makeDashboardTexture(THREE);
    const display = new THREE.Mesh(new RoundedBoxGeometry(6.08, 3.67, .035, .08, 5), new THREE.MeshBasicMaterial({ map: screenCanvas.texture, toneMapped: false }));
    display.position.set(0, 1.27, -.68); laptop.add(display);
    const cameraDot = new THREE.Mesh(new THREE.SphereGeometry(.045, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffc31c })); cameraDot.position.set(0, 3.2, -.67); laptop.add(cameraDot);
    const base = new THREE.Mesh(new RoundedBoxGeometry(7.15, .38, 4.1, .16, 8), edge); base.position.set(0, -1.05, .25); laptop.add(base);
    const deck = new THREE.Mesh(new RoundedBoxGeometry(6.92, .08, 3.83, .05, 6), new THREE.MeshStandardMaterial({ color: 0x343a36, roughness: .42, metalness: .46 })); deck.position.set(0, -.84, .2); laptop.add(deck);
    const keyboard = new THREE.Group();
    for (let row = 0; row < 5; row++) {
      const count = row === 4 ? 7 : 11;
      for (let col = 0; col < count; col++) {
        const keycap = new THREE.Mesh(new RoundedBoxGeometry(row === 4 ? .62 : .43, .055, .22, .035, 2), new THREE.MeshStandardMaterial({ color: row === 0 ? 0x4a514c : 0x272c29, roughness: .38, metalness: .34 }));
        keycap.position.set((col - (count - 1) / 2) * (row === 4 ? .72 : .5), -.78, -.7 + row * .42); keyboard.add(keycap);
      }
    }
    laptop.add(keyboard);
    const trackpad = new THREE.Mesh(new RoundedBoxGeometry(1.55, .025, .98, .08, 4), new THREE.MeshStandardMaterial({ color: 0x4b524d, roughness: .34, metalness: .43 })); trackpad.position.set(0, -.78, 1.27); laptop.add(trackpad);
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 5.3, 32), black); hinge.rotation.z = Math.PI / 2; hinge.position.set(0, -.77, -.77); laptop.add(hinge);
    const logo = new THREE.Mesh(new THREE.OctahedronGeometry(.22, 0), yellow); logo.position.set(0, -.64, 2.05); logo.rotation.y = Math.PI / 4; laptop.add(logo);
    const baseAccent = new THREE.Mesh(new THREE.BoxGeometry(2.6, .018, .018), yellow); baseAccent.position.set(0, -.845, 2.14); laptop.add(baseAccent);
    const resize = () => {
      const width = Math.max(1, stage.clientWidth);
      const height = Math.max(1, stage.clientHeight);
      const compact = isCompactViewport();
      camera.aspect = width / height;
      camera.position.z = compact ? 11.9 : 10.6;
      laptop.scale.setScalar(compact ? .9 : 1.12);
      laptop.position.x = compact ? .08 : 0;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", () => setTimeout(resize, 120));
    resize();
    const clock = new THREE.Clock();
    function animate() {
      const elapsed = clock.getElapsedTime();
      laptop.rotation.y = -.1 + Math.sin(elapsed * .42) * .24;
      laptop.rotation.x = -.04 + Math.sin(elapsed * .55) * .025;
      laptop.position.y = Math.sin(elapsed * .8) * .075;
      screenCanvas.draw(performance.now());
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();
  } catch (error) {
    stage.classList.add("is-fallback");
  }
}

initThreeLaptop();
requestAnimationFrame(revealOnScroll);
