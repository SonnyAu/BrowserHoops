import { PlayerSeasonLine } from '../domain/models';
import { nbaPlayerHistory } from './nbaPlayerHistory';

/** Decode a pack player's real prior NBA seasons into displayable season lines. */
export function getPackSeasonLines(playerId: string, bornYear: number): PlayerSeasonLine[] {
  const rows = nbaPlayerHistory[playerId];
  if (!rows) return [];
  return rows.map((r) => {
    const [season, abbrev, playoffs, gp, gs, min, fg, fga, tp, tpa, ft, fta, orb, drb, ast, tov, stl, blk, pf, pts] = r;
    const phase: 'regular' | 'playoffs' = playoffs ? 'playoffs' : 'regular';
    return {
      id: `pack:${playerId}:${season}:${phase}:${abbrev}`,
      saveId: 'pack',
      playerId,
      season,
      level: 'pro' as const,
      phase,
      teamId: abbrev.toLowerCase(),
      teamAbbrev: abbrev,
      age: season - bornYear,
      gp,
      gs,
      min,
      fg,
      fga,
      tp,
      tpa,
      ft,
      fta,
      orb,
      drb,
      trb: orb + drb,
      ast,
      tov,
      stl,
      blk,
      pf,
      pts,
      pack: true,
    };
  });
}
