import { describe, expect, it } from 'vitest';
import { colleges } from '../data/colleges';
import { StandingRow } from '../domain/models';
import {
  buildMarchMadnessBracket,
  isMadnessComplete,
  nextMadnessRound,
  projectMarchMadness,
} from './marchMadness';
import { simulateNeutralGame } from './leagueSeason';
import { createCareer } from '../domain/createCareer';
import { defaultPlayer, defaultSettings } from '../domain/defaults';
import { advanceMadnessWinners } from './marchMadness';

function fakeStandings(): StandingRow[] {
  return colleges.map((c, i) => ({
    teamId: c.id,
    teamName: c.name,
    wins: Math.max(0, 28 - (i % 20)),
    losses: i % 12,
    conference: c.conference,
  }));
}

describe('marchMadness', () => {
  it('builds a 68-team field with First Four and Round of 64', () => {
    const bracket = buildMarchMadnessBracket(fakeStandings(), 1);
    expect(bracket.firstFour).toHaveLength(4);
    expect(bracket.rounds!.filter((m) => m.round === 'Round of 64')).toHaveLength(32);
    expect(bracket.status).toBe('active');
    const a = buildMarchMadnessBracket(fakeStandings(), 1);
    const b = buildMarchMadnessBracket(fakeStandings(), 1);
    expect(a.firstFour![0].slotA.teamId).toBe(b.firstFour![0].slotA.teamId);
  });

  it('projection is marked projected', () => {
    const p = projectMarchMadness(fakeStandings(), 2);
    expect(p.status).toBe('projected');
    expect(p.firstFour).toHaveLength(4);
  });

  it('can complete a championship path', () => {
    let save = createCareer(
      defaultPlayer(),
      { ...defaultSettings(), seed: 'mm-path', collegeSeasonLength: 2 },
      'duke',
    );
    let bracket = buildMarchMadnessBracket(save.standings, 1);
    expect(nextMadnessRound(bracket)).toBe('First Four');

    // Sim all First Four
    let firstFour = [...(bracket.firstFour ?? [])];
    for (let i = 0; i < firstFour.length; i++) {
      const m = firstFour[i];
      const { game, homeWon, homeScore, awayScore } = simulateNeutralGame(
        save,
        m.slotA.teamId!,
        m.slotB.teamId!,
        100 + i,
        'tournament',
        { round: 'First Four' },
      );
      firstFour[i] = {
        ...m,
        completed: true,
        winnerId: homeWon ? m.slotA.teamId! : m.slotB.teamId!,
        homeScore,
        awayScore,
        leagueGameId: game.id,
      };
    }
    bracket = advanceMadnessWinners({ ...bracket, firstFour }, 'First Four');
    expect(nextMadnessRound(bracket)).toBe('Round of 64');

    const rounds = ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite Eight', 'Final Four', 'Championship'];
    for (const round of rounds) {
      let list = [...(bracket.rounds ?? [])];
      const open = list.filter(
        (m) =>
          m.round === round &&
          !m.completed &&
          m.slotA.teamId &&
          m.slotB.teamId &&
          !String(m.slotA.teamId).startsWith('ff-winner'),
      );
      expect(open.length).toBeGreaterThan(0);
      for (const m of open) {
        const { game, homeWon, homeScore, awayScore } = simulateNeutralGame(
          save,
          m.slotA.teamId!,
          m.slotB.teamId!,
          200,
          'tournament',
          { round },
        );
        list = list.map((x) =>
          x.id === m.id
            ? {
                ...x,
                completed: true,
                winnerId: homeWon ? m.slotA.teamId! : m.slotB.teamId!,
                homeScore,
                awayScore,
                leagueGameId: game.id,
              }
            : x,
        );
      }
      bracket = advanceMadnessWinners({ ...bracket, rounds: list }, round);
    }
    expect(isMadnessComplete(bracket)).toBe(true);
    expect(bracket.championId).toBeTruthy();
  });
});
