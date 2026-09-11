export const MANUAL_BADGE_AWARDS = [
  { userId: "1125936586899587095", badgeId: "badge-hunter", discordBadgeId: "1548057337313493182" },
];

export function manualBadgesForUser(userId) {
  return MANUAL_BADGE_AWARDS.filter((award) => award.userId === String(userId));
}
