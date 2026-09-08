const svg = (body) => `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;

export const BADGE_ICONS = {
  verified: svg(`
    <defs><linearGradient id="verified-g" x1="8" y1="8" x2="56" y2="56"><stop stop-color="#58a6ff"/><stop offset="1" stop-color="#1769ff"/></linearGradient></defs>
    <path fill="url(#verified-g)" d="M32 4l6.4 5 8.1-1 3.1 7.5 7.3 3.8-2 7.9 3.6 7.3-6.4 5-.9 8.1-8.1 1.6-5.6 5.9-7.5-3.2-7.5 3.2-5.6-5.9-8.1-1.6-.9-8.1-6.4-5 3.6-7.3-2-7.9 7.3-3.8L17.5 8l8.1 1z"/>
    <path fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" d="M20 33l8 8 17-19"/>
  `),
  "beacon-member": svg(`
    <defs><linearGradient id="member-g" x1="18" y1="6" x2="46" y2="58"><stop stop-color="#ffe17a"/><stop offset=".45" stop-color="#ffc31c"/><stop offset="1" stop-color="#b66a00"/></linearGradient></defs>
    <path fill="url(#member-g)" d="M32 7l8 20-8 8-8-8z"/>
    <path fill="#6f4200" d="M32 35l10 12-10 11-10-11z"/>
    <path fill="#ffc31c" d="M32 35l10 12H22z"/>
    <path stroke="#ffc31c" stroke-width="4" stroke-linecap="round" d="M32 3v9M15 14l6 7M49 14l-6 7M10 31h9M54 31h-9"/>
  `),
  pioneer: svg(`
    <defs><linearGradient id="pioneer-g" x1="8" y1="8" x2="56" y2="56"><stop stop-color="#ffe17a"/><stop offset="1" stop-color="#ffae00"/></linearGradient></defs>
    <path fill="url(#pioneer-g)" d="M13 24h11a16 16 0 0 1 16 0h11l-6 8 6 8H40a16 16 0 0 1-16 0H13l6-8z"/>
    <circle cx="32" cy="32" r="21" fill="none" stroke="#ffc31c" stroke-width="5"/>
    <circle cx="32" cy="32" r="14" fill="#ffb000"/>
    <text x="32" y="41" text-anchor="middle" font-size="21" font-weight="900" fill="#fff" font-family="Arial, sans-serif">01</text>
  `),
  "beacon-developer": svg(`
    <defs><linearGradient id="dev-g" x1="8" y1="8" x2="56" y2="56"><stop stop-color="#ff8a00"/><stop offset="1" stop-color="#ff4b00"/></linearGradient></defs>
    <path fill="none" stroke="url(#dev-g)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" d="M24 18L10 32l14 14M40 18l14 14-14 14"/>
    <path fill="none" stroke="#ffb000" stroke-width="5" stroke-linecap="round" d="M36 11L28 53"/>
  `),
  donator: svg(`
    <defs><linearGradient id="donor-g" x1="10" y1="8" x2="54" y2="56"><stop stop-color="#5edb54"/><stop offset="1" stop-color="#14821e"/></linearGradient></defs>
    <circle cx="32" cy="32" r="25" fill="url(#donor-g)"/>
    <path fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" d="M39 20h-9c-5 0-8 3-8 7s3 7 8 7h5c5 0 8 3 8 7s-3 8-9 8h-10M32 14v8M32 50v-8"/>
  `),
  premium: svg(`
    <defs><linearGradient id="premium-g" x1="11" y1="8" x2="53" y2="55"><stop stop-color="#a66bff"/><stop offset="1" stop-color="#7432e6"/></linearGradient></defs>
    <path fill="url(#premium-g)" d="M11 43h42l-4 10H15zM13 39l5-26 12 15 11-20 7 21 9-12-6 22z"/>
    <circle cx="18" cy="13" r="4" fill="#8f5bff"/><circle cx="41" cy="8" r="4" fill="#8f5bff"/><circle cx="57" cy="17" r="4" fill="#8f5bff"/>
  `),
  staff: svg(`
    <defs><linearGradient id="staff-g" x1="16" y1="8" x2="48" y2="56"><stop stop-color="#455463"/><stop offset="1" stop-color="#17202a"/></linearGradient></defs>
    <rect x="17" y="13" width="30" height="44" rx="6" fill="url(#staff-g)"/>
    <rect x="26" y="7" width="12" height="12" rx="4" fill="#455463"/><circle cx="32" cy="13" r="3" fill="#fff"/>
    <path stroke="#ffc31c" stroke-width="2.5" stroke-linecap="round" d="M32 24v7M25 29l5 4M39 29l-5 4"/>
    <text x="32" y="48" text-anchor="middle" font-size="13" font-weight="900" fill="#fff" font-family="Arial, sans-serif">STAFF</text>
  `),
  helper: svg(`
    <defs><linearGradient id="helper-a" x1="8" y1="8" x2="56" y2="56"><stop stop-color="#ffd34d"/><stop offset="1" stop-color="#ff9f00"/></linearGradient><linearGradient id="helper-b" x1="25" y1="18" x2="52" y2="47"><stop stop-color="#3f4a56"/><stop offset="1" stop-color="#161d25"/></linearGradient></defs>
    <path fill="url(#helper-a)" d="M8 30l13-17 12 7-13 20z"/><path fill="url(#helper-b)" d="M31 18l9-5 16 11-12 16-11-2-8 7-9-7 11-12z"/>
    <path stroke="#ffd34d" stroke-width="5" stroke-linecap="round" d="M22 42l7 8M16 39l7 9M36 40l-8 10"/>
  `),
  "bug-hunter": svg(`
    <defs><linearGradient id="bug-g" x1="12" y1="8" x2="52" y2="56"><stop stop-color="#3ea83a"/><stop offset="1" stop-color="#155c17"/></linearGradient></defs>
    <circle cx="28" cy="28" r="17" fill="none" stroke="url(#bug-g)" stroke-width="6"/><path stroke="url(#bug-g)" stroke-width="7" stroke-linecap="round" d="M41 41l12 12"/>
    <ellipse cx="28" cy="28" rx="8" ry="11" fill="#176a19"/><path stroke="#1f8a22" stroke-width="3" stroke-linecap="round" d="M20 28h16M22 20l-6-5M34 20l6-5M22 36l-6 5M34 36l6 5M28 17v22"/>
  `),
  "server-booster": svg(`
    <defs><linearGradient id="boost-g" x1="14" y1="8" x2="50" y2="56"><stop stop-color="#ff63cf"/><stop offset="1" stop-color="#e13ba8"/></linearGradient></defs>
    <path fill="url(#boost-g)" d="M32 5l18 14v26L32 59 14 45V19z"/>
    <path fill="#fff" opacity=".9" d="M32 14l10 9v20L32 50l-10-7V23z"/>
    <path fill="url(#boost-g)" d="M32 20l6 5v15l-6 4-6-4V25z"/>
  `),
  "the-beacon": svg(`
    <defs><linearGradient id="beacon-g" x1="15" y1="5" x2="49" y2="57"><stop stop-color="#ffe17a"/><stop offset="1" stop-color="#ffad00"/></linearGradient></defs>
    <path fill="none" stroke="url(#beacon-g)" stroke-width="4" stroke-linecap="round" d="M12 47c5 6 12 9 20 9s15-3 20-9M12 17c5-6 12-9 20-9s15 3 20 9"/>
    <path fill="url(#beacon-g)" d="M32 8l8 20-8 8-8-8zM32 36l8 12-8 9-8-9z"/>
    <path stroke="#ffc31c" stroke-width="3" stroke-linecap="round" d="M32 3v8M18 13l5 6M46 13l-5 6"/>
  `),
  "beacons-princess": svg(`
    <defs><linearGradient id="princess-g" x1="8" y1="10" x2="56" y2="54"><stop stop-color="#ff80d1"/><stop offset="1" stop-color="#ec3fa3"/></linearGradient></defs>
    <path fill="url(#princess-g)" d="M8 43c8-11 12-11 17-3 4-14 10-18 14 0 5-8 9-8 17 3v8H8z"/>
    <path fill="none" stroke="url(#princess-g)" stroke-width="4" stroke-linecap="round" d="M13 43c5-13 10-19 18-23 8 4 14 10 20 23M20 34c-7-6-4-14 4-10M44 34c7-6 4-14-4-10"/>
    <path fill="#fff0fb" d="M32 29c5-6 12 1 0 10-12-9-5-16 0-10z"/>
  `),
  "not-found": svg(`
    <defs><linearGradient id="err-g" x1="12" y1="8" x2="52" y2="56"><stop stop-color="#ff3030"/><stop offset="1" stop-color="#d71920"/></linearGradient></defs>
    <path fill="url(#err-g)" d="M32 6l27 48H5z"/>
    <path stroke="#fff" stroke-width="6" stroke-linecap="round" d="M32 22v15"/><circle cx="32" cy="46" r="3.5" fill="#fff"/>
  `),
  "lost-signal": svg(`
    <defs><linearGradient id="lost-g" x1="10" y1="10" x2="54" y2="54"><stop stop-color="#8b51ff"/><stop offset="1" stop-color="#5b25be"/></linearGradient></defs>
    <path fill="none" stroke="url(#lost-g)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" d="M8 32c10-17 38-17 48 0-10 17-38 17-48 0zM19 48L49 16"/>
    <circle cx="32" cy="32" r="9" fill="url(#lost-g)" opacity=".9"/>
  `),
  "night-owl": svg(`
    <defs><linearGradient id="owl-g" x1="13" y1="7" x2="51" y2="57"><stop stop-color="#2c85ff"/><stop offset="1" stop-color="#0058c7"/></linearGradient></defs>
    <path fill="url(#owl-g)" d="M17 19l8-8 7 8 7-8 8 8v20c0 12-7 19-15 19S17 51 17 39z"/>
    <circle cx="25" cy="32" r="7" fill="#fff"/><circle cx="39" cy="32" r="7" fill="#fff"/><circle cx="25" cy="32" r="3" fill="#1d63c9"/><circle cx="39" cy="32" r="3" fill="#1d63c9"/><path fill="#fff" d="M32 40l5 6H27z"/>
  `),
  "command-relic": svg(`
    <defs><linearGradient id="cmd-g" x1="12" y1="8" x2="52" y2="56"><stop stop-color="#4b5a66"/><stop offset="1" stop-color="#19222b"/></linearGradient></defs>
    <rect x="13" y="11" width="38" height="42" rx="5" fill="url(#cmd-g)"/><rect x="9" y="8" width="46" height="9" rx="4" fill="#34424e"/><rect x="9" y="47" width="46" height="9" rx="4" fill="#34424e"/>
    <path stroke="#65e84d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M24 27l8 6-8 6M36 41h10"/>
  `),
  "prismatic-key": svg(`
    <defs><linearGradient id="key-g" x1="14" y1="10" x2="50" y2="56"><stop stop-color="#a66bff"/><stop offset="1" stop-color="#5e25c9"/></linearGradient></defs>
    <circle cx="42" cy="19" r="11" fill="none" stroke="url(#key-g)" stroke-width="7"/><path stroke="url(#key-g)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" d="M34 27L13 48M22 39l7 7M28 33l6 6"/>
    <path stroke="#fff" stroke-width="3" stroke-linecap="round" d="M38 19h8"/>
  `),
  "lucky-signal": svg(`
    <defs><linearGradient id="luck-g" x1="12" y1="8" x2="52" y2="56"><stop stop-color="#ffd34d"/><stop offset="1" stop-color="#ffb000"/></linearGradient></defs>
    <path fill="url(#luck-g)" d="M32 6l21 12v28L32 58 11 46V18z"/><path fill="#fff7dc" d="M32 10l17 10-17 10-17-10z" opacity=".42"/>
    <text x="23" y="43" font-size="20" font-weight="900" fill="#fff" font-family="Arial, sans-serif">?</text><text x="38" y="43" font-size="20" font-weight="900" fill="#fff" font-family="Arial, sans-serif">?</text>
  `),
  "found-the-light": svg(`
    <defs><linearGradient id="light-g" x1="13" y1="7" x2="51" y2="57"><stop stop-color="#65ca48"/><stop offset="1" stop-color="#22851f"/></linearGradient></defs>
    <path fill="url(#light-g)" d="M32 7c13 0 22 11 22 25 0 14-9 24-22 24S10 46 10 32C10 18 19 7 32 7z"/>
    <path fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" d="M17 27l5 4 5-4 5 4 5-4 5 4 5-4M18 43l5-4 5 4 5-4 5 4 5-4"/>
    <path fill="#fff" d="M32 18l5 12-5 5-5-5zM32 35l5 8-5 6-5-6z"/>
  `),
  witness: svg(`
    <defs><linearGradient id="witness-g" x1="11" y1="8" x2="53" y2="56"><stop stop-color="#4b83d5"/><stop offset="1" stop-color="#123b7a"/></linearGradient></defs>
    <path fill="url(#witness-g)" d="M32 6l22 9v17c0 14-8 23-22 27-14-4-22-13-22-27V15z"/>
    <circle cx="32" cy="27" r="8" fill="#fff"/><path fill="#fff" d="M20 50c2-10 7-15 12-15s10 5 12 15z"/>
    <path fill="none" stroke="#dbe9ff" stroke-width="3" d="M20 17l12-5 12 5"/>
  `),
};

export function iconForBadge(id) {
  return BADGE_ICONS[id] || BADGE_ICONS["beacon-member"];
}
