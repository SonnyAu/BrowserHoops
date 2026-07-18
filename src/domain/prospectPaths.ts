import {
  AttrKey,
  PlayerBuild,
  ProspectPathId,
  SpendableAttrKey,
  StarTier,
} from './models';

export interface ProspectPathDef {
  id: ProspectPathId;
  stars: StarTier;
  label: string;
  examples: string;
  pitch: string;
  earlyMinutes: [number, number];
  pointPool: number;
  floor: number;
  softCap: number;
  softCapOverrides?: Partial<Record<SpendableAttrKey, number>>;
  rankBand: [number, number];
  /** Soft target for default auto-spend at SG. */
  targetOvr: number;
  potBonus: number;
  biasRange: [number, number];
  /** Added to default peakAgeMin / peakAgeMax rolls. */
  peakAgeShift: number;
  accolades: string[];
  baseline: Record<SpendableAttrKey, number>;
}

const base = (n: number): Record<SpendableAttrKey, number> => ({
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

export const PROSPECT_PATH_IDS: ProspectPathId[] = [
  'underdog',
  'sleeper',
  'standard',
  'blueBlood',
  'lotteryLow',
  'lotteryHigh',
  'consensusOne',
  'generational',
];

export const PROSPECT_PATHS: Record<ProspectPathId, ProspectPathDef> = {
  underdog: {
    id: 'underdog',
    stars: 1,
    label: 'Underdog',
    examples: 'Walk-on · camp invite',
    pitch: 'Slow-burn campaign. Build-around minutes, earn your role — no reroll needed.',
    earlyMinutes: [22, 30],
    // ~27 spendable mean → ~28 OVR with hgt~56
    pointPool: 130,
    floor: 18,
    softCap: 48,
    rankBand: [280, 420],
    targetOvr: 28,
    potBonus: 4,
    biasRange: [-6, 6],
    peakAgeShift: 1,
    accolades: ['Under-the-radar prospect'],
    baseline: { ...base(18), spd: 20, endu: 20, ft: 22, diq: 18, reb: 18 },
  },
  sleeper: {
    id: 'sleeper',
    stars: 2,
    label: 'Under-the-radar',
    examples: 'Curry-style late bloomer',
    pitch: 'Scouts miss you. Modest start, elite shooting/IQ ceiling, peak later.',
    earlyMinutes: [20, 28],
    pointPool: 170,
    floor: 20,
    softCap: 52,
    softCapOverrides: { tp: 78, ft: 78, oiq: 76, fg: 70 },
    rankBand: [180, 320],
    targetOvr: 32,
    potBonus: 18,
    biasRange: [-12, -4],
    peakAgeShift: 3,
    accolades: ['Under-the-radar prospect', 'Regional honorable mention'],
    baseline: { ...base(20), spd: 22, tp: 26, ft: 26, oiq: 24, fg: 22, jmp: 20, stre: 20 },
  },
  standard: {
    id: 'standard',
    stars: 3,
    label: 'Standard',
    examples: 'High-major hopeful',
    pitch: 'Balanced campaign. Mix of opportunity and competition.',
    earlyMinutes: [16, 26],
    pointPool: 155,
    floor: 22,
    softCap: 58,
    rankBand: [60, 149],
    targetOvr: 34,
    potBonus: 6,
    biasRange: [-5, 5],
    peakAgeShift: 0,
    accolades: ['Conference player of the year'],
    baseline: { ...base(22), spd: 24, fg: 24, tp: 22, oiq: 24, drb: 24 },
  },
  blueBlood: {
    id: 'blueBlood',
    stars: 4,
    label: 'Blue-blood track',
    examples: 'Top-60 recruit',
    pitch: 'High-major offers and exposure; early minutes tighter at elites.',
    earlyMinutes: [12, 24],
    pointPool: 165,
    floor: 24,
    softCap: 62,
    rankBand: [15, 59],
    targetOvr: 36,
    potBonus: 8,
    biasRange: [-4, 4],
    peakAgeShift: 0,
    accolades: ['All-State first team', 'Conference player of the year'],
    baseline: { ...base(24), spd: 26, jmp: 25, dnk: 26, tp: 25, oiq: 26, diq: 24 },
  },
  lotteryLow: {
    id: 'lotteryLow',
    stars: 5,
    label: 'Low lottery',
    examples: 'Late-lottery 5★',
    pitch: "McDonald's-tier path on the fringe of the lottery — still your choice, not luck.",
    earlyMinutes: [10, 22],
    pointPool: 160,
    floor: 26,
    softCap: 68,
    rankBand: [8, 14],
    targetOvr: 38,
    potBonus: 10,
    biasRange: [-3, 3],
    peakAgeShift: 0,
    accolades: ["McDonald's All-American", 'All-State first team'],
    baseline: { ...base(26), spd: 28, jmp: 27, dnk: 28, tp: 26, oiq: 27, pss: 26, diq: 26 },
  },
  lotteryHigh: {
    id: 'lotteryHigh',
    stars: 5,
    label: 'High lottery',
    examples: 'Banchero · Jabari Smith Jr.',
    pitch: 'Clear lottery talent. Max exposure, max competition at blue-bloods.',
    earlyMinutes: [10, 22],
    pointPool: 255,
    floor: 30,
    softCap: 78,
    rankBand: [3, 7],
    targetOvr: 48,
    potBonus: 12,
    biasRange: [-3, 3],
    peakAgeShift: 0,
    accolades: ["McDonald's All-American", 'All-State first team'],
    baseline: { ...base(30), spd: 34, jmp: 32, dnk: 34, tp: 32, oiq: 33, pss: 30, diq: 30 },
  },
  consensusOne: {
    id: 'consensusOne',
    stars: 5,
    label: 'Consensus #1',
    examples: 'Flagg · Dybantsa · Peterson',
    pitch: 'Clear No. 1 in the class — elite, not generational.',
    earlyMinutes: [10, 22],
    pointPool: 400,
    floor: 34,
    softCap: 86,
    rankBand: [1, 2],
    targetOvr: 57,
    potBonus: 14,
    biasRange: [-2, 2],
    peakAgeShift: -1,
    accolades: [
      "McDonald's All-American",
      'Consensus No. 1 recruit',
      'All-State first team',
    ],
    baseline: { ...base(34), spd: 38, jmp: 36, dnk: 38, tp: 36, oiq: 38, pss: 34, diq: 36, stre: 34 },
  },
  generational: {
    id: 'generational',
    stars: 5,
    label: 'Generational',
    examples: 'Freshman Wemby · LeBron',
    pitch: 'Once-in-a-generation prospect. Everyone knows your name before tip-off.',
    earlyMinutes: [12, 24],
    pointPool: 560,
    floor: 38,
    softCap: 92,
    rankBand: [1, 1],
    targetOvr: 65,
    potBonus: 16,
    biasRange: [-1, 1],
    peakAgeShift: -1,
    accolades: [
      "McDonald's All-American",
      'Generational prospect',
      'Consensus No. 1 recruit',
      'All-State first team',
    ],
    baseline: { ...base(38), spd: 42, jmp: 40, dnk: 42, tp: 38, oiq: 42, pss: 36, diq: 40, stre: 38, reb: 40 },
  },
};

export function getProspectPath(id: ProspectPathId): ProspectPathDef {
  return PROSPECT_PATHS[id];
}

/** Map legacy star-only builds onto a default path. */
export function pathFromStars(stars: StarTier): ProspectPathId {
  switch (stars) {
    case 1:
      return 'underdog';
    case 2:
      return 'sleeper';
    case 3:
      return 'standard';
    case 4:
      return 'blueBlood';
    case 5:
      return 'lotteryHigh';
  }
}

export function resolvePlayerPath(
  player: Pick<PlayerBuild, 'intendedStars' | 'prospectPath'>,
): ProspectPathDef {
  const id = player.prospectPath ?? pathFromStars(player.intendedStars);
  return PROSPECT_PATHS[id] ?? PROSPECT_PATHS[pathFromStars(player.intendedStars)];
}

export function softCapForAttr(player: Pick<PlayerBuild, 'intendedStars' | 'prospectPath'>, key: AttrKey): number {
  if (key === 'hgt') return 99;
  const path = resolvePlayerPath(player);
  return path.softCapOverrides?.[key] ?? path.softCap;
}
