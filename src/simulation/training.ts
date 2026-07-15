import { overall } from '../domain/derived';
import { AttrKey, CareerSave, TrainingFocus, spendableAttrKeys } from '../domain/models';
import { Rng } from '../domain/rng';
import { getEffectiveRatings, syncHeightRating } from '../domain/traits';

const FOCUS_MAP: Record<TrainingFocus, AttrKey[]> = {
  shooting: ['fg', 'tp', 'ft'],
  finishing: ['ins', 'dnk'],
  playmaking: ['pss', 'drb', 'oiq'],
  defense: ['diq', 'spd'],
  rebounding: ['reb', 'stre', 'jmp'],
  athleticism: ['spd', 'jmp', 'stre'],
  iq: ['oiq', 'diq'],
  conditioning: ['endu'],
  recovery: ['endu'],
  balanced: spendableAttrKeys,
};

export function applyTraining(save: CareerSave, seedExtra: string): CareerSave {
  const rng = new Rng(`${save.settings.seed}:train:${save.season}:${save.nextGame}:${seedExtra}`);
  const intensityMult =
    save.trainingIntensity === 'intense' ? 1.35 : save.trainingIntensity === 'light' ? 0.7 : 1;
  const rEff = getEffectiveRatings(save.player);
  const fatigueGain =
    (save.trainingIntensity === 'intense' ? 8 : save.trainingIntensity === 'light' ? 2 : 4) *
    save.settings.fatigueImpact *
    (1.15 - rEff.endu / 200);
  let fatigue = Math.min(100, save.fatigue + fatigueGain);
  if (save.trainingFocus === 'recovery') fatigue = Math.max(0, fatigue - 12 - rEff.endu / 20);

  const keys = new Set<AttrKey>(FOCUS_MAP[save.trainingFocus]);
  if (save.secondaryFocus) FOCUS_MAP[save.secondaryFocus].forEach((k) => keys.add(k));

  const ratings = syncHeightRating({ ...save.player.ratings }, save.player.heightInches);
  const o = overall(save.player);
  const room = Math.max(0, save.hidden.truePotential - o);
  const work = save.hidden.workEthic / 100;
  const eff = save.settings.trainingEffectiveness * save.settings.progressionRate;

  for (const key of keys) {
    if (key === 'hgt') continue;
    const chance = 0.16 * intensityMult * work * eff * (0.5 + room / 20);
    if (rng.next() < chance && ratings[key] < 99) {
      const nearCap = ratings[key] > 85 ? 0.4 : 1;
      if (rng.next() < nearCap) ratings[key] += 1;
    }
  }

  if (
    save.phase === 'professional' &&
    save.age >= save.hidden.peakAgeMax &&
    rng.next() < 0.08 * save.settings.regressionRate
  ) {
    const soft = rng.pick(['spd', 'jmp', 'endu', 'dnk'] as AttrKey[]);
    ratings[soft] = Math.max(25, ratings[soft] - 1);
  }

  return {
    ...save,
    player: { ...save.player, ratings },
    fatigue,
  };
}
