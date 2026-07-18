import { getCollege } from '../data/colleges';
import { prospectsAtCollege } from '../data/draftProspects';
import { getProTeam } from '../data/nbaTeams';
import { draftYearForCollegeSeason } from '../domain/createCareer';
import { formatDelta, overall, scoutedPotential } from '../domain/derived';
import {
  CareerSave,
  GameLog,
  PendingDecision,
  SeasonReview,
  SeasonStats,
} from '../domain/models';
import { Rng } from '../domain/rng';
import { getEffectiveRatings } from '../domain/traits';
import { grantSeasonAwards } from './awards';
import {
  accrueXpAfterGame,
  applyOffseasonDevelopment,
  ensureLeagueRoster,
} from './development';
import { beginDraft } from './draft';
import {
  awardEvents,
  eventFromHugeGame,
  maybeAllStarEvents,
  maybeHofEvent,
  maybeNewsEvent,
  pushSeasonEvents,
} from './events';
import { updateRosterStatus } from './rosterStatus';
import {
  advanceConferenceGames,
  initialCollegeStandings,
  initialProStandings,
  updateStandings,
} from './schedule';
import { startNextCollegeSeason, startNextProSeason } from './season';
import { applyTraining, trainingXpMult } from './training';

function normalizeSeasonState(save: CareerSave): CareerSave {
  let next = save.seasonEvents ? save : { ...save, seasonEvents: [] };
  if (next.seasonXp == null) next = { ...next, seasonXp: 0 };
  if (!next.developmentLog) next = { ...next, developmentLog: [] };
  next = ensureLeagueRoster(next);
  const rows = next.standings ?? [];
  if (!rows.length || rows.some((r) => !r.conference)) {
    if (next.proTeamId) next = { ...next, standings: initialProStandings(next.proTeamId) };
    else if (next.collegeId) next = { ...next, standings: initialCollegeStandings(next.collegeId) };
  }
  return next;
}

export function assignRole(save: CareerSave) {
  return {
    role: save.role,
    minutes: save.minutes,
    usage: save.usage,
    coachTrust: save.coachTrust,
    fatigue: save.fatigue,
    morale: save.morale.overall,
    health: save.injury.type,
    status: save.rosterStatus,
  };
}

function gradeFromBox(pts: number, min: number, plusMinus: number): string {
  const per = min > 0 ? (pts + plusMinus / 2) / (min / 30) : 0;
  if (per >= 28) return 'A';
  if (per >= 22) return 'B+';
  if (per >= 16) return 'B';
  if (per >= 10) return 'C';
  return 'D';
}

export function simulateNextGame(save: CareerSave): { save: CareerSave; log: GameLog } {
  if (save.retired) throw new Error('Career is retired');
  if (save.phase === 'seasonReview' || save.phase === 'draft') {
    throw new Error('Cannot simulate during season review or draft');
  }
  const normalized = normalizeSeasonState(save);
  const upcoming = normalized.schedule.find((g) => !g.completed);
  if (!upcoming) {
    return finalizeSeason(normalized);
  }

  let next = ensureLeagueRoster(normalized);
  next = applyTraining(next, String(upcoming.gameNumber));
  next = updateRosterStatus(next);
  const trainMult = trainingXpMult(next);
  const rng = new Rng(`${next.settings.seed}:${next.id}:${next.phase}:${upcoming.gameNumber}`);
  const role = assignRole(next);
  const r = getEffectiveRatings(next.player);

  const ovr = overall(next.player);
  const selfId = next.collegeId ?? next.proTeamId ?? 'self';
  const oppCollege = getCollege(upcoming.opponentId);
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
    (oppCollege?.prestige ?? (next.phase === 'professional' ? 76 : 72)) +
    oppProspectBoost +
    rng.int(-10, 10);
  const homeBoost = upcoming.home ? 3 : 0;
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
    let standings = updateStandings(next.standings ?? [], selfId, upcoming.opponentId, won);
    standings = advanceConferenceGames(
      standings,
      next.settings.seed,
      upcoming.gameNumber,
      [selfId, upcoming.opponentId],
      next.phase,
    );
    const log: GameLog = {
      ...emptyLog(next, upcoming, 'OUT', next.injury.type),
      result: won ? 'W' : 'L',
      teamScore,
      opponentScore,
    };
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
          ? { ...g, completed: true, result: log.result, teamScore, opponentScore }
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
    injuredSave = pushSeasonEvents(injuredSave, [
      ...eventFromHugeGame(injuredSave, log, oppStarLine),
      ...maybeNewsEvent(injuredSave, upcoming.gameNumber, next.settings.seed),
    ]);
    injuredSave = accrueXpAfterGame(injuredSave, {
      userMinutes: 0,
      userUsage: 0,
      userPerformance: 0.55,
      teamWon: won,
      trainingMult: trainMult * 0.35,
    });
    return { save: injuredSave, log };
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
  const rimShare = (r.ins + r.dnk) / 200;
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
    const types = ['Ankle sprain', 'Knee soreness', 'Back tightness', 'Hamstring strain', 'Concussion protocol'];
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
  };

  const schedule = next.schedule.map((g) =>
    g.id === upcoming.id
      ? { ...g, completed: true, result: log.result, teamScore, opponentScore }
      : g,
  );
  let standings = updateStandings(next.standings ?? [], selfId, upcoming.opponentId, won);
  standings = advanceConferenceGames(
    standings,
    next.settings.seed,
    upcoming.gameNumber,
    [selfId, upcoming.opponentId],
    next.phase,
  );

  const pending = [...next.pendingDecisions];
  if (next.settings.interruptOnInjury && injuryUpdate && !pending.some((d) => d.type === 'injury')) {
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
      `S${next.season} G${log.gameNumber}: ${log.result} ${log.teamScore}-${log.opponentScore} vs ${log.opponent} — ${log.points}/${log.rebounds}/${log.assists}`,
      ...next.gameLogsSummary,
    ].slice(0, 200),
    history: [
      ...next.history,
      `Game ${log.gameNumber}: ${log.result} vs ${log.opponent}, ${log.points} pts` +
        (oppStarLine ? ` · ${oppStarLine}` : ''),
    ],
    updatedAt: log.createdAt,
  };

  next = pushSeasonEvents(next, [
    ...eventFromHugeGame(next, log, oppStarLine),
    ...maybeAllStarEvents(next, upcoming.gameNumber),
    ...maybeHofEvent(next, upcoming.gameNumber, next.settings.seed),
    ...maybeNewsEvent(next, upcoming.gameNumber, next.settings.seed),
  ]);
  const userPerf = Math.min(1.5, Math.max(0.5, points / Math.max(8, minutes * 0.5)));
  next = accrueXpAfterGame(next, {
    userMinutes: minutes,
    userUsage: usage,
    userPerformance: userPerf,
    teamWon: won,
    trainingMult: trainMult,
  });
  next = updateRosterStatus(next);
  return { save: next, log };
}

export function simulateCollegeGame(save: CareerSave) {
  return simulateNextGame(save);
}

function emptyLog(
  save: CareerSave,
  upcoming: { gameNumber: number; opponentName: string; opponentId: string; home: boolean },
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

export function accumulateSeasonStats(save: CareerSave, logs: GameLog[]): SeasonStats {
  const teamName =
    save.phase === 'professional' || save.proTeamId
      ? getProTeam(save.proTeamId ?? '')
        ? `${getProTeam(save.proTeamId!)!.region} ${getProTeam(save.proTeamId!)!.name}`
        : 'Pro'
      : getCollege(save.collegeId ?? '')?.name ?? 'College';
  const played = logs.filter((l) => l.minutes > 0 || l.opponent === 'Season Complete');
  const real = logs.filter((l) => l.minutes > 0);
  const sum = (k: keyof GameLog) => real.reduce((s, l) => s + (Number(l[k]) || 0), 0);
  return {
    season: save.season,
    level: save.proTeamId ? 'pro' : 'college',
    teamId: save.collegeId ?? save.proTeamId ?? 'unknown',
    teamName,
    gp: real.length,
    gs: real.filter((l) => l.minutes >= 20).length,
    min: sum('minutes'),
    pts: sum('points'),
    reb: sum('rebounds'),
    ast: sum('assists'),
    stl: sum('steals'),
    blk: sum('blocks'),
    tov: sum('turnovers'),
    fg: sum('fgm'),
    fga: sum('fga'),
    tp: sum('tpm'),
    tpa: sum('tpa'),
    ft: sum('ftm'),
    fta: sum('fta'),
    playoffs: false,
    awards: [],
  };
  void played;
}

function finalizeSeason(save: CareerSave): { save: CareerSave; log: GameLog } {
  if (save.phase === 'seasonReview') {
    return {
      save,
      log: {
        id: `season-wait-${save.id}-${save.season}`,
        saveId: save.id,
        season: save.season,
        phase: save.phase,
        gameNumber: save.nextGame,
        opponent: 'Season Review',
        opponentId: 'season-review',
        home: true,
        result: save.wins >= save.losses ? 'W' : 'L',
        teamScore: save.wins,
        opponentScore: save.losses,
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
        grade: '—',
        createdAt: new Date().toISOString(),
      },
    };
  }

  const { awards: newAwards, history: awardHistory } = grantSeasonAwards(save);
  const awards = [...save.awards, ...newAwards];
  const goals = save.goals.map((g) =>
    g.id === 'g2' && newAwards.some((a) => /Conference|All-American|Freshman/i.test(a.type))
      ? { ...g, completed: true }
      : g.id === 'g1' &&
          (save.role === 'Starter' ||
            save.role === 'Featured Starter' ||
            save.role === 'Primary Option' ||
            save.role === 'Program Star')
        ? { ...g, completed: true }
        : g,
  );
  let withAwards: CareerSave = pushSeasonEvents(
    {
      ...save,
      awards,
      goals,
      history: [...save.history, ...awardHistory],
    },
    awardEvents(save, newAwards),
  );
  // Offseason development for user + teammates + full NBA pack (ratings jump here).
  withAwards = applyOffseasonDevelopment(withAwards);
  const stats = accumulateSeasonStats(withAwards, withAwards.seasonLogBuffer);
  stats.awards = newAwards.map((a) => a.type);
  const review = buildSeasonReview(withAwards, stats);
  review.roleChange = `${withAwards.roleAtSeasonStart} → ${withAwards.role}`;
  review.awards = newAwards.map((a) => a.type);
  const marker: GameLog = {
    id: `season-end-${save.id}-${save.season}`,
    saveId: save.id,
    season: save.season,
    phase: save.phase,
    gameNumber: save.nextGame,
    opponent: 'Season Complete',
    opponentId: 'season-end',
    home: true,
    result: save.wins >= save.losses ? 'W' : 'L',
    teamScore: save.wins,
    opponentScore: save.losses,
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
    grade: '—',
    createdAt: new Date().toISOString(),
  };

  return {
    log: marker,
    save: {
      ...withAwards,
      phase: 'seasonReview',
      seasonStats: [...withAwards.seasonStats, stats],
      careerStats: [...withAwards.careerStats, stats],
      seasonReviews: [...withAwards.seasonReviews, review],
      pendingDecisions: [],
      history: [
        ...withAwards.history,
        `Season ${withAwards.season} complete: ${withAwards.wins}-${withAwards.losses}`,
      ],
      updatedAt: marker.createdAt,
    },
  };
}

export function buildSeasonReview(save: CareerSave, stats?: SeasonStats): SeasonReview {
  const s = stats ?? accumulateSeasonStats(save, save.seasonLogBuffer);
  const team =
    save.proTeamId && getProTeam(save.proTeamId)
      ? `${getProTeam(save.proTeamId)!.region} ${getProTeam(save.proTeamId)!.name}`
      : getCollege(save.collegeId ?? '')?.name ?? 'Team';
  const ovr = overall(save.player);
  const pot = scoutedPotential(save.player, save.hidden);
  const ovrDelta = ovr - save.ovrAtSeasonStart;
  const potDelta = pot - save.potAtSeasonStart;
  const gp = Math.max(1, s.gp);
  return {
    season: save.season,
    phase: save.phase === 'professional' ? 'professional' : 'college',
    teamName: team,
    record: `${save.wins}-${save.losses}`,
    statsLine: `${(s.pts / gp).toFixed(1)} / ${(s.reb / gp).toFixed(1)} / ${(s.ast / gp).toFixed(1)} on ${s.gp} GP · ${save.role}`,
    awards: save.awards.filter((a) => a.season === save.season).map((a) => a.type),
    ratingChange: `OVR ${ovr} (${formatDelta(ovrDelta) || '0'}) · POT ${pot} (${formatDelta(potDelta) || '0'})`,
    roleChange: save.role,
    narrative: `A ${save.wins}-${save.losses} campaign with ${save.player.name} as a ${save.role.toLowerCase()} for ${team}.`,
    ovr,
    ovrDelta,
    pot,
    potDelta,
    gp: s.gp,
    ppg: s.pts / gp,
    rpg: s.reb / gp,
    apg: s.ast / gp,
    acknowledged: false,
  };
}

/** Acknowledge season review, then queue declare/return or offseason. */
export function acknowledgeSeasonReview(save: CareerSave): CareerSave {
  if (save.phase !== 'seasonReview') return save;
  const reviews = save.seasonReviews.map((r, i) =>
    i === save.seasonReviews.length - 1 ? { ...r, acknowledged: true } : r,
  );
  const decisions: PendingDecision[] = [];
  const wasCollege = !save.proTeamId;

  if (wasCollege) {
    decisions.push({
      id: crypto.randomUUID(),
      type: 'declare',
      title: 'Draft decision',
      body: `Season ${save.season} is in the books (${save.wins}-${save.losses}). Declare for the draft or return to school?`,
      choices: [
        { id: 'declare', label: 'Declare for the draft', effect: 'Enter draft night' },
        { id: 'return', label: 'Return to school', effect: 'Another college season' },
      ],
      interrupt: true,
    });
    return {
      ...save,
      phase: 'college',
      seasonReviews: reviews,
      pendingDecisions: decisions,
      updatedAt: new Date().toISOString(),
    };
  }

  if (save.age >= 34 || overall(save.player) < 62) {
    decisions.push({
      id: crypto.randomUUID(),
      type: 'retire',
      title: 'Retirement decision',
      body: 'The league pace is catching up. Retire or play one more year?',
      choices: [
        { id: 'retire', label: 'Retire', effect: 'Legacy review' },
        { id: 'continue', label: 'Play another season', effect: 'Continue career' },
      ],
      interrupt: true,
    });
  } else {
    decisions.push({
      id: crypto.randomUUID(),
      type: 'offseason',
      title: 'Offseason',
      body: 'Season complete. Continue to next pro season?',
      choices: [{ id: 'continue', label: 'Continue', effect: 'Next season' }],
      interrupt: true,
    });
  }

  return {
    ...save,
    phase: 'professional',
    seasonReviews: reviews,
    pendingDecisions: decisions,
    updatedAt: new Date().toISOString(),
  };
}

export function resolveDecision(
  save: CareerSave,
  decisionId: string,
  choiceId: string,
): CareerSave {
  const decision = save.pendingDecisions.find((d) => d.id === decisionId);
  if (!decision) return save;
  const remaining = save.pendingDecisions.filter((d) => d.id !== decisionId);
  let next: CareerSave = {
    ...save,
    pendingDecisions: remaining,
    history: [...save.history, `Decision: ${decision.title} → ${choiceId}`],
    updatedAt: new Date().toISOString(),
  };

  if (decision.type === 'injury') {
    if (choiceId === 'rest') {
      next = {
        ...next,
        injury: { ...next.injury, gamesRemaining: next.injury.gamesRemaining + 2 },
        fatigue: Math.max(0, next.fatigue - 15),
      };
    } else {
      next = { ...next, injury: { type: 'Healthy', gamesRemaining: 0 }, fatigue: Math.min(100, next.fatigue + 10) };
    }
  }

  if (decision.type === 'role') {
    if (choiceId === 'request') {
      next = {
        ...next,
        minutes: Math.min(34, next.minutes + 4),
        coachTrust: Math.max(20, next.coachTrust - 5),
        morale: { ...next.morale, roleSatisfaction: Math.min(99, next.morale.roleSatisfaction + 8) },
      };
    } else {
      next = { ...next, coachTrust: Math.min(99, next.coachTrust + 4) };
    }
  }

  if (decision.type === 'declare') {
    if (choiceId === 'declare') {
      next = beginDraft({
        ...next,
        draftYear: next.draftYear || draftYearForCollegeSeason(next.season),
      });
    } else {
      next = startNextCollegeSeason(next);
    }
  }

  if (decision.type === 'offseason' && choiceId === 'continue') {
    next = startNextProSeason(next);
  }

  if (decision.type === 'retire') {
    if (choiceId === 'retire') next = retirePlayer(next);
    else next = startNextProSeason(next);
  }

  return next;
}

export function retirePlayer(save: CareerSave): CareerSave {
  const legacy =
    overall(save.player) * 0.4 +
    save.awards.length * 4 +
    save.wins * 0.15 +
    (save.draft?.round === 1 ? 10 : 0) +
    save.seasonReviews.length * 2;
  return {
    ...save,
    phase: 'retired',
    retired: true,
    legacyScore: Math.round(legacy),
    legacySummary: `${save.player.name} retires after ${save.seasonReviews.length} seasons. Legacy score ${Math.round(legacy)}.`,
    history: [...save.history, 'Retired from professional basketball'],
    pendingDecisions: [],
    updatedAt: new Date().toISOString(),
  };
}
