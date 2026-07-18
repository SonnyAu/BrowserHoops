import { describe, expect, it } from 'vitest';
import { createCareer } from '../domain/createCareer';
import { defaultPlayer, defaultSettings } from '../domain/defaults';
import { overall } from '../domain/derived';
import { applyProspectPath } from '../domain/starPresets';
import { applyOffseasonDevelopment, SEASON_XP_SOFT_CAP } from './development';
import { simulateNextGame } from './game';

describe('unified offseason development', () => {
  it('banks XP in-season without changing user ratings mid-season', () => {
    let save = createCareer(
      defaultPlayer(),
      { ...defaultSettings(), seed: 'xp-flat', collegeSeasonLength: 10 },
      'duke',
    );
    const ovr0 = overall(save.player);
    const ratings0 = { ...save.player.ratings };
    const mate0 = save.collegeRoster[0];
    const nba0 = save.leagueRoster[0];

    for (let i = 0; i < 5; i++) {
      const { save: next } = simulateNextGame(save);
      save = next;
    }

    expect(overall(save.player)).toBe(ovr0);
    expect(save.player.ratings).toEqual(ratings0);
    expect(save.seasonXp).toBeGreaterThan(0);
    expect(save.seasonXp).toBeLessThanOrEqual(SEASON_XP_SOFT_CAP);
    if (mate0) {
      const mate = save.collegeRoster.find((m) => m.id === mate0.id);
      expect(mate?.seasonXp ?? 0).toBeGreaterThan(0);
      expect(mate?.ratings).toEqual(mate0.ratings);
    }
    if (nba0) {
      const nba = save.leagueRoster.find((p) => p.id === nba0.id);
      expect(nba?.seasonXp ?? 0).toBeGreaterThan(0);
      expect(nba?.ratings).toEqual(nba0.ratings);
    }
  });

  it('applies the same offseason pipeline to user, teammate, and NBA pack', () => {
    let save = createCareer(
      applyProspectPath(defaultPlayer(), 'blueBlood'),
      { ...defaultSettings(), seed: 'offseason-all', collegeSeasonLength: 6 },
      'duke',
    );
    expect(save.collegeRoster.length).toBeGreaterThan(0);
    expect(save.leagueRoster.length).toBeGreaterThan(0);
    save = {
      ...save,
      minutes: 30,
      usage: 0.28,
      fatigue: 0,
      seasonXp: 280,
      collegeRoster: save.collegeRoster.map((m, i) =>
        i === 0 ? { ...m, seasonXp: 220, age: 19, truePotential: Math.max(m.truePotential, m.overall + 8) } : m,
      ),
      leagueRoster: save.leagueRoster.map((p, i) =>
        i === 0
          ? {
              ...p,
              seasonXp: 200,
              age: 22,
              truePotential: Math.max(p.truePotential ?? p.overall + 6, p.overall + 6),
            }
          : p,
      ),
    };

    const userBefore = overall(save.player);
    const mateId = save.collegeRoster[0].id;
    const nbaId = save.leagueRoster[0].id;
    const mateBefore = save.collegeRoster[0].overall;
    const nbaBefore = save.leagueRoster[0].overall;
    const nbaAgeBefore = save.leagueRoster[0].age ?? 0;

    const after = applyOffseasonDevelopment(save);
    const mateAfter = after.collegeRoster.find((m) => m.id === mateId)!;
    const nbaAfter = after.leagueRoster.find((p) => p.id === nbaId)!;

    expect(after.seasonXp).toBe(0);
    expect(mateAfter.seasonXp).toBe(0);
    expect(nbaAfter.seasonXp).toBe(0);
    expect(after.age).toBe(save.age + 1);
    expect(nbaAfter.age).toBe(nbaAgeBefore + 1);

    const moved =
      overall(after.player) !== userBefore ||
      mateAfter.overall !== mateBefore ||
      nbaAfter.overall !== nbaBefore;
    expect(moved).toBe(true);
    expect(after.developmentLog.length).toBeGreaterThan(0);
    // Personal log is the user only — not teammates or NBA pack notables.
    expect(after.developmentLog.every((line) => line.includes(save.player.name))).toBe(true);
    expect(after.developmentLog.some((line) => line.includes(mateAfter.name))).toBe(false);
  });

  it('ages the NBA pack during a college season finalize', () => {
    let save = createCareer(
      defaultPlayer(),
      { ...defaultSettings(), seed: 'college-ages-nba', collegeSeasonLength: 3 },
      'duke',
    );
    const sampleId = save.leagueRoster[5]?.id;
    const ageBefore = save.leagueRoster[5]?.age ?? 0;
    expect(sampleId).toBeTruthy();

    // Burn schedule + March Madness then finalize
    for (let i = 0; i < 250; i++) {
      if (save.phase === 'seasonReview') break;
      const { save: next } = simulateNextGame(save);
      save = next;
    }

    expect(save.phase).toBe('seasonReview');
    const aged = save.leagueRoster.find((p) => p.id === sampleId);
    expect(aged?.age).toBe(ageBefore + 1);
    expect(aged?.seasonXp).toBe(0);
  });
});
