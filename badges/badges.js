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
  return `
    <article class="badge-card badge-card--${escapeHtml(badge.tone)}">
      <div class="badge-symbol" aria-hidden="true">${iconForBadge(badge.id)}</div>
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
}
