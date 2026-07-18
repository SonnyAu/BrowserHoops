import { getDraftClass } from '../data/draftProspects';
import { nbaTeams, getProTeamByTid } from '../data/nbaTeams';
import { draftYearForCollegeSeason } from '../domain/createCareer';
import { overall, scoutedPotential } from '../domain/derived';
import {
  CareerSave,
  DraftBoardPick,
  DraftBoardState,
  Position,
} from '../domain/models';
import { Rng } from '../domain/rng';
import { buildProSchedule, initialProStandings } from './schedule';
import { updateRosterStatus } from './rosterStatus';

interface Prospect {
  id: string;
  name: string;
  position: Position;
  value: number;
  isUser: boolean;
}

function userDraftSlot(value: number, rng: Rng): number | null {
  if (value >= 86) return rng.int(1, 14);
  if (value >= 78) return rng.int(15, 30);
  if (value >= 70) return rng.int(31, 45);
  if (value >= 62) return rng.int(46, 60);
  return null;
}

function buildProspectPool(save: CareerSave, rng: Rng, draftYear: number): Prospect[] {
  const userValue =
    overall(save.player) * 0.5 +
    scoutedPotential(save.player, save.hidden) * 0.15 +
    save.draftStock * 0.35 +
    rng.int(-4, 4);
  const user: Prospect = {
    id: 'user',
    name: save.player.name,
    position: save.player.position,
    value: userValue,
    isUser: true,
  };

  const classProspects = getDraftClass(draftYear).map((p, i) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    value: p.overall * 0.65 + p.potential * 0.35 + rng.int(-4, 4) - i * 0.01,
    isUser: false,
  }));

  const first = ['Ace', 'Kai', 'Zion', 'Miles', 'Nash', 'Jett', 'Cole', 'Amari', 'Darius', 'Ty'];
  const last = ['Porter', 'Hayes', 'Brooks', 'Reed', 'Cross', 'Knight', 'Frost', 'Lane', 'West', 'Quinn'];
  const fillers: Prospect[] = [];
  while (classProspects.length + fillers.length < 70) {
    const i = fillers.length;
    fillers.push({
      id: `gen-${draftYear}-${i}`,
      name: `${rng.pick(first)} ${rng.pick(last)}`,
      position: rng.pick(['PG', 'SG', 'SF', 'PF', 'C'] as Position[]),
      value: 55 + rng.int(0, 20),
      isUser: false,
    });
  }

  return [user, ...classProspects, ...fillers].sort((a, b) => b.value - a.value);
}

export function beginDraft(save: CareerSave): CareerSave {
  const draftYear = save.draftYear || draftYearForCollegeSeason(save.season);
  const rng = new Rng(`${save.settings.seed}:draftboard:${save.id}:${draftYear}`);
  const pool = buildProspectPool(save, rng, draftYear);
  const user = pool.find((p) => p.isUser)!;
  const userPick = userDraftSlot(user.value, rng);

  const remaining = pool.filter((p) => !p.isUser);
  const picks: DraftBoardPick[] = [];

  for (let pick = 1; pick <= 60; pick++) {
    const team = nbaTeams[(pick - 1) % nbaTeams.length];
    let prospect: Prospect;
    if (userPick === pick) {
      prospect = user;
    } else {
      prospect = remaining.shift() ?? {
        id: `fill-${pick}`,
        name: `Prospect ${pick}`,
        position: 'SF' as Position,
        value: 50,
        isUser: false,
      };
    }
    picks.push({
      pick,
      round: pick <= 30 ? 1 : 2,
      teamId: team.id,
      teamAbbrev: team.abbrev,
      teamName: `${team.region} ${team.name}`,
      teamColors: team.colors,
      prospectId: prospect.id,
      prospectName: prospect.name,
      position: prospect.position,
      isUser: prospect.isUser,
      revealed: false,
    });
  }

  const board: DraftBoardState = {
    picks,
    currentIndex: 0,
    userPick,
    finished: false,
    undrafted: userPick == null,
  };

  return {
    ...save,
    phase: 'draft',
    draftYear,
    draftBoard: board,
    pendingDecisions: [],
    history: [
      ...save.history,
      userPick
        ? `Entered the ${draftYear} NBA Draft — projected pick ${userPick}`
        : `Entered the ${draftYear} NBA Draft — projected undrafted`,
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function advanceDraftPick(save: CareerSave): CareerSave {
  if (!save.draftBoard || save.draftBoard.finished) return save;
  const board = { ...save.draftBoard, picks: [...save.draftBoard.picks] };
  if (board.currentIndex >= board.picks.length) {
    return finishDraft(save);
  }
  const pick = { ...board.picks[board.currentIndex], revealed: true };
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
    return finishDraft(next);
  }
  return next;
}

export function skipDraftToUser(save: CareerSave): CareerSave {
  if (!save.draftBoard) return save;
  let next = save;
  const target = save.draftBoard.userPick ?? 61;
  while (
    next.draftBoard &&
    !next.draftBoard.finished &&
    next.draftBoard.currentIndex < target
  ) {
    next = advanceDraftPick(next);
  }
  return next;
}

export function skipDraftToEnd(save: CareerSave): CareerSave {
  let next = save;
  while (next.draftBoard && !next.draftBoard.finished) {
    next = advanceDraftPick(next);
  }
  return next;
}

export function finishDraft(save: CareerSave): CareerSave {
  const board = save.draftBoard;
  if (!board) return save;

  const userPick = board.picks.find((p) => p.isUser && p.revealed) ?? board.picks.find((p) => p.isUser);
  const undrafted = !userPick || board.undrafted;
  const draftYear = save.draftYear || draftYearForCollegeSeason(save.season);

  let team = undrafted
    ? nbaTeams[0]
    : nbaTeams.find((t) => t.id === userPick!.teamId) ?? getProTeamByTid(0)!;

  if (undrafted) {
    const rng = new Rng(`${save.settings.seed}:udfa:${save.id}`);
    team = rng.pick(nbaTeams);
  }

  const pickNum = userPick?.pick ?? null;
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
    collegeRoster: [],
    draftBoard: { ...board, finished: true, picks: board.picks.map((p) => ({ ...p, revealed: true })) },
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
    seasonEvents: [],
    seasonXp: 0,
    nextGame: 1,
    wins: 0,
    losses: 0,
    season: save.season + 1,
    // Age already advanced in college offseason development.
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
