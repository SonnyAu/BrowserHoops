import { getCollege } from '../data/colleges';
import { prospectsAtCollege } from '../data/draftProspects';
import { getProTeam } from '../data/nbaTeams';
import { overall } from '../domain/derived';
import {
  BoxLine,
  CareerSave,
  GameLog,
  LeagueGamePlayoffMeta,
  LeagueGameRecord,
  ScheduledGame,
  SeasonStage,
} from '../domain/models';
import { Rng } from '../domain/rng';
import { getEffectiveRatings } from '../domain/traits';
import { accrueXpAfterGame } from './development';
import {
  eventFromHugeGame,
  maybeAllStarEvents,
  maybeHofEvent,
  maybeNewsEvent,
  pushSeasonEvents,
} from './events';
import { updateRosterStatus } from './rosterStatus';
import { updateStandings } from './schedule';
import { applyTraining, trainingXpMult } from './training';

export type UserGameOpts = {
  playoffs?: boolean;
  /** Override home-court boost (0 = true neutral). Default: +3 home / 0 away. */
  homeBoost?: number;
  updateStandings?: boolean;
  skipSeasonEvents?: boolean;
  stage?: SeasonStage;
  playoffMeta?: LeagueGamePlayoffMeta;
};

export type UserGameResult = {
  save: CareerSave;
  log: GameLog;
  leagueGame: LeagueGameRecord;
  won: boolean;
  selfId: string;
};

function gradeFromBox(pts: number, min: number, plusMinus: number): string {
  const per = min > 0 ? (pts + plusMinus / 2) / (min / 30) : 0;
  if (per >= 28) return 'A';
  if (per >= 22) return 'B+';
  if (per >= 16) return 'B';
  if (per >= 10) return 'C';
  return 'D';
}

function emptyLog(
  save: CareerSave,
  upcoming: ScheduledGame,
  grade: string,
  injuryUpdate?: string,
): GameLog {
  return {
    id: `game-${save.id}-${upcoming.gameNumber}`,
    saveId: save.id,
    season: save.season,
    phase: save.phase,
    gameNumber: upcoming.gameNumber,
    opponent: upcoming.opponentName,
    opponentId: upcoming.opponentId,
    home: upcoming.home,
    result: 'L',
    teamScore: 0,
    opponentScore: 0,
    points: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fouls: 0,
    minutes: 0,
    plusMinus: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    grade,
    injuryUpdate,
    createdAt: new Date().toISOString(),
  };
}

export function buildUserLeagueGame(
  save: CareerSave,
  upcoming: ScheduledGame,
  teamScore: number,
  opponentScore: number,
  userLine: BoxLine | null,
  stage: SeasonStage,
  playoffMeta?: LeagueGamePlayoffMeta,
): LeagueGameRecord {
  const selfId = save.collegeId ?? save.proTeamId ?? 'self';
  const selfName =
    save.proTeamId && getProTeam(save.proTeamId)
      ? `${getProTeam(save.proTeamId)!.region} ${getProTeam(save.proTeamId)!.name}`
      : getCollege(save.collegeId ?? '')?.name ?? 'Team';
  const homeTeamId = upcoming.home ? selfId : upcoming.opponentId;
  const awayTeamId = upcoming.home ? upcoming.opponentId : selfId;
  const homeTeamName = upcoming.home ? selfName : upcoming.opponentName;
  const awayTeamName = upcoming.home ? upcoming.opponentName : selfName;
  const homeScore = upcoming.home ? teamScore : opponentScore;
  const awayScore = upcoming.home ? opponentScore : teamScore;
  const level = save.phase === 'professional' || save.proTeamId ? 'pro' : 'college';
  return {
    id: `lg-${save.id}-s${save.season}-d${upcoming.gameNumber}-user-${selfId}`,
    saveId: save.id,
    season: save.season,
    level,
    stage,
    day: upcoming.gameNumber,
    homeTeamId,
    homeTeamName,
    awayTeamId,
    awayTeamName,
    homeScore,
    awayScore,
    playoffMeta,
    players: userLine ? [userLine] : [],
    createdAt: new Date().toISOString(),
  };
}

function assignRole(save: CareerSave) {
  return {
    minutes: save.minutes,
    usage: save.usage,
  };
}

/** Simulate the user's next scheduled game with real OVR/XP/injury impact. */
export function simulateUserScheduledGame(
  save: CareerSave,
  upcoming: ScheduledGame,
  opts: UserGameOpts = {},
): UserGameResult {
  const playoffs = opts.playoffs ?? false;
  const stage = opts.stage ?? upcoming.stage ?? (playoffs ? 'playoffs' : 'regular');
  const doStandings = opts.updateStandings ?? stage === 'regular';
  const skipEvents = opts.skipSeasonEvents ?? playoffs;

  let next = applyTraining(save, String(upcoming.gameNumber));
  next = updateRosterStatus(next);
  const trainMult = trainingXpMult(next);
  const rng = new Rng(`${next.settings.seed}:${next.id}:${next.phase}:${upcoming.gameNumber}`);
  const role = assignRole(next);
  const r = getEffectiveRatings(next.player);

  const ovr = overall(next.player);
  const selfId = next.collegeId ?? next.proTeamId ?? 'self';
  const oppCollege = getCollege(upcoming.opponentId);
  const oppPro = getProTeam(upcoming.opponentId);
  const oppProspects =
    next.phase === 'college'
      ? prospectsAtCollege(upcoming.opponentId).filter((p) => p.draftYear >= next.draftYear)
      : [];
  const oppProspectBoost = oppProspects.reduce((s, p) => s + (p.overall - 70) * 0.35, 0);
  const teammateBoost =
    next.phase === 'college'
      ? next.collegeRoster.reduce((s, m) => s + Math.max(0, m.overall - 72) * 0.2, 0)
      : 0;
  const proPrestige = next.proTeamId ? 78 : (getCollege(next.collegeId ?? '')?.prestige ?? 72);
  const playerOut = next.injury.gamesRemaining > 0;

  const teamStrength = playerOut
    ? 48 + teammateBoost + proPrestige * 0.15 + rng.int(-6, 6)
    : ovr * 0.5 +
      role.minutes +
      proPrestige * 0.2 -
      next.fatigue * (0.2 - r.endu / 800) +
      next.morale.overall * 0.05 +
      r.spd * 0.05 +
      teammateBoost;

  const oppStrength =
    (oppCollege?.prestige ??
      (oppPro ? 75 + (oppPro.tid % 7) : next.phase === 'professional' ? 76 : 72)) +
    oppProspectBoost +
    rng.int(-10, 10);
  const homeBoost =
    opts.homeBoost !== undefined ? opts.homeBoost : upcoming.home ? 3 : 0;
  const teamScore = Math.round(
    62 + (teamStrength - 70) / 2.2 + rng.int(0, 18) + homeBoost,
  );
  const opponentScore = Math.round(60 + (oppStrength - 70) / 2.5 + rng.int(0, 18));
  const won = teamScore >= opponentScore;
  const oppStar = oppProspects.sort((a, b) => b.overall - a.overall)[0];
  const oppStarLine =
    oppStar != null
      ? `${oppStar.name} ${Math.max(6, Math.round(8 + oppStar.overall / 6 + rng.int(-3, 8)))} pts`
      : null;

  if (playerOut) {
    let standings = doStandings
      ? updateStandings(next.standings ?? [], selfId, upcoming.opponentId, won)
      : next.standings;
    const log: GameLog = {
      ...emptyLog(next, upcoming, 'OUT', next.injury.type),
      result: won ? 'W' : 'L',
      teamScore,
      opponentScore,
      playoffs,
    };
    const ug = buildUserLeagueGame(
      next,
      upcoming,
      teamScore,
      opponentScore,
      null,
      stage,
      opts.playoffMeta,
    );
    log.leagueGameId = ug.id;
    let injuredSave: CareerSave = {
      ...next,
      injury: {
        ...next.injury,
        gamesRemaining: next.injury.gamesRemaining - 1,
        type: next.injury.gamesRemaining - 1 <= 0 ? 'Healthy' : next.injury.type,
      },
      nextGame: next.nextGame + 1,
      wins: next.wins + (won ? 1 : 0),
      losses: next.losses + (won ? 0 : 1),
      schedule: next.schedule.map((g) =>
        g.id === upcoming.id
          ? {
              ...g,
              completed: true,
              result: log.result,
              teamScore,
              opponentScore,
              leagueGameId: ug.id,
            }
          : g,
      ),
      standings,
      seasonLogBuffer: [...next.seasonLogBuffer, log],
      history: [
        ...next.history,
        `Missed game ${upcoming.gameNumber} vs ${upcoming.opponentName} (injury) — team ${log.result} ${teamScore}-${opponentScore}`,
      ],
      updatedAt: new Date().toISOString(),
    };
    if (!skipEvents) {
      injuredSave = pushSeasonEvents(injuredSave, [
        ...eventFromHugeGame(injuredSave, log, oppStarLine),
        ...maybeNewsEvent(injuredSave, upcoming.gameNumber, next.settings.seed),
      ]);
    }
    injuredSave = accrueXpAfterGame(injuredSave, {
      userMinutes: 0,
      userUsage: 0,
      userPerformance: 0.55,
      teamWon: won,
      trainingMult: trainMult * 0.35,
    });
    injuredSave = updateRosterStatus(injuredSave);
    return { save: injuredSave, log, leagueGame: ug, won, selfId };
  }

  const minutes = Math.max(
    4,
    Math.round(role.minutes * (1 - next.fatigue / 220) + rng.int(-3, 3)),
  );
  const usage = Math.min(
    0.42,
    role.usage * (0.9 + r.drb / 500) * (0.88 + ovr / 250),
  );
  const fgaRate = 0.95 + ovr / 250;
  const fga = Math.max(1, Math.round(minutes * usage * fgaRate + rng.int(0, 5)));
  const midShare = r.fg / 120;
  const threeShare = r.tp / 140;
  const tpa = Math.min(fga, Math.round(fga * Math.min(0.55, threeShare)));
  const midA = Math.min(fga - tpa, Math.round((fga - tpa) * Math.min(0.7, midShare)));
  const rimA = Math.max(0, fga - tpa - midA);
  const rimPct = 0.42 + r.ins / 350 + r.dnk / 400 + r.stre / 500;
  const midPct = 0.34 + r.fg / 380 + r.oiq / 600;
  const tpPct = 0.28 + r.tp / 400 + r.oiq / 700;
  const fgm =
    Math.min(rimA, Math.round(rimA * rimPct)) +
    Math.min(midA, Math.round(midA * midPct)) +
    Math.min(tpa, Math.round(tpa * tpPct));
  const tpm = Math.min(tpa, Math.round(tpa * tpPct));
  const fta = Math.round(minutes * 0.22 + r.dnk / 35 + rng.int(0, 4));
  const ftm = Math.min(fta, Math.round(fta * (0.62 + r.ft / 280)));
  const points = (fgm - tpm) * 2 + tpm * 3 + ftm;
  const rebounds = Math.max(
    0,
    Math.round(
      (minutes / 28) * (r.reb / 9 + r.hgt / 36 + r.jmp / 45 + r.stre / 55) + rng.int(-1, 4),
    ),
  );
  const assists = Math.max(
    0,
    Math.round((minutes / 28) * (r.pss / 9 + r.oiq / 35) + rng.int(-1, 4)),
  );
  const steals = Math.max(0, Math.round((r.diq / 45 + r.spd / 55) * rng.next() * 2.2));
  const blocks = Math.max(
    0,
    Math.round((r.hgt / 40 + r.jmp / 50 + r.diq / 60) * rng.next() * 2),
  );
  const turnovers = Math.max(
    0,
    rng.int(0, 5) - Math.floor(r.oiq / 35) - Math.floor(r.drb / 45),
  );
  const fouls = rng.int(0, 5);
  const plusMinus = Math.round((won ? 6 : -6) + (points - 12) / 2 + rng.int(-6, 6));

  let injury = next.injury;
  let injuryUpdate: string | undefined;
  const injuryChance =
    0.015 *
    next.settings.injuryFrequency *
    (1 + next.fatigue / 100) *
    (1.1 - r.endu / 200) *
    (save.trainingIntensity === 'intense' ? 1.3 : 1);
  if (rng.next() < injuryChance) {
    const gamesOut = Math.round(rng.int(1, 8) * next.settings.injurySeverity);
    const types = [
      'Ankle sprain',
      'Knee soreness',
      'Back tightness',
      'Hamstring strain',
      'Concussion protocol',
    ];
    injury = { type: rng.pick(types), gamesRemaining: gamesOut };
    injuryUpdate = `${injury.type} — out ~${gamesOut}g`;
  }

  const fatigue = Math.min(
    100,
    Math.max(0, next.fatigue + minutes / (8 + r.endu / 40) - 3 - r.spd / 80),
  );
  const moraleDelta = won ? 2 : -2;
  const coachDelta = points >= 15 ? 1 : points < 6 ? -1 : 0;

  let draftStock = next.draftStock;
  if (next.phase === 'college') {
    draftStock += (points - 12) / 20 + (won ? 0.3 : -0.2) + rng.next() * 0.2 - 0.1;
    draftStock = Math.max(1, Math.min(99, draftStock));
  }

  const log: GameLog = {
    id: `game-${next.id}-${upcoming.gameNumber}`,
    saveId: next.id,
    season: next.season,
    phase: next.phase,
    gameNumber: upcoming.gameNumber,
    opponent: upcoming.opponentName,
    opponentId: upcoming.opponentId,
    home: upcoming.home,
    result: won ? 'W' : 'L',
    teamScore,
    opponentScore,
    points,
    rebounds,
    assists,
    steals,
    blocks,
    turnovers,
    fouls,
    minutes,
    plusMinus,
    fgm,
    fga,
    tpm,
    tpa,
    ftm,
    fta,
    grade: gradeFromBox(points, minutes, plusMinus),
    injuryUpdate,
    createdAt: new Date().toISOString(),
    playoffs,
  };

  const userLine: BoxLine = {
    playerId: 'user',
    playerName: next.player.name,
    teamId: selfId,
    minutes,
    points,
    rebounds,
    assists,
    steals,
    blocks,
    turnovers,
    fgm,
    fga,
    tpm,
    tpa,
    ftm,
    fta,
    isUser: true,
  };
  const ug = buildUserLeagueGame(
    next,
    upcoming,
    teamScore,
    opponentScore,
    userLine,
    stage,
    opts.playoffMeta,
  );
  log.leagueGameId = ug.id;

  const schedule = next.schedule.map((g) =>
    g.id === upcoming.id
      ? {
          ...g,
          completed: true,
          result: log.result,
          teamScore,
          opponentScore,
          leagueGameId: ug.id,
        }
      : g,
  );
  let standings = doStandings
    ? updateStandings(next.standings ?? [], selfId, upcoming.opponentId, won)
    : next.standings;

  const pending = [...next.pendingDecisions];
  if (
    next.settings.interruptOnInjury &&
    injuryUpdate &&
    !pending.some((d) => d.type === 'injury')
  ) {
    pending.push({
      id: crypto.randomUUID(),
      type: 'injury',
      title: 'Injury decision',
      body: injuryUpdate,
      choices: [
        { id: 'rest', label: 'Rest fully', effect: 'Recover faster, miss more' },
        { id: 'push', label: 'Push through', effect: 'Higher risk, stay available' },
      ],
      interrupt: true,
    });
  }
  if (
    !playoffs &&
    upcoming.gameNumber === 12 &&
    next.minutes < 18 &&
    overall(next.player) > 75 &&
    next.settings.interruptOnDecisions &&
    !pending.some((d) => d.type === 'role')
  ) {
    pending.push({
      id: crypto.randomUUID(),
      type: 'role',
      title: 'Request more minutes?',
      body: 'Your production outpaces your role. Talk to the coaching staff?',
      choices: [
        { id: 'request', label: 'Request a larger role', effect: 'Minutes+, trust risk' },
        { id: 'stay', label: 'Stay patient', effect: 'Trust+, slower minutes' },
      ],
      interrupt: true,
    });
  }

  const poTag = playoffs ? ' [PO]' : '';
  next = {
    ...next,
    schedule,
    standings,
    nextGame: next.nextGame + 1,
    wins: next.wins + (won ? 1 : 0),
    losses: next.losses + (won ? 0 : 1),
    fatigue,
    injury,
    draftStock,
    coachTrust: Math.max(20, Math.min(99, next.coachTrust + coachDelta)),
    morale: {
      ...next.morale,
      overall: Math.max(20, Math.min(99, next.morale.overall + moraleDelta)),
    },
    pendingDecisions: pending,
    seasonLogBuffer: [...next.seasonLogBuffer, log],
    gameLogsSummary: [
      `S${next.season} G${log.gameNumber}${poTag}: ${log.result} ${log.teamScore}-${log.opponentScore} vs ${log.opponent} — ${log.points}/${log.rebounds}/${log.assists}`,
      ...next.gameLogsSummary,
    ].slice(0, 200),
    history: [
      ...next.history,
      `${playoffs ? 'Playoffs ' : ''}Game ${log.gameNumber}: ${log.result} vs ${log.opponent}, ${log.points} pts` +
        (oppStarLine ? ` · ${oppStarLine}` : ''),
    ],
    updatedAt: log.createdAt,
  };

  if (!skipEvents) {
    next = pushSeasonEvents(next, [
      ...eventFromHugeGame(next, log, oppStarLine),
      ...maybeAllStarEvents(next, upcoming.gameNumber),
      ...maybeHofEvent(next, upcoming.gameNumber, next.settings.seed),
      ...maybeNewsEvent(next, upcoming.gameNumber, next.settings.seed),
    ]);
  }
  const userPerf = Math.min(1.5, Math.max(0.5, points / Math.max(8, minutes * 0.5)));
  next = accrueXpAfterGame(next, {
    userMinutes: minutes,
    userUsage: usage,
    userPerformance: userPerf,
    teamWon: won,
    trainingMult: trainMult,
  });
  next = updateRosterStatus(next);
  return { save: next, log, leagueGame: ug, won, selfId };
}
