import { AttrKey, PlayerBuild, Ratings, StarTier, spendableAttrKeys } from './models';
import { getTrait, heightToHgt } from './traits';

export interface StarPreset {
  stars: StarTier;
  pointPool: number;
  floor: number;
  softCap: number;
  baseline: Omit<Ratings, 'hgt'>;
  rankBand: [number, number];
}

const base = (n: number): Omit<Ratings, 'hgt'> => ({
  stre: n,
  spd: n,
  jmp: n,
  endu: n,
  ins: n,
  dnk: n,
  ft: n,
  fg: n,
  tp: n,
  oiq: n,
  diq: n,
  drb: n,
  pss: n,
  reb: n,
});

export const STAR_PRESETS: Record<StarTier, StarPreset> = {
  1: {
    stars: 1,
    pointPool: 90,
    floor: 30,
    softCap: 62,
    baseline: { ...base(38), spd: 42, endu: 40, ft: 44, diq: 36, reb: 34 },
    rankBand: [280, 420],
  },
  2: {
    stars: 2,
    pointPool: 140,
    floor: 35,
    softCap: 72,
    baseline: { ...base(44), spd: 48, dnk: 46, fg: 46, oiq: 45, pss: 44 },
    rankBand: [150, 279],
  },
  3: {
    stars: 3,
    pointPool: 200,
    floor: 40,
    softCap: 80,
    baseline: { ...base(50), spd: 54, fg: 52, tp: 50, oiq: 52, drb: 52 },
    rankBand: [60, 149],
  },
  4: {
    stars: 4,
    pointPool: 280,
    floor: 42,
    softCap: 88,
    baseline: { ...base(56), spd: 60, jmp: 58, dnk: 60, tp: 58, oiq: 58, diq: 56 },
    rankBand: [15, 59],
  },
  5: {
    stars: 5,
    pointPool: 360,
    floor: 45,
    softCap: 94,
    baseline: { ...base(62), spd: 68, jmp: 66, dnk: 68, tp: 64, oiq: 64, pss: 60, diq: 60 },
    rankBand: [1, 14],
  },
};

export function applyStarPreset(player: PlayerBuild, stars: StarTier): PlayerBuild {
  const preset = STAR_PRESETS[stars];
  const ratings: Ratings = {
    hgt: heightToHgt(player.heightInches),
    ...preset.baseline,
  };
  if (player.position === 'PG') {
    ratings.pss += 4;
    ratings.drb += 3;
    ratings.reb = Math.max(preset.floor, ratings.reb - 6);
  }
  if (player.position === 'C') {
    ratings.reb += 6;
    ratings.stre += 4;
    ratings.ins += 3;
    ratings.drb = Math.max(preset.floor, ratings.drb - 6);
    ratings.tp = Math.max(preset.floor, ratings.tp - 4);
  }
  if (player.position === 'SG') {
    ratings.tp += 3;
    ratings.fg += 2;
  }
  if (player.position === 'PF') {
    ratings.reb += 3;
    ratings.stre += 2;
  }
  for (const k of spendableAttrKeys) {
    ratings[k] = Math.min(preset.softCap, Math.max(preset.floor, ratings[k]));
  }
  return {
    ...player,
    intendedStars: stars,
    traitIds: player.traitIds.filter((id) => {
      const t = getTrait(id);
      return !!t && stars >= t.minStars;
    }),
    ratings,
  };
}

export function clampToStarSoftCap(ratings: Ratings, stars: StarTier): Ratings {
  const soft = STAR_PRESETS[stars].softCap;
  const next = { ...ratings };
  for (const k of spendableAttrKeys) {
    next[k as AttrKey] = Math.min(soft, next[k as AttrKey]);
  }
  return next;
}
