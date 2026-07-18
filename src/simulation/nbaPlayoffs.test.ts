import { describe, expect, it } from 'vitest';
import { nbaTeams } from '../data/nbaTeams';
import { StandingRow } from '../domain/models';
import {
  activeSeries,
  advanceNbaBracket,
  buildNbaPlayoffBracket,
  homeTeamForSeriesGame,
  isNbaPlayoffsComplete,
  projectNbaPlayoffs,
  resolvePlayInIntoSeries,
} from './nbaPlayoffs';

function proStandings(): StandingRow[] {
  return nbaTeams.map((t, i) => ({
    teamId: t.id,
    teamName: `${t.region} ${t.name}`,
    wins: 50 - (i % 15),
    losses: 20 + (i % 10),
    conference: t.conference,
  }));
}

describe('nbaPlayoffs', () => {
  it('seeds top 8 without play-in', () => {
    const b = buildNbaPlayoffBracket(proStandings(), 1, false);
    expect(b.playIn?.length ?? 0).toBe(0);
    expect(b.series).toHaveLength(8);
    expect(b.series!.every((s) => s.round === 'First Round')).toBe(true);
  });

  it('creates play-in when enabled', () => {
    const b = buildNbaPlayoffBracket(proStandings(), 1, true);
    expect(b.playIn!.length).toBeGreaterThan(0);
    expect(b.series?.length ?? 0).toBe(0);
    const projected = projectNbaPlayoffs(proStandings(), 1, true);
    expect(projected.status).toBe('projected');
  });

  it('uses 2-2-1-1-1 home court', () => {
    const b = buildNbaPlayoffBracket(proStandings(), 1, false);
    const s = b.series![0];
    const higher = s.teamASeed <= s.teamBSeed ? s.teamAId : s.teamBId;
    expect(homeTeamForSeriesGame(s, 1)).toBe(higher);
    expect(homeTeamForSeriesGame(s, 3)).not.toBe(higher);
    expect(homeTeamForSeriesGame(s, 5)).toBe(higher);
  });

  it('resolves play-in into first round then can crown a champion', () => {
    let bracket = buildNbaPlayoffBracket(proStandings(), 3, true);
    let playIn = [...(bracket.playIn ?? [])];
    // Complete 7v8 and 9v10 for both conferences
    playIn = playIn.map((m) => {
      if (!m.slotA.teamId || !m.slotB.teamId) return m;
      return {
        ...m,
        completed: true,
        winnerId: m.slotA.teamId,
        homeScore: 120,
        awayScore: 110,
      };
    });
    bracket = resolvePlayInIntoSeries({ ...bracket, playIn }, proStandings());
    // Fill 8-seed games if still open
    playIn = [...(bracket.playIn ?? [])];
    playIn = playIn.map((m) => {
      if (m.completed || !m.slotA.teamId || !m.slotB.teamId) return m;
      return {
        ...m,
        completed: true,
        winnerId: m.slotA.teamId,
        homeScore: 115,
        awayScore: 100,
      };
    });
    bracket = resolvePlayInIntoSeries({ ...bracket, playIn }, proStandings());
    expect(bracket.series!.length).toBe(8);

    // Sweep every series to Finals
    let guard = 0;
    while (!isNbaPlayoffsComplete(bracket) && guard++ < 80) {
      const open = activeSeries(bracket);
      if (!open.length) {
        bracket = advanceNbaBracket(bracket);
        continue;
      }
      let series = [...(bracket.series ?? [])];
      for (const s of open) {
        const winner = s.teamAId;
        series = series.map((x) =>
          x.id === s.id
            ? {
                ...x,
                winsA: 4,
                winsB: 0,
                completed: true,
                winnerId: winner,
                games: [
                  {
                    gameInSeries: 1,
                    homeTeamId: s.teamAId,
                    winnerId: winner,
                    homeScore: 110,
                    awayScore: 100,
                  },
                ],
              }
            : x,
        );
      }
      bracket = advanceNbaBracket({ ...bracket, series });
    }
    expect(isNbaPlayoffsComplete(bracket)).toBe(true);
    expect(bracket.championId).toBeTruthy();
  });
});
