import { describe, expect, it } from 'vitest';
import { defaultPlayer } from './defaults';
import { overall } from './derived';
import { canIncrease, remainingPoints } from './points';
import { applyStarPreset, STAR_PRESETS } from './starPresets';
import { spendableAttrKeys } from './models';

describe('star preset auto-fill', () => {
  it('spends nearly the full point pool for each star tier', () => {
    for (const stars of [1, 2, 3, 4, 5] as const) {
      const built = applyStarPreset(defaultPlayer(), stars);
      const left = remainingPoints(built);
      const canAny = spendableAttrKeys.some((k) => canIncrease(built, k));
      // Either fully spent, or stuck at soft caps with leftover cheaper than any legal bump
      expect(left).toBeGreaterThanOrEqual(0);
      if (canAny) {
        expect(left).toBe(0);
      } else {
        expect(left).toBeLessThan(STAR_PRESETS[stars].pointPool * 0.15);
      }
    }
  });

  it('raises overall as star tier increases', () => {
    const o1 = overall(applyStarPreset(defaultPlayer(), 1));
    const o3 = overall(applyStarPreset(defaultPlayer(), 3));
    const o5 = overall(applyStarPreset(defaultPlayer(), 5));
    expect(o5).toBeGreaterThan(o3);
    expect(o3).toBeGreaterThan(o1);
  });

  it('rebuilds a filled sheet when position changes at the same star', () => {
    const asPg = applyStarPreset({ ...defaultPlayer(), position: 'PG' }, 4);
    const asC = applyStarPreset({ ...asPg, position: 'C' }, 4);
    expect(asC.position).toBe('C');
    expect(asC.ratings.reb).toBeGreaterThan(asPg.ratings.reb);
    expect(remainingPoints(asC)).toBeGreaterThanOrEqual(0);
    expect(spendableAttrKeys.some((k) => canIncrease(asC, k)) ? remainingPoints(asC) : 0).toBe(0);
  });
});
