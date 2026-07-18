import { CareerSave } from '../domain/models';

/** Fatigue / recovery only — attribute growth is hidden XP applied in the offseason. */
export function applyTraining(save: CareerSave, _seedExtra: string): CareerSave {
  const intensityMult =
    save.trainingIntensity === 'intense' ? 1.35 : save.trainingIntensity === 'light' ? 0.7 : 1;
  const endu = save.player.ratings.endu;
  const fatigueGain =
    (save.trainingIntensity === 'intense' ? 8 : save.trainingIntensity === 'light' ? 2 : 4) *
    save.settings.fatigueImpact *
    (1.15 - endu / 200) *
    intensityMult;
  let fatigue = Math.min(100, save.fatigue + fatigueGain);
  if (save.trainingFocus === 'recovery') fatigue = Math.max(0, fatigue - 12 - endu / 20);

  return {
    ...save,
    fatigue,
  };
}

export function trainingXpMult(save: CareerSave): number {
  if (save.trainingIntensity === 'intense') return 1.35 * save.settings.trainingEffectiveness;
  if (save.trainingIntensity === 'light') return 0.7 * save.settings.trainingEffectiveness;
  return 1 * save.settings.trainingEffectiveness;
}
