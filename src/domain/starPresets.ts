import {
  PlayerBuild,
  Position,
  Ratings,
  SpendableAttrKey,
  StarTier,
  spendableAttrKeys,
} from './models';
import { adjustRating, canIncrease, remainingPoints } from './points';
import { heightToHgt } from './traits';

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

/** Honest difficulty / fantasy dial — not a lottery. */
export const STAR_TIER_CONTRACT: Record<
  StarTier,
  { label: string; pitch: string; earlyMinutes: [number, number] }
> = {
  1: {
    label: 'Underdog',
    pitch: 'Slow-burn campaign. Build-around minutes, earn your role — no reroll needed.',
    earlyMinutes: [22, 30],
  },
  2: {
    label: 'Underdog+',
    pitch: 'Regional prospect path. Real minutes if you pick the right school.',
    earlyMinutes: [20, 28],
  },
  3: {
    label: 'Standard',
    pitch: 'Balanced campaign. Mix of opportunity and competition.',
    earlyMinutes: [16, 26],
  },
  4: {
    label: 'Blue-blood track',
    pitch: 'High-major offers and exposure; early minutes tighter at elites.',
    earlyMinutes: [12, 24],
  },
  5: {
    label: 'Lottery track',
    pitch: "McDonald's-tier path. Max exposure, max competition — still your choice, not luck.",
    earlyMinutes: [10, 22],
  },
};

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

/** Position-first spend order, then remaining attrs. */
function positionPriorities(position: Position): SpendableAttrKey[] {
  const primary: Record<Position, SpendableAttrKey[]> = {
    PG: ['pss', 'drb', 'oiq', 'tp', 'spd', 'ft', 'fg', 'endu', 'diq', 'jmp', 'stre', 'ins', 'dnk', 'reb'],
    SG: ['tp', 'fg', 'spd', 'dnk', 'oiq', 'ft', 'drb', 'diq', 'jmp', 'endu', 'ins', 'pss', 'stre', 'reb'],
    SF: ['spd', 'tp', 'dnk', 'diq', 'fg', 'jmp', 'oiq', 'stre', 'endu', 'drb', 'ins', 'ft', 'pss', 'reb'],
    PF: ['reb', 'stre', 'ins', 'dnk', 'diq', 'jmp', 'endu', 'oiq', 'fg', 'tp', 'ft', 'spd', 'drb', 'pss'],
    C: ['reb', 'stre', 'ins', 'dnk', 'diq', 'jmp', 'endu', 'oiq', 'ft', 'fg', 'tp', 'spd', 'drb', 'pss'],
  };
  const ordered = [...primary[position]];
  const seen = new Set(ordered);
  for (const k of spendableAttrKeys) {
    if (!seen.has(k)) ordered.push(k);
  }
  return ordered;
}

/** Drop lowest-priority attributes until the build fits the star point pool. */
function trimToBudget(player: PlayerBuild): PlayerBuild {
  let next = player;
  const priorities = positionPriorities(next.position).slice().reverse();
  let guard = 0;
  while (remainingPoints(next) < 0 && guard++ < 8000) {
    let cut = false;
    for (const key of priorities) {
      const floor = STAR_PRESETS[next.intendedStars].floor;
      if (next.ratings[key] > floor) {
        next = adjustRating(next, key, -1);
        cut = true;
        break;
      }
    }
    if (!cut) {
      // Still over budget (e.g. traits) — drop traits until it fits
      if (next.traitIds.length > 0) {
        next = { ...next, traitIds: next.traitIds.slice(0, -1) };
        continue;
      }
      break;
    }
  }
  return next;
}

/** Spend remaining star-tier points into a ready position-aware build. */
export function autoSpendStarBudget(player: PlayerBuild): PlayerBuild {
  let next = player;
  const priorities = positionPriorities(next.position);
  let cursor = 0;
  let guard = 0;

  while (remainingPoints(next) > 0 && guard++ < 8000) {
    let bumped = false;
    for (let n = 0; n < priorities.length; n++) {
      const key = priorities[(cursor + n) % priorities.length];
      if (canIncrease(next, key)) {
        next = adjustRating(next, key, 1);
        cursor = (cursor + n + 1) % priorities.length;
        bumped = true;
        break;
      }
    }
    if (!bumped) break;
  }
  return next;
}

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
  const baselinePlayer: PlayerBuild = {
    ...player,
    intendedStars: stars,
    // Fresh tier pick gets a clean auto-build; traits can be re-selected after.
    traitIds: [],
    ratings,
  };
  return autoSpendStarBudget(trimToBudget(baselinePlayer));
}

export function clampToStarSoftCap(ratings: Ratings, stars: StarTier): Ratings {
  const soft = STAR_PRESETS[stars].softCap;
  const next = { ...ratings };
  for (const k of spendableAttrKeys) {
    next[k] = Math.min(soft, next[k]);
  }
  return next;
}
