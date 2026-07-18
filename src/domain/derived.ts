import { similarityRefs } from '../data/similarityRefs';
import {
  ATTR_LABELS,
  AttrKey,
  HiddenDevelopment,
  PlayerBuild,
  Ratings,
  RoleLabel,
  SimilarityRef,
  spendableAttrKeys,
} from './models';
import { getEffectiveRatings } from './traits';

const OVR_WEIGHTS: Record<AttrKey, number> = {
  hgt: 0.7,
  stre: 0.85,
  spd: 1.05,
  jmp: 0.9,
  endu: 0.75,
  ins: 1.05,
  dnk: 1.0,
  ft: 0.7,
  fg: 1.1,
  tp: 1.2,
  oiq: 1.15,
  diq: 1.15,
  drb: 0.95,
  pss: 1.05,
  reb: 0.95,
};

export function overallFromRatings(r: Ratings, position: PlayerBuild['position']): number {
  let sum = 0;
  let w = 0;
  for (const k of Object.keys(OVR_WEIGHTS) as AttrKey[]) {
    sum += r[k] * OVR_WEIGHTS[k];
    w += OVR_WEIGHTS[k];
  }
  let ovr = sum / w;
  if (position === 'PG' && r.pss > 80) ovr += 1;
  if ((position === 'C' || position === 'PF') && r.reb > 80) ovr += 1;
  // BBGM-native: weighted attribute mean (no fantasy inflate into the 70–95 band).
  return Math.round(Math.min(99, Math.max(20, ovr)));
}

export function overall(p: PlayerBuild): number {
  return overallFromRatings(getEffectiveRatings(p), p.position);
}

/** Hidden development ceiling (training target). Always ≤ 99. */
export function computeTruePotential(
  p: PlayerBuild,
  opts?: { age?: number; stars?: number; potBonus?: number },
): number {
  const o = overall(p);
  const r = getEffectiveRatings(p);
  const upside = Math.floor((r.spd + r.oiq + r.jmp + r.tp) / 40);
  const starRoom = opts?.stars != null ? Math.max(0, 6 - (5 - opts.stars)) : 4;
  const pathBonus = opts?.potBonus ?? 0;
  const age = opts?.age ?? 18;
  const ageRoom = age <= 19 ? 10 : age <= 22 ? 8 : age <= 26 ? 4 : age <= 30 ? 1 : 0;
  return Math.min(
    99,
    Math.max(o, o + upside + Math.floor(starRoom / 2) + Math.floor(ageRoom / 2) + pathBonus),
  );
}

/** Scouted / displayed potential with sticky bias. Always ≤ 99. */
export function scoutedPotential(
  p: PlayerBuild,
  hidden?: Pick<HiddenDevelopment, 'truePotential' | 'potentialBias'>,
): number {
  const o = overall(p);
  const truth = hidden?.truePotential ?? computeTruePotential(p);
  const bias = hidden?.potentialBias ?? 0;
  // Bias is flavor — keep scouted POT near true potential so create never invites rerolls.
  const scouted = truth + bias;
  return Math.min(99, Math.max(o, Math.max(truth - 6, Math.min(truth + 6, scouted))));
}

export function potential(p: PlayerBuild, truePotential?: number): number {
  if (truePotential != null) {
    const o = overall(p);
    return Math.max(o, Math.min(99, truePotential));
  }
  return scoutedPotential(p);
}

export function ratingDeltas(current: Ratings, baseline: Ratings): Partial<Record<AttrKey, number>> {
  const out: Partial<Record<AttrKey, number>> = {};
  for (const k of spendableAttrKeys) {
    const d = current[k] - baseline[k];
    if (d !== 0) out[k] = d;
  }
  return out;
}

export function formatDelta(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return '';
}

export function archetype(p: PlayerBuild): string {
  const r = getEffectiveRatings(p);
  if (r.tp >= 80 && r.diq >= 75) return '3-and-D Wing';
  if (r.pss >= 82 && r.oiq >= 78) return 'Offensive Engine';
  if (r.diq >= 82 && r.reb >= 75) return 'Defensive Anchor';
  if (r.dnk >= 82 && r.spd >= 80) return 'Slashing Athlete';
  if (r.tp >= 85 && r.fg >= 80) return 'Floor Spacer';
  if (r.diq >= 85) return 'Lockdown Defender';
  return 'Two-Way Prospect';
}

export function strengthsWeaknesses(p: PlayerBuild): { strengths: string[]; weaknesses: string[] } {
  const r = getEffectiveRatings(p);
  const sorted = spendableAttrKeys.map((k) => [k, r[k]] as const).sort((a, b) => b[1] - a[1]);
  return {
    strengths: sorted.slice(0, 2).map(([k]) => ATTR_LABELS[k]),
    weaknesses: sorted.slice(-2).map(([k]) => ATTR_LABELS[k]),
  };
}

export function estimatedPotentialRange(p: PlayerBuild): [number, number] {
  const o = overall(p);
  const r = getEffectiveRatings(p);
  const low = Math.min(99, o + 3 + Math.floor((r.spd + r.oiq) / 45));
  const high = Math.min(99, o + 12 + Math.floor(r.spd / 20));
  return [Math.max(o + 1, low - 1), Math.max(low + 1, high)];
}

function vecDistance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

export function playerSimilarities(
  p: PlayerBuild,
  refs: SimilarityRef[] = similarityRefs,
): { offensive: string; defensive: string; physical: string } {
  const r = getEffectiveRatings(p);
  const offensive = [r.ins, r.dnk, r.fg, r.tp, r.pss, r.oiq];
  const defensive = [r.diq, r.reb, r.spd, r.jmp];
  const physical = [p.heightInches, p.wingspanInches - p.heightInches, r.spd, r.stre];

  const samePos = refs.filter((x) => x.position === p.position || x.position === p.secondaryPosition);
  const pool = samePos.length >= 3 ? samePos : refs;

  const best = (axis: 'offensive' | 'defensive' | 'physical', vec: number[]) => {
    let name = pool[0]?.name ?? 'N/A';
    let bestD = Infinity;
    for (const ref of pool) {
      const d = vecDistance(vec, ref[axis]);
      if (d < bestD) {
        bestD = d;
        name = ref.name;
      }
    }
    return name;
  };

  return {
    offensive: best('offensive', offensive),
    defensive: best('defensive', defensive),
    physical: best('physical', physical),
  };
}

export function similarities(p: PlayerBuild): string[] {
  const s = playerSimilarities(p);
  return [`Off: ${s.offensive}`, `Def: ${s.defensive}`, `Phys: ${s.physical}`];
}

export function roleFromContext(args: {
  ovr: number;
  prestige: number;
  stars: number;
  rank: number;
  positionNeed: number;
}): { role: RoleLabel; minutes: number; usage: number } {
  const { ovr, prestige, stars, rank, positionNeed } = args;
  const opportunity = (100 - prestige) * 0.35 + stars * 8 + positionNeed * 0.2 - Math.min(40, rank / 15);
  const readiness = ovr + opportunity / 4;
  let role: RoleLabel = 'Deep Reserve';
  let minutes = 8;
  let usage = 0.12;
  // Thresholds tuned for BBGM-scale OVRs (lottery ~38–48, consensus ~57, generational ~65).
  if (readiness > 78 && prestige < 88) {
    role = 'Program Star';
    minutes = 36;
    usage = 0.36;
  } else if (readiness > 74) {
    role = 'Primary Option';
    minutes = 34;
    usage = 0.34;
  } else if (readiness > 70) {
    role = 'Featured Starter';
    minutes = 32;
    usage = 0.28;
  } else if (readiness > 64) {
    role = 'Starter';
    minutes = 28;
    usage = 0.24;
  } else if (readiness > 58) {
    role = 'Spot Starter';
    minutes = 24;
    usage = 0.2;
  } else if (readiness > 52) {
    role = 'Sixth Man';
    minutes = 20;
    usage = 0.18;
  } else if (readiness > 46) {
    role = 'Rotation Player';
    minutes = 16;
    usage = 0.14;
  } else if (readiness > 40) {
    role = 'Developmental Reserve';
    minutes = 10;
    usage = 0.1;
  }
  // Elite raw talent pushes ceiling even at blue-bloods (still cut below).
  if (ovr >= 62 && minutes < 34) {
    minutes = Math.max(minutes, 34);
    usage = Math.max(usage, 0.32);
  } else if (ovr >= 56 && minutes < 30) {
    minutes = Math.max(minutes, 30);
    usage = Math.max(usage, 0.28);
  }
  // Blue-bloods cut minutes; underdogs (1–2★) take a softer hit so they can earn a role.
  if (prestige >= 90 && minutes > 22) {
    const cut = stars <= 2 ? 3 : 6;
    minutes -= cut;
    usage -= stars <= 2 ? 0.02 : 0.04;
    if (role === 'Program Star') role = 'Featured Starter';
    else if (role === 'Primary Option') role = 'Starter';
  }
  return { role, minutes: Math.max(4, Math.round(minutes)), usage: Math.max(0.08, Math.min(0.4, usage)) };
}

/** Short Home/review hint so low-star runs feel intentional, not bricked. */
export function underdogBreakoutNote(args: {
  stars: number;
  minutes: number;
  recentPpg: number;
  trainingFocus: string;
}): string | null {
  const { stars, minutes, recentPpg, trainingFocus } = args;
  if (stars > 3) return null;
  if (stars <= 2 && minutes < 22) {
    return 'Underdog path: pick a build-around school and produce — minutes climb with form. No reroll needed.';
  }
  if (stars <= 3 && recentPpg >= 12 && minutes < 28) {
    return `Breakout window: ${recentPpg.toFixed(1)} PPG is earning trust. Stay on ${trainingFocus} training; OVR gains show in season review.`;
  }
  if (stars <= 2) {
    return 'Underdog campaign: slower start, real ceiling if you stick the season.';
  }
  return null;
}
