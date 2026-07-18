import { BracketState, CareerSave, StandingRow } from '../domain/models';
import { projectMarchMadness } from './marchMadness';
import { projectNbaPlayoffs } from './nbaPlayoffs';

/** Predicted bracket from current standings (regular season). */
export function projectBracketFromStandings(save: CareerSave): BracketState | null {
  const standings = save.standings ?? [];
  if (!standings.length) return null;
  if (save.phase === 'professional' || save.proTeamId) {
    return projectNbaPlayoffs(standings, save.season, save.settings.playIn !== false);
  }
  if (save.phase === 'college') {
    return projectMarchMadness(standings, save.season);
  }
  return null;
}

/** Active bracket if postseason started; else live projection. */
export function bracketForDisplay(save: CareerSave): BracketState | null {
  if (save.bracket && save.seasonStage !== 'regular') {
    return save.bracket;
  }
  return projectBracketFromStandings(save);
}

export function seedPreviewNba(standings: StandingRow[], conference: 'East' | 'West') {
  const rows = standings
    .filter((r) => r.conference === conference)
    .sort((a, b) => {
      const ga = a.wins + a.losses || 1;
      const gb = b.wins + b.losses || 1;
      return b.wins / gb - a.wins / ga || b.wins - a.wins;
    });
  return rows.slice(0, 10).map((r, i) => ({ seed: i + 1, ...r }));
}
