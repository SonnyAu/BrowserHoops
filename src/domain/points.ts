import { AttrKey, PlayerBuild, Position, Ratings, spendableAttrKeys } from './models';
import { resolvePlayerPath, softCapForAttr } from './prospectPaths';
import { heightToHgt, traitPointCost } from './traits';

export function costForValue(value: number, floor: number): number {
  if (value <= floor) return 0;
  if (value <= 55) return 1;
  if (value <= 70) return 2;
  if (value <= 80) return 3;
  if (value <= 90) return 5;
  return 7;
}

export function totalSpent(player: PlayerBuild): number {
  const floor = resolvePlayerPath(player).floor;
  let spent = 0;
  for (const key of spendableAttrKeys) {
    const v = player.ratings[key];
    for (let i = floor + 1; i <= v; i++) spent += costForValue(i, floor);
  }
  spent += traitPointCost(player.traitIds);
  return spent;
}

export function positionCaps(position: Position, height: number, wingspan: number): Record<AttrKey, number> {
  const tall = height >= 82;
  const short = height <= 74;
  const long = wingspan - height >= 4;
  const base: Record<AttrKey, number> = {
    hgt: 99,
    stre: 95,
    spd: 95,
    jmp: 95,
    endu: 96,
    ins: 94,
    dnk: 94,
    ft: 96,
    fg: 95,
    tp: 95,
    oiq: 97,
    diq: 96,
    drb: 95,
    pss: 96,
    reb: 96,
  };
  if (position === 'PG') {
    base.reb = 78;
    base.pss = 98;
    base.drb = 97;
  }
  if (position === 'C') {
    base.drb = 82;
    base.tp = tall ? 88 : 90;
    base.reb = 98;
    base.ins = 96;
    base.stre = 97;
  }
  if (position === 'PF') {
    base.pss = 86;
    base.reb = 96;
  }
  if (long) {
    base.diq = Math.min(97, base.diq + 2);
    base.reb = Math.min(97, base.reb + 1);
  }
  if (short && (position === 'PF' || position === 'C')) {
    base.reb -= 6;
    base.ins -= 4;
  }
  return base;
}

export function pointPool(player: PlayerBuild): number {
  return resolvePlayerPath(player).pointPool;
}

export function remainingPoints(player: PlayerBuild): number {
  return pointPool(player) - totalSpent(player);
}

export function canIncrease(player: PlayerBuild, key: AttrKey): boolean {
  if (key === 'hgt') return false;
  const path = resolvePlayerPath(player);
  const caps = positionCaps(player.position, player.heightInches, player.wingspanInches);
  const soft = softCapForAttr(player, key);
  const next = player.ratings[key] + 1;
  if (next > Math.min(caps[key], soft)) return false;
  return remainingPoints(player) >= costForValue(next, path.floor);
}

export function adjustRating(player: PlayerBuild, key: AttrKey, delta: 1 | -1): PlayerBuild {
  if (key === 'hgt') return player;
  const floor = resolvePlayerPath(player).floor;
  const current = player.ratings[key];
  if (delta === -1 && current <= floor) return player;
  if (delta === 1 && !canIncrease(player, key)) return player;
  const ratings: Ratings = {
    ...player.ratings,
    [key]: current + delta,
    hgt: heightToHgt(player.heightInches),
  };
  return { ...player, ratings };
}

export const POINT_POOL = 200; // nominal; actual pool is prospect-path based
export { spendableAttrKeys as ratingKeys };
