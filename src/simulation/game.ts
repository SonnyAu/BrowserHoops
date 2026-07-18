import { getCollege } from '../data/colleges';
import { getProTeam } from '../data/nbaTeams';
import { draftYearForCollegeSeason } from '../domain/createCareer';
import { formatDelta, overall, scoutedPotential } from '../domain/derived';
import {
  CareerSave,
  GameLog,
  LeagueGameRecord,
  PendingDecision,
  SeasonReview,
  SeasonStats,
} from '../domain/models';
import { grantSeasonAwards } from './awards';
import { applyOffseasonDevelopment, ensureLeagueRoster } from './development';
import { beginDraft } from './draft';
import { awardEvents, pushSeasonEvents } from './events';
import { ensureNationalStandings, simulateLeagueDay } from './leagueSeason';
import { startCollegeTournament, isMadnessComplete } from './marchMadness';
import { startNbaPostseason, isNbaPlayoffsComplete } from './nbaPlayoffs';
import {
  applyCompletedUserPostseasonGame,
  enqueueUserPostseasonGame,
  simulatePostseasonStep,
} from './postseason';
import { initialCollegeStandings, initialProStandings } from './schedule';
import { startNextCollegeSeason, startNextProSeason } from './season';
import { simulateUserScheduledGame } from './userGameSim';

export type SimStepResult = {
  save: CareerSave;
  log: GameLog;
  leagueGames: LeagueGameRecord[];
};

function normalizeSeasonState(save: CareerSave): CareerSave {
  let next = save.seasonEvents ? save : { ...save, seasonEvents: [] };
  if (next.seasonXp == null) next = { ...next, seasonXp: 0 };
  if (!next.developmentLog) next = { ...next, developmentLog: [] };
  if (!next.seasonStage) next = { ...next, seasonStage: 'regular' };
  if (next.bracket === undefined) next = { ...next, bracket: null };
  if (next.settings.boxScoreRetentionYears == null) {
    next = {
      ...next,
      settings: { ...next.settings, boxScoreRetentionYears: 3 },
    };
  }
  next = ensureLeagueRoster(next);
  const rows = next.standings ?? [];
  const needNational =
    !rows.length ||
    rows.some((r) => !r.conference) ||
    (next.phase === 'college' && rows.length < 50) ||
    ((next.phase === 'professional' || !!next.proTeamId) && rows.length < 30);
  if (needNational) {
    if (next.proTeamId || next.phase === 'professional') {
      next = { ...next, standings: ensureNationalStandings({ ...next, standings: rows.length ? rows : initialProStandings() }) };
    } else if (next.collegeId) {
      next = {
        ...next,
        standings: ensureNationalStandings({
          ...next,
          standings: rows.length ? rows : initialCollegeStandings(),
        }),
      };
    }
  }
  // Repair saves hurt by the old selfId bug: mid-regular-season, the user's
  // team row must carry the user's real record, not an NPC-simmed one.
  if (
    next.phase === 'professional' &&
    next.proTeamId &&
    (next.seasonStage ?? 'regular') === 'regular'
  ) {
    const row = next.standings.find((r) => r.teamId === next.proTeamId);
    if (row && (row.wins !== next.wins || row.losses !== next.losses)) {
      next = {
        ...next,
        standings: next.standings.map((r) =>
          r.teamId === next.proTeamId
            ? { ...r, wins: next.wins, losses: next.losses }
            : r,
        ),
      };
    }
  }
  return next;
}

function applyLeagueDay(
  save: CareerSave,
  day: number,
  excludeIds: string[],
  userGame: LeagueGameRecord,
): { save: CareerSave; leagueGames: LeagueGameRecord[] } {
  const { standings, games } = simulateLeagueDay({
    save,
    day,
    excludeIds,
    stage: 'regular',
  });
  return {
    save: { ...save, standings },
    leagueGames: [userGame, ...games],
  };
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

function isPostseasonStage(stage: string | undefined): boolean {
  return stage === 'playIn' || stage === 'playoffs' || stage === 'tournament';
}

function maybeFinalizePostseason(result: SimStepResult): SimStepResult {
  const { save } = result;
  const bracket = save.bracket;
  const done =
    save.seasonStage === 'complete' ||
    (bracket != null &&
      Boolean(bracket.championId) &&
      (bracket.kind === 'marchMadness'
        ? isMadnessComplete(bracket)
        : isNbaPlayoffsComplete(bracket)));
  if (done && save.phase !== 'seasonReview') {
    const finalized = finalizeSeason({ ...save, seasonStage: 'complete' });
    return {
      save: finalized.save,
      log: result.log.minutes > 0 ? result.log : finalized.log,
      leagueGames: result.leagueGames,
    };
  }
  return result;
}

export function simulateNextGame(save: CareerSave): SimStepResult {
  if (save.retired) throw new Error('Career is retired');
  if (save.phase === 'seasonReview' || save.phase === 'draft') {
    throw new Error('Cannot simulate during season review or draft');
  }
  const normalized = normalizeSeasonState(save);
  const upcoming = normalized.schedule.find((g) => !g.completed);
  if (!upcoming) {
    return advancePastRegularSeason(normalized);
  }

  let next = ensureLeagueRoster(normalized);

  if (isPostseasonStage(upcoming.stage)) {
    const stage = upcoming.stage!;
    const played = simulateUserScheduledGame(next, upcoming, {
      playoffs: true,
      homeBoost: stage === 'tournament' ? 0 : upcoming.home ? 3 : 0,
      updateStandings: false,
      skipSeasonEvents: true,
      stage,
      playoffMeta: {
        round: upcoming.round,
        seriesId: upcoming.seriesId,
        gameInSeries: upcoming.gameInSeries,
      },
    });
    const applied = applyCompletedUserPostseasonGame(
      played.save,
      upcoming.id,
      played.leagueGame,
      played.won,
    );
    return maybeFinalizePostseason({
      save: applied.save,
      log: played.log,
      leagueGames: [played.leagueGame, ...applied.leagueGames],
    });
  }

  const played = simulateUserScheduledGame(next, upcoming, {
    playoffs: false,
    updateStandings: true,
    skipSeasonEvents: false,
    stage: 'regular',
  });
  const dayResult = applyLeagueDay(
    played.save,
    upcoming.gameNumber,
    [played.selfId, upcoming.opponentId],
    played.leagueGame,
  );
  return {
    save: dayResult.save,
    log: played.log,
    leagueGames: dayResult.leagueGames,
  };
}

function advancePastRegularSeason(save: CareerSave): SimStepResult {
  const stage = save.seasonStage ?? 'regular';
  if (stage === 'regular') {
    const started =
      save.phase === 'professional' || save.proTeamId
        ? startNbaPostseason(save)
        : startCollegeTournament(save);
    const withQueue = enqueueUserPostseasonGame(started);
    // Hand off so Home can show the next PO game; play it on the next sim tick.
    if (withQueue.schedule.some((g) => !g.completed && isPostseasonStage(g.stage))) {
      return {
        save: withQueue,
        log: {
          id: `post-start-${withQueue.id}-${withQueue.season}`,
          saveId: withQueue.id,
          season: withQueue.season,
          phase: withQueue.phase,
          gameNumber: withQueue.nextGame,
          opponent: 'Postseason',
          opponentId: 'postseason',
          home: true,
          result: 'W',
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
          grade: '—',
          createdAt: new Date().toISOString(),
          playoffs: true,
        },
        leagueGames: [],
      };
    }
    return maybeFinalizePostseason(simulatePostseasonStep(withQueue));
  }
  const bracket = save.bracket;
  const done =
    !bracket ||
    stage === 'complete' ||
    (Boolean(bracket.championId) &&
      (bracket.kind === 'marchMadness'
        ? isMadnessComplete(bracket)
        : isNbaPlayoffsComplete(bracket)));
  if (done) {
    return finalizeSeason({ ...save, seasonStage: 'complete' });
  }
  const queued = enqueueUserPostseasonGame(save);
  if (queued.schedule.some((g) => !g.completed && isPostseasonStage(g.stage))) {
    return simulateNextGame(queued);
  }
  return maybeFinalizePostseason(simulatePostseasonStep(queued));
}

export function simulateCollegeGame(save: CareerSave) {
  return simulateNextGame(save);
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
    teamId: save.proTeamId ?? save.collegeId ?? 'unknown',
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
    playoffs: real.some((l) => l.playoffs),
    awards: [],
  };
  void played;
}

function finalizeSeason(save: CareerSave): SimStepResult {
  if (save.phase === 'seasonReview') {
    return {
      save,
      leagueGames: [],
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
    leagueGames: [],
    save: {
      ...withAwards,
      phase: 'seasonReview',
      seasonStage: 'complete',
      seasonStats: [...withAwards.seasonStats, stats],
      careerStats: [...withAwards.careerStats, stats],
      seasonReviews: [...withAwards.seasonReviews, review],
      pendingDecisions: [],
      history: [
        ...withAwards.history,
        `Season ${withAwards.season} complete: ${withAwards.wins}-${withAwards.losses}` +
          (withAwards.bracket?.championName
            ? ` · Champ: ${withAwards.bracket.championName}`
            : ''),
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
