import { getCollege } from '../data/colleges';
import {
  BracketMatchup,
  BracketSlot,
  BracketState,
  CareerSave,
  MadnessRegion,
  StandingRow,
} from '../domain/models';

const REGIONS: MadnessRegion[] = ['East', 'West', 'South', 'Midwest'];

function winPct(r: StandingRow): number {
  const g = r.wins + r.losses;
  return g ? r.wins / g : 0;
}

function rankTeams(standings: StandingRow[]): StandingRow[] {
  return [...standings].sort((a, b) => {
    const d = winPct(b) - winPct(a);
    if (Math.abs(d) > 1e-9) return d;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const pa = getCollege(a.teamId)?.prestige ?? 70;
    const pb = getCollege(b.teamId)?.prestige ?? 70;
    return pb - pa;
  });
}

function slotFromRow(row: StandingRow, seed: number | null): BracketSlot {
  return {
    teamId: row.teamId,
    teamName: row.teamName,
    seed,
    conference: row.conference,
  };
}

function emptySlot(): BracketSlot {
  return { teamId: null, teamName: 'TBD', seed: null };
}

/**
 * 68-team field: conference auto-bids + at-large.
 * 8 First Four teams (4 games) → 4 winners join 60 locked teams = 64.
 */
export function buildMarchMadnessBracket(standings: StandingRow[], season: number): BracketState {
  const ranked = rankTeams(standings);
  const byConf = new Map<string, StandingRow[]>();
  for (const row of ranked) {
    const list = byConf.get(row.conference) ?? [];
    list.push(row);
    byConf.set(row.conference, list);
  }

  const autoIds = new Set<string>();
  const autoBids: StandingRow[] = [];
  for (const [, rows] of byConf) {
    if (!rows[0]) continue;
    autoBids.push(rows[0]);
    autoIds.add(rows[0].teamId);
  }
  const atLarge = ranked.filter((r) => !autoIds.has(r.teamId));
  const field = rankTeams([
    ...autoBids,
    ...atLarge.slice(0, Math.max(0, 68 - autoBids.length)),
  ]).slice(0, 68);

  const sixty = field.slice(0, 60);
  const eight = field.slice(60, 68);

  const firstFour: BracketMatchup[] = [];
  for (let g = 0; g < 4; g++) {
    const a = eight[g * 2];
    const b = eight[g * 2 + 1];
    firstFour.push({
      id: `ff-${season}-${g}`,
      round: 'First Four',
      region: 'FirstFour',
      slotA: slotFromRow(a, g < 2 ? 16 : 11),
      slotB: slotFromRow(b, g < 2 ? 16 : 11),
      completed: false,
    });
  }

  const regionSlots: BracketSlot[][] = REGIONS.map(() =>
    Array.from({ length: 16 }, () => emptySlot()),
  );

  const place = (region: number, seed: number, row: StandingRow) => {
    regionSlots[region][seed - 1] = slotFromRow(row, seed);
  };

  let ti = 0;
  for (let seed = 1; seed <= 16; seed++) {
    if (seed === 11 || seed === 16) continue;
    const idxs = seed % 2 === 1 ? [0, 1, 2, 3] : [3, 2, 1, 0];
    for (let k = 0; k < 4; k++) {
      const row = sixty[ti++];
      if (row) place(idxs[k], seed, row);
    }
  }
  // Two locked 11-seeds and two locked 16-seeds; other two each from First Four
  for (const r of [0, 1]) {
    const row = sixty[ti++];
    if (row) place(r, 11, row);
  }
  for (const r of [0, 1]) {
    const row = sixty[ti++];
    if (row) place(r, 16, row);
  }
  regionSlots[2][10] = { teamId: 'ff-winner-2', teamName: 'First Four Winner', seed: 11 };
  regionSlots[3][10] = { teamId: 'ff-winner-3', teamName: 'First Four Winner', seed: 11 };
  regionSlots[2][15] = { teamId: 'ff-winner-0', teamName: 'First Four Winner', seed: 16 };
  regionSlots[3][15] = { teamId: 'ff-winner-1', teamName: 'First Four Winner', seed: 16 };

  const rounds: BracketMatchup[] = [];
  const r64Pairs: [number, number][] = [
    [1, 16],
    [8, 9],
    [5, 12],
    [4, 13],
    [6, 11],
    [3, 14],
    [7, 10],
    [2, 15],
  ];
  for (let r = 0; r < 4; r++) {
    const region = REGIONS[r];
    for (let m = 0; m < 8; m++) {
      const [sa, sb] = r64Pairs[m];
      rounds.push({
        id: `r64-${season}-${region}-${m}`,
        round: 'Round of 64',
        region,
        slotA: { ...regionSlots[r][sa - 1] },
        slotB: { ...regionSlots[r][sb - 1] },
        completed: false,
      });
    }
  }
  for (const region of REGIONS) {
    for (let m = 0; m < 4; m++) {
      rounds.push({
        id: `r32-${season}-${region}-${m}`,
        round: 'Round of 32',
        region,
        slotA: emptySlot(),
        slotB: emptySlot(),
        completed: false,
      });
    }
    for (let m = 0; m < 2; m++) {
      rounds.push({
        id: `s16-${season}-${region}-${m}`,
        round: 'Sweet 16',
        region,
        slotA: emptySlot(),
        slotB: emptySlot(),
        completed: false,
      });
    }
    rounds.push({
      id: `e8-${season}-${region}`,
      round: 'Elite Eight',
      region,
      slotA: emptySlot(),
      slotB: emptySlot(),
      completed: false,
    });
  }
  rounds.push(
    {
      id: `ffour-${season}-0`,
      round: 'Final Four',
      region: 'FinalFour',
      slotA: emptySlot(),
      slotB: emptySlot(),
      completed: false,
    },
    {
      id: `ffour-${season}-1`,
      round: 'Final Four',
      region: 'FinalFour',
      slotA: emptySlot(),
      slotB: emptySlot(),
      completed: false,
    },
    {
      id: `champ-${season}`,
      round: 'Championship',
      region: 'Championship',
      slotA: emptySlot(),
      slotB: emptySlot(),
      completed: false,
    },
  );

  return {
    kind: 'marchMadness',
    status: 'active',
    season,
    firstFour,
    rounds,
  };
}

export function projectMarchMadness(standings: StandingRow[], season: number): BracketState {
  return { ...buildMarchMadnessBracket(standings, season), status: 'projected' };
}

const ROUND_ORDER = [
  'First Four',
  'Round of 64',
  'Round of 32',
  'Sweet 16',
  'Elite Eight',
  'Final Four',
  'Championship',
] as const;

function isPlayable(m: BracketMatchup): boolean {
  return Boolean(
    !m.completed &&
      m.slotA.teamId &&
      m.slotB.teamId &&
      !String(m.slotA.teamId).startsWith('ff-winner') &&
      !String(m.slotB.teamId).startsWith('ff-winner'),
  );
}

export function nextMadnessRound(bracket: BracketState): string | null {
  for (const round of ROUND_ORDER) {
    const pool =
      round === 'First Four'
        ? bracket.firstFour ?? []
        : (bracket.rounds ?? []).filter((m) => m.round === round);
    if (pool.some(isPlayable)) return round;
  }
  return null;
}

function winnerSlot(m: BracketMatchup, winnerId: string): BracketSlot {
  return m.slotA.teamId === winnerId ? m.slotA : m.slotB;
}

export function applyFirstFourWinners(bracket: BracketState): BracketState {
  const ff = bracket.firstFour ?? [];
  if (!ff.every((m) => m.completed && m.winnerId)) return bracket;
  const winners = ff.map((m) => winnerSlot(m, m.winnerId!));
  const map: Record<string, BracketSlot> = {
    'ff-winner-0': { ...winners[0], seed: 16 },
    'ff-winner-1': { ...winners[1], seed: 16 },
    'ff-winner-2': { ...winners[2], seed: 11 },
    'ff-winner-3': { ...winners[3], seed: 11 },
  };
  const rounds = (bracket.rounds ?? []).map((m) => {
    let slotA = m.slotA;
    let slotB = m.slotB;
    if (slotA.teamId && map[slotA.teamId]) slotA = map[slotA.teamId];
    if (slotB.teamId && map[slotB.teamId]) slotB = map[slotB.teamId];
    return { ...m, slotA, slotB };
  });
  return { ...bracket, rounds };
}

export function advanceMadnessWinners(bracket: BracketState, round: string): BracketState {
  let next = bracket;
  if (round === 'First Four') next = applyFirstFourWinners(next);
  const rounds = [...(next.rounds ?? [])];
  const completed = rounds.filter((m) => m.round === round && m.completed && m.winnerId);

  if (round === 'Round of 64') {
    for (const region of REGIONS) {
      const games = completed.filter((m) => m.region === region);
      for (let i = 0; i < 4; i++) {
        const a = games[i * 2];
        const b = games[i * 2 + 1];
        const idx = rounds.findIndex((m) => m.id === `r32-${next.season}-${region}-${i}`);
        if (idx >= 0 && a?.winnerId && b?.winnerId) {
          rounds[idx] = {
            ...rounds[idx],
            slotA: winnerSlot(a, a.winnerId),
            slotB: winnerSlot(b, b.winnerId),
          };
        }
      }
    }
  } else if (round === 'Round of 32') {
    for (const region of REGIONS) {
      const games = completed.filter((m) => m.region === region);
      for (let i = 0; i < 2; i++) {
        const a = games[i * 2];
        const b = games[i * 2 + 1];
        const idx = rounds.findIndex((m) => m.id === `s16-${next.season}-${region}-${i}`);
        if (idx >= 0 && a?.winnerId && b?.winnerId) {
          rounds[idx] = {
            ...rounds[idx],
            slotA: winnerSlot(a, a.winnerId),
            slotB: winnerSlot(b, b.winnerId),
          };
        }
      }
    }
  } else if (round === 'Sweet 16') {
    for (const region of REGIONS) {
      const games = completed.filter((m) => m.region === region);
      const idx = rounds.findIndex((m) => m.id === `e8-${next.season}-${region}`);
      if (idx >= 0 && games[0]?.winnerId && games[1]?.winnerId) {
        rounds[idx] = {
          ...rounds[idx],
          slotA: winnerSlot(games[0], games[0].winnerId),
          slotB: winnerSlot(games[1], games[1].winnerId),
        };
      }
    }
  } else if (round === 'Elite Eight') {
    const east = completed.find((m) => m.region === 'East');
    const west = completed.find((m) => m.region === 'West');
    const south = completed.find((m) => m.region === 'South');
    const midwest = completed.find((m) => m.region === 'Midwest');
    const i0 = rounds.findIndex((m) => m.id === `ffour-${next.season}-0`);
    const i1 = rounds.findIndex((m) => m.id === `ffour-${next.season}-1`);
    if (i0 >= 0 && east?.winnerId && west?.winnerId) {
      rounds[i0] = {
        ...rounds[i0],
        slotA: winnerSlot(east, east.winnerId),
        slotB: winnerSlot(west, west.winnerId),
      };
    }
    if (i1 >= 0 && south?.winnerId && midwest?.winnerId) {
      rounds[i1] = {
        ...rounds[i1],
        slotA: winnerSlot(south, south.winnerId),
        slotB: winnerSlot(midwest, midwest.winnerId),
      };
    }
  } else if (round === 'Final Four') {
    const games = completed.filter((m) => m.round === 'Final Four');
    const idx = rounds.findIndex((m) => m.id === `champ-${next.season}`);
    if (idx >= 0 && games[0]?.winnerId && games[1]?.winnerId) {
      rounds[idx] = {
        ...rounds[idx],
        slotA: winnerSlot(games[0], games[0].winnerId),
        slotB: winnerSlot(games[1], games[1].winnerId),
      };
    }
  }

  let result: BracketState = { ...next, rounds };
  const champ = rounds.find((m) => m.round === 'Championship');
  if (champ?.completed && champ.winnerId) {
    const w = winnerSlot(champ, champ.winnerId);
    result = {
      ...result,
      status: 'complete',
      championId: champ.winnerId,
      championName: w.teamName,
    };
  }
  return result;
}

export function pendingUserMadnessGame(
  bracket: BracketState,
  teamId: string,
): BracketMatchup | null {
  const round = nextMadnessRound(bracket);
  if (!round) return null;
  const pool =
    round === 'First Four'
      ? bracket.firstFour ?? []
      : (bracket.rounds ?? []).filter((m) => m.round === round);
  return pool.find((m) => isPlayable(m) && (m.slotA.teamId === teamId || m.slotB.teamId === teamId)) ?? null;
}

export function isMadnessComplete(bracket: BracketState): boolean {
  if (bracket.championId) return true;
  const champ = (bracket.rounds ?? []).find((m) => m.round === 'Championship');
  return Boolean(champ?.completed && champ.winnerId);
}

export function startCollegeTournament(save: CareerSave): CareerSave {
  const bracket = buildMarchMadnessBracket(save.standings, save.season);
  return {
    ...save,
    seasonStage: 'tournament',
    bracket,
    history: [...save.history, `March Madness field set for season ${save.season}`],
  };
}

export { REGIONS };
