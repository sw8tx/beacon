const revealElements = Array.from(document.querySelectorAll("[data-reveal]"));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function setHeroHover(event) {
  const root = document.documentElement;
  const rect = heroPanel.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width - 0.5) * 0.6;
  const y = ((event.clientY - rect.top) / rect.height - 0.5) * 0.4;
  root.style.setProperty("--hero-tilt-x", `${y}deg`);
  root.style.setProperty("--hero-tilt-y", `${x}deg`);
}

function resetHeroTilt() {
  document.documentElement.style.setProperty("--hero-tilt-x", "0deg");
  document.documentElement.style.setProperty("--hero-tilt-y", "0deg");
}

function revealOnScroll() {
  const triggerPoint = window.innerHeight * 0.9;
  revealElements.forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.top < triggerPoint) {
      element.classList.add("revealed");
    }
  });
}

const heroPanel = document.querySelector(".hero-panel");
const addButton = document.querySelector(".js-add");
const dashboardButton = document.querySelector(".js-dashboard");
const menuToggle = document.querySelector(".js-menu-toggle");
const mobileNav = document.querySelector(".js-mobile-nav");
const navLinks = document.querySelectorAll(".js-nav-link");
const languageMenu = document.querySelector(".language-menu");
const languageOptions = document.querySelectorAll("[data-lang]");
const languageCode = document.querySelector(".language-current-code");
const languageLabel = document.querySelector(".language-current-label");

const translations = {
  en: {
    label: "English",
    code: "US",
    bot: "Beacon Bot",
    support: "Support Server",
    join: "Join our Discord",
    help: "Help",
    commands: "Commands",
    status: "Status",
    ping: "Ping",
    prestige: "Beacon Prestige",
    new: "New!",
    add: "Add to Server",
    login: "Login with Discord",
  },
  fr: {
    label: "Francais",
    code: "FR",
    bot: "Bot Beacon",
    support: "Serveur support",
    join: "Rejoindre Discord",
    help: "Aide",
    commands: "Commandes",
    status: "Statut",
    ping: "Ping",
    prestige: "Beacon Prestige",
    new: "Nouveau!",
    add: "Ajouter au serveur",
    login: "Connexion Discord",
  },
  es: {
    label: "Espanol",
    code: "ES",
    bot: "Bot Beacon",
    support: "Servidor de soporte",
    join: "Unete a Discord",
    help: "Ayuda",
    commands: "Comandos",
    status: "Estado",
    ping: "Ping",
    prestige: "Beacon Prestige",
    new: "Nuevo!",
    add: "Agregar al servidor",
    login: "Iniciar con Discord",
  },
  de: {
    label: "Deutsch",
    code: "DE",
    bot: "Beacon Bot",
    support: "Support Server",
    join: "Join our Discord",
    help: "Help",
    commands: "Commands",
    status: "Status",
    ping: "Ping",
    prestige: "Beacon Prestige",
    new: "New!",
    add: "Add to Server",
    login: "Login with Discord",
  },
  tr: {
    label: "Turkce",
    code: "TR",
    bot: "Beacon Bot",
    support: "Destek sunucusu",
    join: "Discord'a katil",
    help: "Yardim",
    commands: "Komutlar",
    status: "Durum",
    ping: "Ping",
    prestige: "Beacon Prestige",
    new: "Yeni!",
    add: "Sunucuya ekle",
    login: "Discord ile giris",
  },
  ar: {
    label: "Arabic",
    code: "SA",
    bot: "Beacon Bot",
    support: "Support Server",
    join: "Join our Discord",
    help: "Help",
    commands: "Commands",
    status: "Status",
    ping: "Ping",
    prestige: "Beacon Prestige",
    new: "New!",
    add: "Add to Server",
    login: "Login with Discord",
  },
  pt: {
    label: "Portugues",
    code: "PT",
    bot: "Bot Beacon",
    support: "Servidor de suporte",
    join: "Entrar no Discord",
    help: "Ajuda",
    commands: "Comandos",
    status: "Status",
    ping: "Ping",
    prestige: "Beacon Prestige",
    new: "Novo!",
    add: "Adicionar ao servidor",
    login: "Entrar com Discord",
  },
  "pt-BR": {
    label: "Portugues (BR)",
    code: "BR",
    bot: "Bot Beacon",
    support: "Servidor de suporte",
    join: "Entrar no Discord",
    help: "Ajuda",
    commands: "Comandos",
    status: "Status",
    ping: "Ping",
    prestige: "Beacon Prestige",
    new: "Novo!",
    add: "Adicionar ao servidor",
    login: "Entrar com Discord",
  },
  it: {
    label: "Italiano",
    code: "IT",
    bot: "Bot Beacon",
    support: "Server supporto",
    join: "Unisciti a Discord",
    help: "Aiuto",
    commands: "Comandi",
    status: "Stato",
    ping: "Ping",
    prestige: "Beacon Prestige",
    new: "Nuovo!",
    add: "Aggiungi al server",
    login: "Accedi con Discord",
  },
  nl: {
    label: "Nederlands",
    code: "NL",
    bot: "Beacon Bot",
    support: "Supportserver",
    join: "Word lid van Discord",
    help: "Help",
    commands: "Commands",
    status: "Status",
    ping: "Ping",
    prestige: "Beacon Prestige",
    new: "Nieuw!",
    add: "Toevoegen aan server",
    login: "Login met Discord",
  },
};

function setLanguage(language) {
  const dictionary = translations[language] || translations.de;
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    element.textContent = dictionary[key] || translations.de[key] || element.textContent;
  });
  if (languageCode) languageCode.textContent = dictionary.code;
  if (languageLabel) languageLabel.textContent = dictionary.code;
  languageOptions.forEach((option) => {
    option.classList.toggle("is-selected", option.dataset.lang === language);
  });
  localStorage.setItem("beacon-language", language);
}

languageOptions.forEach((option) => {
  option.addEventListener("click", (event) => {
    event.preventDefault();
    setLanguage(option.dataset.lang);
    if (languageMenu) languageMenu.removeAttribute("open");
  });
});

setLanguage(localStorage.getItem("beacon-language") || "de");

if (menuToggle && mobileNav) {
  menuToggle.addEventListener("click", () => {
    mobileNav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", mobileNav.classList.contains("open") ? "true" : "false");
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    if (mobileNav && mobileNav.classList.contains("open")) {
      mobileNav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  });
});

if (heroPanel && !reduceMotion) {
  heroPanel.addEventListener("mousemove", setHeroHover);
  heroPanel.addEventListener("mouseleave", resetHeroTilt);
}

function defaultText() {
  return "—";
}

function setStats(stats) {
  const values = [
    stats?.guilds,
    stats?.users,
    stats?.ping,
    stats?.uptime,
  ];

  document.querySelectorAll(".stat-card strong").forEach((element, index) => {
    const value = values[index];
    element.textContent = Number.isFinite(value) ? value.toLocaleString() : defaultText();
  });
}

function fetchStats() {
  if (!window.fetch) return;
  fetch("/api/discord-stats")
    .then((response) => response.json())
    .then((data) => {
      if (!data || data.error) return;
      setStats(data);
      document.querySelectorAll(".stat-copy").forEach((element, index) => {
        const text = [
          "Live servers connected.",
          "Visible member total.",
          "Current gateway ping.",
          "Uptime since last restart.",
        ][index];
        element.textContent = text;
      });
    })
    .catch(() => {});
}

window.addEventListener("scroll", revealOnScroll);
window.addEventListener("resize", revealOnScroll);
window.addEventListener("load", () => {
  revealOnScroll();
  fetchStats();
});

const heroCanvas = document.querySelector(".hero-panel__stage");
const modelPath = "assets/sparkle_beacon.glb";

if (heroCanvas && !reduceMotion) {
  import("https://unpkg.com/three@0.166.1/build/three.module.js").then((THREE) => {
    return Promise.all([
      THREE,
      import("https://unpkg.com/three@0.166.1/examples/jsm/controls/OrbitControls.js"),
      import("https://unpkg.com/three@0.166.1/examples/jsm/loaders/GLTFLoader.js"),
    ]);
  }).then(([THREE, { OrbitControls }, { GLTFLoader }]) => {
    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(35, heroCanvas.clientWidth / heroCanvas.clientHeight, 0.15, 100);
    camera.position.set(3.4, 2.4, 5.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(heroCanvas.clientWidth, heroCanvas.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.75;
    heroCanvas.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableZoom = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.enablePan = false;
    controls.minDistance = 4.2;
    controls.maxDistance = 7.5;
    controls.target.set(0, 1.1, 0);

    const ambience = new THREE.HemisphereLight(0xffcfa3, 0x111111, 0.7);
    scene.add(ambience);

    const keyLight = new THREE.DirectionalLight(0xffb063, 1.8);
    keyLight.position.set(3.6, 4.8, 3.5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x4d3e2f, 0.65);
    fillLight.position.set(-4, 1.8, -2.5);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xff9f22, 0.65, 10);
    rimLight.position.set(-1.4, 3.5, 4.5);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 80),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.65, metalness: 0.18, transparent: true, opacity: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    scene.add(floor);

    const glow = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 2.7, 64),
      new THREE.MeshBasicMaterial({ color: 0xffa845, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    scene.add(glow);

    const beaconRoot = new THREE.Group();
    beaconRoot.rotation.y = Math.PI * 0.08;
    scene.add(beaconRoot);

    const loader = new GLTFLoader();
    loader.load(modelPath, (gltf) => {
      const model = gltf.scene;
      model.traverse((node) => {
        if (node.isMesh) {
          node.material = node.material.clone();
          node.material.metalness = 0.35;
          node.material.roughness = 0.3;
          node.material.emissive = new THREE.Color(0xff8b29);
          node.material.emissiveIntensity = 0.18;
          node.material.color = new THREE.Color(0x161616);
        }
      });
      beaconRoot.add(model);
    });

    const tick = () => {
      requestAnimationFrame(tick);
      controls.update();
      beaconRoot.rotation.y += 0.0014;
      renderer.render(scene, camera);
    };

    tick();

    const resizeRenderer = () => {
      const width = heroCanvas.clientWidth;
      const height = heroCanvas.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", resizeRenderer);
  }).catch(() => {});
}

if (!reduceMotion) {
  requestAnimationFrame(() => revealOnScroll());
}
