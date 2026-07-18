import {
  PlayerBuild,
  Position,
  ProspectPathId,
  Ratings,
  SpendableAttrKey,
  StarTier,
  spendableAttrKeys,
} from './models';
import { adjustRating, canIncrease, remainingPoints } from './points';
import {
  PROSPECT_PATHS,
  ProspectPathDef,
  getProspectPath,
  pathFromStars,
  softCapForAttr,
} from './prospectPaths';
import { heightToHgt } from './traits';

export interface StarPreset {
  stars: StarTier;
  pointPool: number;
  floor: number;
  softCap: number;
  baseline: Omit<Ratings, 'hgt'>;
  rankBand: [number, number];
}

/** @deprecated Prefer PROSPECT_PATHS / resolvePlayerPath — kept for coarse star fallbacks. */
export const STAR_TIER_CONTRACT: Record<
  StarTier,
  { label: string; pitch: string; earlyMinutes: [number, number] }
> = {
  1: {
    label: PROSPECT_PATHS.underdog.label,
    pitch: PROSPECT_PATHS.underdog.pitch,
    earlyMinutes: PROSPECT_PATHS.underdog.earlyMinutes,
  },
  2: {
    label: PROSPECT_PATHS.sleeper.label,
    pitch: PROSPECT_PATHS.sleeper.pitch,
    earlyMinutes: PROSPECT_PATHS.sleeper.earlyMinutes,
  },
  3: {
    label: PROSPECT_PATHS.standard.label,
    pitch: PROSPECT_PATHS.standard.pitch,
    earlyMinutes: PROSPECT_PATHS.standard.earlyMinutes,
  },
  4: {
    label: PROSPECT_PATHS.blueBlood.label,
    pitch: PROSPECT_PATHS.blueBlood.pitch,
    earlyMinutes: PROSPECT_PATHS.blueBlood.earlyMinutes,
  },
  5: {
    label: PROSPECT_PATHS.lotteryHigh.label,
    pitch: PROSPECT_PATHS.lotteryHigh.pitch,
    earlyMinutes: PROSPECT_PATHS.lotteryHigh.earlyMinutes,
  },
};

/** Coarse star fallbacks (legacy). Prefer path defs. */
export const STAR_PRESETS: Record<StarTier, StarPreset> = {
  1: starFromPath(PROSPECT_PATHS.underdog),
  2: starFromPath(PROSPECT_PATHS.sleeper),
  3: starFromPath(PROSPECT_PATHS.standard),
  4: starFromPath(PROSPECT_PATHS.blueBlood),
  5: starFromPath(PROSPECT_PATHS.lotteryHigh),
};

function starFromPath(path: ProspectPathDef): StarPreset {
  return {
    stars: path.stars,
    pointPool: path.pointPool,
    floor: path.floor,
    softCap: path.softCap,
    baseline: path.baseline,
    rankBand: path.rankBand,
  };
}

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

/** Drop lowest-priority attributes until the build fits the path point pool. */
function trimToBudget(player: PlayerBuild): PlayerBuild {
  let next = player;
  const priorities = positionPriorities(next.position).slice().reverse();
  let guard = 0;
  while (remainingPoints(next) < 0 && guard++ < 8000) {
    let cut = false;
    const floor = resolveFloor(next);
    for (const key of priorities) {
      if (next.ratings[key] > floor) {
        next = adjustRating(next, key, -1);
        cut = true;
        break;
      }
    }
    if (!cut) {
      if (next.traitIds.length > 0) {
        next = { ...next, traitIds: next.traitIds.slice(0, -1) };
        continue;
      }
      break;
    }
  }
  return next;
}

function resolveFloor(player: PlayerBuild): number {
  return getProspectPath(player.prospectPath ?? pathFromStars(player.intendedStars)).floor;
}

/** Spend remaining path points into a ready position-aware build. */
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

export function applyProspectPath(player: PlayerBuild, pathId: ProspectPathId): PlayerBuild {
  const path = getProspectPath(pathId);
  const ratings: Ratings = {
    hgt: heightToHgt(player.heightInches),
    ...path.baseline,
  };
  if (player.position === 'PG') {
    ratings.pss += 4;
    ratings.drb += 3;
    ratings.reb = Math.max(path.floor, ratings.reb - 6);
  }
  if (player.position === 'C') {
    ratings.reb += 6;
    ratings.stre += 4;
    ratings.ins += 3;
    ratings.drb = Math.max(path.floor, ratings.drb - 6);
    ratings.tp = Math.max(path.floor, ratings.tp - 4);
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
    const soft = softCapForAttr(
      { intendedStars: path.stars, prospectPath: pathId },
      k,
    );
    ratings[k] = Math.min(soft, Math.max(path.floor, ratings[k]));
  }
  const baselinePlayer: PlayerBuild = {
    ...player,
    intendedStars: path.stars,
    prospectPath: pathId,
    traitIds: [],
    ratings,
  };
  return autoSpendStarBudget(trimToBudget(baselinePlayer));
}

/** Legacy star dial — maps onto the default path for that star. */
export function applyStarPreset(player: PlayerBuild, stars: StarTier): PlayerBuild {
  return applyProspectPath(player, pathFromStars(stars));
}

export function clampToStarSoftCap(ratings: Ratings, stars: StarTier): Ratings {
  const soft = STAR_PRESETS[stars].softCap;
  const next = { ...ratings };
  for (const k of spendableAttrKeys) {
    next[k] = Math.min(soft, next[k]);
  }
  return next;
}

export function clampToPathSoftCap(
  ratings: Ratings,
  pathId: ProspectPathId,
): Ratings {
  const path = getProspectPath(pathId);
  const next = { ...ratings };
  for (const k of spendableAttrKeys) {
    const soft = path.softCapOverrides?.[k] ?? path.softCap;
    next[k] = Math.min(soft, next[k]);
  }
  return next;
}
