import { describe, expect, it } from 'vitest';
import { createCareer } from '../domain/createCareer';
import { defaultPlayer, defaultSettings } from '../domain/defaults';
import {
  buildLeagueDayPairings,
  ensureNationalStandings,
  simulateLeagueDay,
} from './leagueSeason';
import { initialCollegeStandings, initialProStandings } from './schedule';

describe('leagueSeason', () => {
  it('builds college day pairings excluding user matchup', () => {
    const pairs = buildLeagueDayPairings('college', 1, 'day-seed', ['duke', 'north-carolina']);
    expect(pairs.length).toBeGreaterThan(50);
    expect(pairs.every((p) => p.homeId !== 'duke' && p.awayId !== 'duke')).toBe(true);
    expect(pairs.every((p) => p.homeId !== p.awayId)).toBe(true);
  });

  it('simulates a league day and updates national standings', () => {
    const save = createCareer(
      defaultPlayer(),
      { ...defaultSettings(), seed: 'lg-day' },
      'duke',
    );
    const standings = ensureNationalStandings(save);
    expect(standings.length).toBe(initialCollegeStandings().length);
    const { standings: next, games } = simulateLeagueDay({
      save: { ...save, standings },
      day: 1,
      excludeIds: ['duke'],
    });
    expect(games.length).toBeGreaterThan(20);
    expect(games[0].players.length).toBeGreaterThan(0);
    const played = next.filter((r) => r.wins + r.losses > 0);
    expect(played.length).toBeGreaterThan(10);
  });

  it('pro national standings cover 30 teams', () => {
    expect(initialProStandings().length).toBe(30);
  });
});

describe('retention math', () => {
  it('keeps seasons within retention window', () => {
    const currentSeason = 5;
    const retentionYears = 3;
    const keepFrom = Math.max(1, currentSeason - retentionYears + 1);
    expect(keepFrom).toBe(3);
    const seasons = [1, 2, 3, 4, 5];
    const kept = seasons.filter((s) => s >= keepFrom);
    expect(kept).toEqual([3, 4, 5]);
  });
});
