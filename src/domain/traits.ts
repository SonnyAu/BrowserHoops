import { AttrKey, PlayerBuild, PlayerTraitDef, Ratings, StarTier } from './models';

export const TRAITS: PlayerTraitDef[] = [
  {
    id: 'unicorn-mobility',
    name: 'Unicorn Mobility',
    summary: 'Rare fluidity and handle for elite size.',
    minStars: 4,
    pointCost: 24,
    bonuses: { spd: 12, jmp: 8, drb: 10, diq: 4 },
  },
  {
    id: 'physical-freak',
    name: 'Physical Freak',
    summary: 'Outrageous strength, speed, and endurance package.',
    minStars: 4,
    pointCost: 22,
    bonuses: { stre: 10, spd: 10, jmp: 8, endu: 8 },
  },
  {
    id: 'shooting-sauce',
    name: 'Shooting Sauce',
    summary: 'Special touch from midrange and deep.',
    minStars: 3,
    pointCost: 20,
    bonuses: { tp: 12, fg: 8, ft: 6, oiq: 4 },
  },
  {
    id: 'floor-general',
    name: 'Floor General',
    summary: 'Sees the floor a half-second early.',
    minStars: 3,
    pointCost: 16,
    bonuses: { pss: 10, oiq: 8, drb: 4 },
  },
  {
    id: 'rim-protector',
    name: 'Rim Protector',
    summary: 'Alters everything at the rim.',
    minStars: 3,
    pointCost: 16,
    bonuses: { diq: 10, jmp: 6, stre: 4, reb: 4 },
  },
  {
    id: 'glue-guy',
    name: 'Glue Guy',
    summary: 'Winning habits on both ends.',
    minStars: 2,
    pointCost: 12,
    bonuses: { diq: 6, oiq: 6, endu: 4, reb: 4 },
  },
  {
    id: 'slasher',
    name: 'Attacking Slasher',
    summary: 'Lives in the paint off the bounce.',
    minStars: 2,
    pointCost: 14,
    bonuses: { dnk: 10, spd: 6, drb: 6, ins: 4 },
  },
  {
    id: 'microwave',
    name: 'Microwave Scorer',
    summary: 'Can heat up in a hurry.',
    minStars: 2,
    pointCost: 12,
    bonuses: { fg: 8, tp: 6, ft: 4, oiq: 2 },
  },
];

export function getTrait(id: string): PlayerTraitDef | undefined {
  return TRAITS.find((t) => t.id === id);
}

export function heightToHgt(inches: number): number {
  // BGM-ish: ~66" → ~20, 72" → ~40, 78" → ~60, 84" → ~80, 88" → ~92
  return Math.max(0, Math.min(99, Math.round((inches - 66) * (72 / 22) + 20)));
}

export function syncHeightRating(ratings: Ratings, heightInches: number): Ratings {
  return { ...ratings, hgt: heightToHgt(heightInches) };
}

export function getEffectiveRatings(player: Pick<PlayerBuild, 'ratings' | 'traitIds' | 'heightInches'>): Ratings {
  const base = syncHeightRating(player.ratings, player.heightInches);
  const out: Ratings = { ...base };
  for (const id of player.traitIds) {
    const trait = getTrait(id);
    if (!trait) continue;
    for (const [k, bonus] of Object.entries(trait.bonuses) as [AttrKey, number][]) {
      out[k] = Math.min(99, out[k] + bonus);
    }
  }
  return out;
}

export function traitPointCost(traitIds: string[]): number {
  return traitIds.reduce((s, id) => s + (getTrait(id)?.pointCost ?? 0), 0);
}

export function canSelectTrait(stars: StarTier, traitId: string, current: string[]): boolean {
  const trait = getTrait(traitId);
  if (!trait) return false;
  if (current.includes(traitId)) return true;
  if (current.length >= 2) return false;
  return stars >= trait.minStars;
}

/** Heuristic trait assignment for league pack players. */
export function inferTraits(ratings: Ratings, heightInches: number): string[] {
  const ids: string[] = [];
  if (heightInches >= 83 && ratings.spd >= 70 && ratings.drb >= 65) ids.push('unicorn-mobility');
  if (ratings.stre >= 85 && ratings.spd >= 80 && ratings.jmp >= 80) ids.push('physical-freak');
  if (ratings.tp >= 88 && ratings.fg >= 80) ids.push('shooting-sauce');
  if (ratings.pss >= 88 && ratings.oiq >= 85) ids.push('floor-general');
  if (ratings.diq >= 88 && heightInches >= 80) ids.push('rim-protector');
  if (ratings.dnk >= 88 && ratings.spd >= 82) ids.push('slasher');
  return ids.slice(0, 2);
}
