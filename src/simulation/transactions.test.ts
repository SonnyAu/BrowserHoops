import { describe, expect, it } from 'vitest';
import { createCareer } from '../domain/createCareer';
import { defaultPlayer, defaultSettings } from '../domain/defaults';
import { applyProOffseasonMarket } from './transactions';
import { toPerGame, mergeLines } from './playerStatsMath';
import { PlayerSeasonLine } from '../domain/models';

describe('AI offseason market', () => {
  it('runs trades/signings without moving the user', () => {
    let save = createCareer(
      defaultPlayer(),
      { ...defaultSettings(), seed: 'mkt-1', tradeFrequency: 1.5 },
      'duke',
    );
    save = {
      ...save,
      phase: 'professional',
      proTeamId: 'bos',
      id: 'mkt-save',
    };
    const beforeUserTeam = save.leagueRoster.filter((p) => p.id === 'user');
    const { save: next, transactions } = applyProOffseasonMarket(save);
    expect(next.leagueRoster.find((p) => p.id === 'user')).toEqual(beforeUserTeam[0]);
    expect(transactions.every((t) => !t.playerIds.includes('user'))).toBe(true);
    // Some market activity expected at higher frequency
    expect(transactions.length).toBeGreaterThan(0);
  });

  it('scales deal volume with tradeFrequency', () => {
    const mk = (freq: number) => {
      let save = createCareer(
        defaultPlayer(),
        { ...defaultSettings(), seed: `freq-${freq}`, tradeFrequency: freq },
        'duke',
      );
      save = { ...save, phase: 'professional', proTeamId: 'lal', id: `f-${freq}` };
      return applyProOffseasonMarket(save).transactions.filter((t) => t.type === 'trade')
        .length;
    };
    expect(mk(0.2)).toBeLessThanOrEqual(mk(2));
  });
});

describe('player stats math', () => {
  it('derives per-game and 2P / eFG%', () => {
    const line: PlayerSeasonLine = {
      id: 'x',
      saveId: 's',
      playerId: 'p',
      season: 2027,
      level: 'pro',
      phase: 'regular',
      teamId: 'gsw',
      teamAbbrev: 'GSW',
      age: 24,
      gp: 2,
      gs: 2,
      min: 60,
      fg: 10,
      fga: 20,
      tp: 4,
      tpa: 8,
      ft: 6,
      fta: 6,
      orb: 2,
      drb: 8,
      trb: 10,
      ast: 8,
      tov: 4,
      stl: 2,
      blk: 0,
      pf: 4,
      pts: 30,
    };
    const pg = toPerGame(line);
    expect(pg.mp).toBe(30);
    expect(pg.pts).toBe(15);
    expect(pg.twop).toBe(3); // (10-4)/2
    expect(pg.efgPct).toBeCloseTo((10 + 0.5 * 4) / 20);
    const career = mergeLines([line, { ...line, id: 'y', season: 2028 }])!;
    expect(career.gp).toBe(4);
    expect(toPerGame(career).pts).toBe(15);
  });
});
