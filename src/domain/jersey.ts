/** Stable jersey number 0–99 from player id when not set. */
export function defaultJerseyNumber(playerId: string): number {
  let h = 0;
  for (let i = 0; i < playerId.length; i++) {
    h = (h * 31 + playerId.charCodeAt(i)) >>> 0;
  }
  return h % 100;
}

export function jerseyForTeam(
  playerId: string,
  teamId: string,
  jerseyNumber?: number,
  jerseyByTeamId?: Record<string, number>,
): number {
  if (jerseyByTeamId?.[teamId] != null) return jerseyByTeamId[teamId]!;
  if (jerseyNumber != null) return jerseyNumber;
  return defaultJerseyNumber(playerId);
}
