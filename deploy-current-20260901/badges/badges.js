import { BEACON_BADGES } from "./badge-data.js";
import { iconForBadge } from "./badge-icons.js";

const grid = document.querySelector("#badge-grid");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

function badgeCard(badge) {
  const png = `/assets/badges/${escapeHtml(badge.id)}.png`;
  return `
    <article class="badge-card badge-card--${escapeHtml(badge.tone)}">
      <div class="badge-symbol" aria-hidden="true">
        <img class="badge-symbol-img" src="${png}" alt="" loading="lazy" decoding="async" />
        <span class="badge-symbol-fallback">${iconForBadge(badge.id)}</span>
      </div>
      <div>
        <div class="badge-topline">
          <h2>${escapeHtml(badge.name)}</h2>
          <span>${escapeHtml(badge.tag)}</span>
        </div>
        <p>${escapeHtml(badge.summary)}</p>
        <strong>Hint</strong>
        <p class="unlock">${escapeHtml(badge.hint)}</p>
      </div>
    </article>
  `;
}

if (grid) {
  grid.innerHTML = BEACON_BADGES.map(badgeCard).join("");
  grid.querySelectorAll(".badge-symbol-img").forEach((image) => {
    image.addEventListener("load", () => image.closest(".badge-symbol")?.classList.add("has-png"));
    image.addEventListener("error", () => image.remove());
  });
}
