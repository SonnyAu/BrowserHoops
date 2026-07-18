import { getDraftClass } from '../data/draftProspects';
import { nbaTeams, getProTeamByTid } from '../data/nbaTeams';
import { draftYearForCollegeSeason } from '../domain/createCareer';
import { overall, scoutedPotential } from '../domain/derived';
import {
  CareerSave,
  DraftBoardPick,
  DraftBoardState,
  DraftPoolProspect,
  DraftPositionCounts,
  LeaguePlayer,
  Position,
} from '../domain/models';
import { Rng } from '../domain/rng';
import { buildProSchedule, initialProStandings } from './schedule';
import { updateRosterStatus } from './rosterStatus';

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

const ADJACENT: Record<Position, Position[]> = {
  PG: ['SG'],
  SG: ['PG', 'SF'],
  SF: ['SG', 'PF'],
  PF: ['SF', 'C'],
  C: ['PF'],
};

function emptyCounts(): DraftPositionCounts {
  return { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
}

export function rosterPositionCounts(
  leagueRoster: LeaguePlayer[],
  tid: number,
): DraftPositionCounts {
  const counts = emptyCounts();
  for (const p of leagueRoster) {
    if (p.tid !== tid) continue;
    counts[p.position] += 1;
  }
  return counts;
}

export function buildTeamNeeds(leagueRoster: LeaguePlayer[]): Record<string, DraftPositionCounts> {
  const needs: Record<string, DraftPositionCounts> = {};
  for (const team of nbaTeams) {
    needs[team.id] = rosterPositionCounts(leagueRoster, team.tid);
  }
  return needs;
}

/** Lower strength = earlier pick. Top-8 avg OVR with lottery jitter. */
export function buildDraftOrder(leagueRoster: LeaguePlayer[], rng: Rng): typeof nbaTeams {
  const scored = nbaTeams.map((team) => {
    const roster = leagueRoster
      .filter((p) => p.tid === team.tid)
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 8);
    const avg =
      roster.length > 0
        ? roster.reduce((s, p) => s + p.overall, 0) / roster.length
        : 72;
    const strength = avg + rng.next() * 6 - 3;
    return { team, strength };
  });
  scored.sort((a, b) => a.strength - b.strength);
  return scored.map((s) => s.team);
}

/** Need is a tiebreaker among similar talent — keep bonuses modest. */
export function needScore(position: Position, counts: DraftPositionCounts): number {
  const n = counts[position] ?? 0;
  let primary = 0;
  if (n <= 1) primary = 5;
  else if (n === 2) primary = 2.5;
  else if (n === 3) primary = 0;
  else primary = -2;

  let adj = 0;
  for (const a of ADJACENT[position]) {
    const an = counts[a] ?? 0;
    if (an <= 1) adj += 3;
    else if (an === 2) adj += 1.25;
    else if (an >= 4) adj -= 1;
  }
  return primary + adj * 0.5;
}

export function bpaScore(p: DraftPoolProspect): number {
  return p.overall * 0.45 + p.potential * 0.55;
}

const CONTENDER_WINDOW = 5;
const NEED_CAP = 6;

function clampNeed(need: number): number {
  return Math.max(-NEED_CAP, Math.min(NEED_CAP, need));
}

export function selectProspect(
  teamId: string,
  remainingIds: string[],
  pool: DraftPoolProspect[],
  teamNeeds: Record<string, DraftPositionCounts>,
  rng: Rng,
  pickNumber: number,
): DraftPoolProspect {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const counts = teamNeeds[teamId] ?? emptyCounts();
  const needWeight = pickNumber <= 30 ? 1 : 1.2;

  const scored: { p: DraftPoolProspect; bpa: number }[] = [];
  for (const id of remainingIds) {
    const p = byId.get(id);
    if (!p) continue;
    scored.push({ p, bpa: p.isUser ? p.value : bpaScore(p) });
  }

  const topBpa = scored.reduce((m, s) => Math.max(m, s.bpa), -Infinity);
  let best: DraftPoolProspect | null = null;
  let bestScore = -Infinity;

  for (const { p, bpa } of scored) {
    const gap = topBpa - bpa;
    const rawNeed = gap > CONTENDER_WINDOW ? 0 : needScore(p.position, counts) * needWeight;
    const need = clampNeed(rawNeed);
    const score = bpa + need + rng.int(-2, 2);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (!best) {
    return {
      id: `fill-${pickNumber}`,
      name: `Prospect ${pickNumber}`,
      position: 'SF',
      overall: 50,
      potential: 55,
      value: 50,
      isUser: false,
    };
  }
  return best;
}

function buildProspectPool(
  save: CareerSave,
  rng: Rng,
  draftYear: number,
): DraftPoolProspect[] {
  const userOvr = overall(save.player);
  const userPot = scoutedPotential(save.player, save.hidden);
  const userValue =
    userOvr * 0.5 + userPot * 0.15 + save.draftStock * 0.35 + rng.int(-4, 4);
  const user: DraftPoolProspect = {
    id: 'user',
    name: save.player.name,
    position: save.player.position,
    overall: userOvr,
    potential: userPot,
    value: userValue,
    isUser: true,
  };

  const classProspects: DraftPoolProspect[] = getDraftClass(draftYear).map((p, i) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    overall: p.overall,
    potential: p.potential,
    value: p.overall * 0.65 + p.potential * 0.35 + rng.int(-4, 4) - i * 0.01,
    isUser: false,
  }));

  const first = ['Ace', 'Kai', 'Zion', 'Miles', 'Nash', 'Jett', 'Cole', 'Amari', 'Darius', 'Ty'];
  const last = ['Porter', 'Hayes', 'Brooks', 'Reed', 'Cross', 'Knight', 'Frost', 'Lane', 'West', 'Quinn'];
  const fillers: DraftPoolProspect[] = [];
  while (classProspects.length + fillers.length < 70) {
    const i = fillers.length;
    const ovr = 55 + rng.int(0, 20);
    fillers.push({
      id: `gen-${draftYear}-${i}`,
      name: `${rng.pick(first)} ${rng.pick(last)}`,
      position: rng.pick(POSITIONS),
      overall: ovr,
      potential: ovr + rng.int(0, 12),
      value: ovr,
      isUser: false,
    });
  }

  return [user, ...classProspects, ...fillers].sort((a, b) => b.value - a.value);
}

export function beginDraft(save: CareerSave): CareerSave {
  const draftYear = save.draftYear || draftYearForCollegeSeason(save.season);
  const rng = new Rng(`${save.settings.seed}:draftboard:${save.id}:${draftYear}`);
  const pool = buildProspectPool(save, rng, draftYear);
  const orderRng = new Rng(`${save.settings.seed}:draftorder:${save.id}:${draftYear}`);
  const order = buildDraftOrder(save.leagueRoster ?? [], orderRng);
  const teamNeeds = buildTeamNeeds(save.leagueRoster ?? []);

  const picks: DraftBoardPick[] = [];
  for (let pick = 1; pick <= 60; pick++) {
    const team = order[(pick - 1) % order.length];
    picks.push({
      pick,
      round: pick <= 30 ? 1 : 2,
      teamId: team.id,
      teamAbbrev: team.abbrev,
      teamName: `${team.region} ${team.name}`,
      teamColors: team.colors,
      prospectId: '',
      prospectName: 'TBD',
      position: 'SF',
      isUser: false,
      revealed: false,
    });
  }

  const board: DraftBoardState = {
    picks,
    currentIndex: 0,
    userPick: null,
    finished: false,
    undrafted: false,
    pool,
    remainingIds: pool.map((p) => p.id),
    teamNeeds,
  };

  return {
    ...save,
    phase: 'draft',
    draftYear,
    draftBoard: board,
    pendingDecisions: [],
    history: [
      ...save.history,
      `Entered the ${draftYear} NBA Draft — live board (BPA + roster need)`,
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function advanceDraftPick(save: CareerSave): CareerSave {
  if (!save.draftBoard || save.draftBoard.finished) return save;
  const board = {
    ...save.draftBoard,
    picks: [...save.draftBoard.picks],
    remainingIds: [...(save.draftBoard.remainingIds ?? [])],
    pool: save.draftBoard.pool ?? [],
    teamNeeds: structuredClone(save.draftBoard.teamNeeds ?? {}),
  };

  if (board.currentIndex >= board.picks.length) {
    return finishDraft(save);
  }

  // Migrate old pre-filled boards: if already assigned, just reveal
  const slot = board.picks[board.currentIndex];
  let pick: DraftBoardPick;

  if (slot.prospectId && slot.prospectName !== 'TBD') {
    pick = { ...slot, revealed: true };
  } else {
    const rng = new Rng(
      `${save.settings.seed}:draftpick:${save.id}:${save.draftYear}:${slot.pick}`,
    );
    const remaining =
      board.remainingIds.length > 0
        ? board.remainingIds
        : (board.pool ?? []).map((p) => p.id);
    const prospect = selectProspect(
      slot.teamId,
      remaining,
      board.pool,
      board.teamNeeds,
      rng,
      slot.pick,
    );
    pick = {
      ...slot,
      prospectId: prospect.id,
      prospectName: prospect.name,
      position: prospect.position,
      isUser: prospect.isUser,
      revealed: true,
    };
    board.remainingIds = remaining.filter((id) => id !== prospect.id);
    const counts = board.teamNeeds[slot.teamId] ?? emptyCounts();
    counts[prospect.position] = (counts[prospect.position] ?? 0) + 1;
    board.teamNeeds[slot.teamId] = counts;
    if (prospect.isUser) {
      board.userPick = slot.pick;
      board.undrafted = false;
    }
  }

  board.picks[board.currentIndex] = pick;
  board.currentIndex += 1;

  let next: CareerSave = {
    ...save,
    draftBoard: board,
    updatedAt: new Date().toISOString(),
  };

  if (pick.isUser) {
    next = {
      ...next,
      history: [
        ...next.history,
        `With the ${pick.pick}${ordinal(pick.pick)} pick, the ${pick.teamName} select ${pick.prospectName}`,
      ],
    };
  }

  if (board.currentIndex >= board.picks.length) {
    // If user never taken, mark undrafted
    if (board.userPick == null) {
      board.undrafted = true;
      next = { ...next, draftBoard: board };
    }
    return finishDraft(next);
  }
  return next;
}

export function skipDraftToUser(save: CareerSave): CareerSave {
  if (!save.draftBoard) return save;
  let next = save;
  let guard = 0;
  while (
    next.draftBoard &&
    !next.draftBoard.finished &&
    next.draftBoard.userPick == null &&
    next.draftBoard.remainingIds?.includes('user') &&
    guard++ < 70
  ) {
    next = advanceDraftPick(next);
  }
  // One more if user was just selected on the last advance (already revealed)
  if (
    next.draftBoard &&
    next.draftBoard.userPick != null &&
    !next.draftBoard.picks.find((p) => p.isUser)?.revealed
  ) {
    next = advanceDraftPick(next);
  }
  return next;
}

export function skipDraftToEnd(save: CareerSave): CareerSave {
  let next = save;
  let guard = 0;
  while (next.draftBoard && !next.draftBoard.finished && guard++ < 70) {
    next = advanceDraftPick(next);
  }
  return next;
}

export function finishDraft(save: CareerSave): CareerSave {
  const board = save.draftBoard;
  if (!board) return save;

  const userPick =
    board.picks.find((p) => p.isUser && p.revealed) ?? board.picks.find((p) => p.isUser);
  const undrafted = !userPick || board.undrafted || !userPick.prospectId;
  const draftYear = save.draftYear || draftYearForCollegeSeason(save.season);

  let team = undrafted
    ? nbaTeams[0]
    : nbaTeams.find((t) => t.id === userPick!.teamId) ?? getProTeamByTid(0)!;

  if (undrafted) {
    const rng = new Rng(`${save.settings.seed}:udfa:${save.id}`);
    team = rng.pick(nbaTeams);
  }

  const pickNum = undrafted ? null : userPick?.pick ?? null;
  const round = pickNum == null ? null : pickNum <= 30 ? 1 : 2;
  const amount = undrafted
    ? 1200
    : round === 1
      ? Math.round(8000 - ((pickNum ?? 30) - 1) * 180)
      : Math.round(2500 - ((pickNum ?? 45) - 31) * 40);

  const schedule = buildProSchedule(
    team.id,
    Math.min(82, save.settings.proSeasonLength),
    save.settings.seed + ':rookie',
  );
  const teamName = `${team.region} ${team.name}`;

  let next: CareerSave = {
    ...save,
    phase: 'professional',
    proTeamId: team.id,
    draftBoard: {
      ...board,
      finished: true,
      undrafted,
      picks: board.picks.map((p) => ({ ...p, revealed: true })),
    },
    draft: {
      year: draftYear,
      round,
      pick: pickNum,
      tid: team.tid,
      undrafted,
    },
    draftYear,
    contract: {
      amount,
      exp: undrafted ? draftYear + 1 : draftYear + 3,
      type: undrafted ? 'minimum' : 'rookie',
      option: 'team',
    },
    schedule,
    standings: initialProStandings(team.id),
    seasonStage: 'regular',
    bracket: null,
    seasonEvents: [],
    seasonXp: 0,
    nextGame: 1,
    wins: 0,
    losses: 0,
    season: save.season + 1,
    seasonLogBuffer: [],
    ratingsAtSeasonStart: { ...save.player.ratings },
    ovrAtSeasonStart: overall(save.player),
    potAtSeasonStart: scoutedPotential(save.player, save.hidden),
    collegeRoster: [],
    role: undrafted ? 'Rotation Player' : round === 1 && (pickNum ?? 99) <= 10 ? 'Starter' : 'Spot Starter',
    roleAtSeasonStart: undrafted ? 'Rotation Player' : 'Spot Starter',
    minutes: undrafted ? 14 : round === 1 && (pickNum ?? 99) <= 10 ? 28 : 20,
    usage: undrafted ? 0.12 : 0.18,
    rosterStatus: 'active',
    transactions: [
      ...save.transactions,
      {
        season: save.season + 1,
        type: undrafted ? 'Undrafted FA' : 'Drafted',
        detail: undrafted
          ? `Signed with ${teamName}`
          : `Drafted R${round} P${pickNum} by ${teamName} (${draftYear})`,
      },
    ],
    history: [
      ...save.history,
      undrafted
        ? `Went undrafted in ${draftYear}; signed with ${teamName}`
        : `Drafted Round ${round} Pick ${pickNum} by ${teamName} (${draftYear})`,
    ],
    pendingDecisions: [],
    updatedAt: new Date().toISOString(),
  };

  next = updateRosterStatus(next);
  next = { ...next, roleAtSeasonStart: next.role };
  return next;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/** @deprecated use beginDraft + advance */
export function runDraft(save: CareerSave): CareerSave {
  return skipDraftToEnd(beginDraft(save));
}
