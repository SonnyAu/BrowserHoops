import { describe, expect, it } from 'vitest';
import { createHiddenDevelopment } from './createCareer';
import { defaultPlayer } from './defaults';
import { computeTruePotential, overall } from './derived';
import { canIncrease, remainingPoints } from './points';
import {
  PROSPECT_PATH_IDS,
  getProspectPath,
  pathFromStars,
} from './prospectPaths';
import { applyProspectPath } from './starPresets';
import { spendableAttrKeys } from './models';
import { generateRecruitingProfile } from '../simulation/recruiting';

describe('prospect paths', () => {
  it('auto-builds land near BBGM OVR targets for SG', () => {
    for (const id of PROSPECT_PATH_IDS) {
      const path = getProspectPath(id);
      const built = applyProspectPath(
        { ...defaultPlayer(), position: 'SG', traitIds: [] },
        id,
      );
      const ovr = overall(built);
      expect(ovr).toBeGreaterThanOrEqual(path.targetOvr - 2);
      expect(ovr).toBeLessThanOrEqual(path.targetOvr + 2);
      expect(built.prospectPath).toBe(id);
      expect(built.intendedStars).toBe(path.stars);
    }
  });

  it('orders elite paths by overall', () => {
    const low = overall(applyProspectPath(defaultPlayer(), 'lotteryLow'));
    const high = overall(applyProspectPath(defaultPlayer(), 'lotteryHigh'));
    const one = overall(applyProspectPath(defaultPlayer(), 'consensusOne'));
    const gen = overall(applyProspectPath(defaultPlayer(), 'generational'));
    expect(gen).toBeGreaterThan(one);
    expect(one).toBeGreaterThan(high);
    expect(high).toBeGreaterThan(low);
  });

  it('spends the path budget or hits soft caps', () => {
    for (const id of PROSPECT_PATH_IDS) {
      const built = applyProspectPath(defaultPlayer(), id);
      const left = remainingPoints(built);
      const canAny = spendableAttrKeys.some((k) => canIncrease(built, k));
      expect(left).toBeGreaterThanOrEqual(0);
      if (canAny) expect(left).toBe(0);
    }
  });

  it('sleeper has more true potential room than underdog despite similar start', () => {
    const under = applyProspectPath(defaultPlayer(), 'underdog');
    const sleep = applyProspectPath(defaultPlayer(), 'sleeper');
    const underPot = computeTruePotential(under, {
      age: 18,
      stars: under.intendedStars,
      potBonus: getProspectPath('underdog').potBonus,
    });
    const sleepPot = computeTruePotential(sleep, {
      age: 18,
      stars: sleep.intendedStars,
      potBonus: getProspectPath('sleeper').potBonus,
    });
    expect(sleepPot - overall(sleep)).toBeGreaterThan(underPot - overall(under));
    const hidden = createHiddenDevelopment(sleep, 'sleeper-test');
    expect(hidden.potentialBias).toBeLessThan(0);
    expect(hidden.peakAgeMin).toBeGreaterThanOrEqual(25);
  });

  it('recruiting ranks respect path bands', () => {
    for (const id of ['lotteryLow', 'lotteryHigh', 'consensusOne', 'generational'] as const) {
      const path = getProspectPath(id);
      const player = applyProspectPath({ ...defaultPlayer(), name: id }, id);
      const profile = generateRecruitingProfile(player, 'rank-seed');
      expect(profile.nationalRank).toBeGreaterThanOrEqual(path.rankBand[0]);
      expect(profile.nationalRank).toBeLessThanOrEqual(path.rankBand[1]);
      expect(profile.stars).toBe(5);
      expect(profile.accolades.length).toBeGreaterThan(0);
    }
  });

  it('maps legacy stars onto default paths', () => {
    expect(pathFromStars(1)).toBe('underdog');
    expect(pathFromStars(5)).toBe('lotteryHigh');
  });
});
