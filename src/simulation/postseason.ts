import {
  BracketMatchup,
  CareerSave,
  GameLog,
  LeagueGameRecord,
  NbaSeriesState,
  ScheduledGame,
} from '../domain/models';
import { simulateNeutralGame } from './leagueSeason';
import {
  advanceMadnessWinners,
  isMadnessComplete,
  nextMadnessRound,
  pendingUserMadnessGame,
} from './marchMadness';
import {
  activeSeries,
  advanceNbaBracket,
  homeTeamForSeriesGame,
  isNbaPlayoffsComplete,
  pendingUserPlayIn,
  pendingUserSeriesGame,
  playInStillActive,
  resolvePlayInIntoSeries,
} from './nbaPlayoffs';

function userTeamId(save: CareerSave): string | null {
  return save.phase === 'professional' ? save.proTeamId : save.collegeId;
}

function nextDay(save: CareerSave, offset = 0): number {
  return save.nextGame + offset;
}

function hasPendingUserSchedule(save: CareerSave): boolean {
  return save.schedule.some(
    (g) =>
      !g.completed &&
      g.stage != null &&
      g.stage !== 'regular' &&
      g.stage !== 'complete',
  );
}

/** Queue the user's next postseason game as an incomplete schedule row. */
export function enqueueUserPostseasonGame(save: CareerSave): CareerSave {
  if (!save.bracket || hasPendingUserSchedule(save)) return save;
  const uid = userTeamId(save);
  if (!uid) return save;

  if (save.bracket.kind === 'marchMadness') {
    const m = pendingUserMadnessGame(save.bracket, uid);
    if (!m?.slotA.teamId || !m.slotB.teamId) return save;
    const home = m.slotA.teamId === uid;
    const opp = home ? m.slotB : m.slotA;
    const row: ScheduledGame = {
      id: `post-${m.id}`,
      gameNumber: save.nextGame,
      opponentId: opp.teamId!,
      opponentName: opp.teamName,
      home,
      completed: false,
      stage: 'tournament',
      round: m.round,
    };
    return { ...save, schedule: [...save.schedule, row] };
  }

  const playIn = pendingUserPlayIn(save.bracket, uid);
  if (playIn?.slotA.teamId && playIn.slotB.teamId) {
    const home = playIn.slotA.teamId === uid;
    const opp = home ? playIn.slotB : playIn.slotA;
    const row: ScheduledGame = {
      id: `post-${playIn.id}`,
      gameNumber: save.nextGame,
      opponentId: opp.teamId!,
      opponentName: opp.teamName,
      home,
      completed: false,
      stage: 'playIn',
      round: playIn.round,
    };
    return { ...save, schedule: [...save.schedule, row] };
  }

  const pending = pendingUserSeriesGame(save.bracket, uid);
  if (!pending) return save;
  const { series, gameInSeries, homeTeamId } = pending;
  const home = homeTeamId === uid;
  const oppId = home
    ? homeTeamId === series.teamAId
      ? series.teamBId
      : series.teamAId
    : homeTeamId;
  const oppName = oppId === series.teamAId ? series.teamAName : series.teamBName;
  const row: ScheduledGame = {
    id: `post-${series.id}-g${gameInSeries}`,
    gameNumber: save.nextGame,
    opponentId: oppId,
    opponentName: oppName,
    home,
    completed: false,
    stage: 'playoffs',
    seriesId: series.id,
    round: series.round,
    gameInSeries,
  };
  return { ...save, schedule: [...save.schedule, row] };
}

function completeNpcMatchup(
  save: CareerSave,
  m: BracketMatchup,
  day: number,
  stage: CareerSave['seasonStage'],
): { matchup: BracketMatchup; game: LeagueGameRecord } {
  const homeId = m.slotA.teamId!;
  const awayId = m.slotB.teamId!;
  const { game, homeWon, homeScore, awayScore } = simulateNeutralGame(
    save,
    homeId,
    awayId,
    day,
    stage,
    {
      region: m.region,
      round: m.round,
      homeSeed: m.slotA.seed ?? undefined,
      awaySeed: m.slotB.seed ?? undefined,
    },
    { neutral: stage === 'tournament' },
  );
  return {
    matchup: {
      ...m,
      completed: true,
      winnerId: homeWon ? homeId : awayId,
      homeScore,
      awayScore,
      leagueGameId: game.id,
    },
    game,
  };
}

function applyNpcSeriesGame(
  save: CareerSave,
  series: NbaSeriesState,
  day: number,
): { series: NbaSeriesState; game: LeagueGameRecord } {
  const gameInSeries = series.games.length + 1;
  const homeTeamId = homeTeamForSeriesGame(series, gameInSeries);
  const awayTeamId = homeTeamId === series.teamAId ? series.teamBId : series.teamAId;
  const { game, homeWon, homeScore, awayScore } = simulateNeutralGame(
    save,
    homeTeamId,
    awayTeamId,
    day,
    'playoffs',
    {
      round: series.round,
      seriesId: series.id,
      gameInSeries,
      homeSeed: homeTeamId === series.teamAId ? series.teamASeed : series.teamBSeed,
      awaySeed: awayTeamId === series.teamAId ? series.teamASeed : series.teamBSeed,
    },
  );
  const winnerId = homeWon ? homeTeamId : awayTeamId;
  const winsA = series.winsA + (winnerId === series.teamAId ? 1 : 0);
  const winsB = series.winsB + (winnerId === series.teamBId ? 1 : 0);
  const completed = winsA >= 4 || winsB >= 4;
  return {
    series: {
      ...series,
      winsA,
      winsB,
      completed,
      winnerId: completed ? (winsA >= 4 ? series.teamAId : series.teamBId) : undefined,
      games: [
        ...series.games,
        {
          gameInSeries,
          homeTeamId,
          winnerId,
          homeScore,
          awayScore,
          leagueGameId: game.id,
        },
      ],
    },
    game,
  };
}

function matchupFromUserGame(
  m: BracketMatchup,
  leagueGame: LeagueGameRecord,
  uid: string,
  won: boolean,
): BracketMatchup {
  const userIsHome = leagueGame.homeTeamId === uid;
  const winnerId = won ? uid : userIsHome ? leagueGame.awayTeamId : leagueGame.homeTeamId;
  return {
    ...m,
    completed: true,
    winnerId,
    homeScore: leagueGame.homeScore,
    awayScore: leagueGame.awayScore,
    leagueGameId: leagueGame.id,
  };
}

function seriesFromUserGame(
  series: NbaSeriesState,
  leagueGame: LeagueGameRecord,
  uid: string,
  won: boolean,
  gameInSeries: number,
): NbaSeriesState {
  const homeTeamId = leagueGame.homeTeamId;
  const winnerId = won ? uid : uid === series.teamAId ? series.teamBId : series.teamAId;
  const winsA = series.winsA + (winnerId === series.teamAId ? 1 : 0);
  const winsB = series.winsB + (winnerId === series.teamBId ? 1 : 0);
  const completed = winsA >= 4 || winsB >= 4;
  return {
    ...series,
    winsA,
    winsB,
    completed,
    winnerId: completed ? (winsA >= 4 ? series.teamAId : series.teamBId) : undefined,
    games: [
      ...series.games,
      {
        gameInSeries,
        homeTeamId,
        winnerId,
        homeScore: leagueGame.homeScore,
        awayScore: leagueGame.awayScore,
        leagueGameId: leagueGame.id,
      },
    ],
  };
}

function noteChampion(save: CareerSave): CareerSave {
  if (!save.bracket?.championName || save.bracket.status !== 'complete') return save;
  const label = save.bracket.kind === 'marchMadness' ? 'NCAA Champion' : 'NBA Champion';
  const note = `${label}: ${save.bracket.championName}`;
  if (save.history.includes(note)) return save;
  return { ...save, history: [...save.history, note] };
}

/** After the user plays a queued PO game, update the bracket and sim the rest of that day. */
export function applyCompletedUserPostseasonGame(
  save: CareerSave,
  scheduleGameId: string,
  leagueGame: LeagueGameRecord,
  won: boolean,
): { save: CareerSave; leagueGames: LeagueGameRecord[] } {
  if (!save.bracket) throw new Error('No bracket active');
  const uid = userTeamId(save);
  if (!uid) return { save, leagueGames: [] };

  const scheduled = save.schedule.find((g) => g.id === scheduleGameId);
  const leagueGames: LeagueGameRecord[] = [];
  let next = { ...save };
  let bracket = save.bracket;

  if (bracket.kind === 'marchMadness') {
    const matchupId = scheduleGameId.replace(/^post-/, '');
    const round = scheduled?.round ?? nextMadnessRound(bracket);
    let firstFour = [...(bracket.firstFour ?? [])];
    let rounds = [...(bracket.rounds ?? [])];
    const inFf = firstFour.some((m) => m.id === matchupId);
    const pool = inFf ? firstFour : rounds;
    const m = pool.find((x) => x.id === matchupId);
    if (m && !m.completed) {
      const updated = matchupFromUserGame(m, leagueGame, uid, won);
      if (inFf) firstFour = firstFour.map((x) => (x.id === matchupId ? updated : x));
      else rounds = rounds.map((x) => (x.id === matchupId ? updated : x));
    }
    bracket = { ...bracket, firstFour, rounds };
    const activeRound = round ?? nextMadnessRound(bracket);
    if (activeRound) {
      bracket = advanceMadnessWinners(bracket, activeRound);
      const restPool =
        activeRound === 'First Four'
          ? [...(bracket.firstFour ?? [])]
          : [...(bracket.rounds ?? [])];
      const rest = restPool.filter(
        (m) =>
          m.round === activeRound &&
          !m.completed &&
          m.slotA.teamId &&
          m.slotB.teamId &&
          !String(m.slotA.teamId).startsWith('ff-winner') &&
          !String(m.slotB.teamId).startsWith('ff-winner') &&
          m.id !== matchupId,
      );
      firstFour = [...(bracket.firstFour ?? [])];
      rounds = [...(bracket.rounds ?? [])];
      for (const rm of rest) {
        const result = completeNpcMatchup(
          next,
          rm,
          nextDay(next, leagueGames.length),
          'tournament',
        );
        leagueGames.push(result.game);
        if (activeRound === 'First Four') {
          firstFour = firstFour.map((x) => (x.id === rm.id ? result.matchup : x));
        } else {
          rounds = rounds.map((x) => (x.id === rm.id ? result.matchup : x));
        }
      }
      bracket = { ...bracket, firstFour, rounds };
      bracket = advanceMadnessWinners(bracket, activeRound);
    }
    const complete = isMadnessComplete(bracket) && Boolean(bracket.championId);
    next = {
      ...next,
      bracket: complete ? { ...bracket, status: 'complete' } : bracket,
      seasonStage: complete ? 'complete' : 'tournament',
    };
  } else if (playInStillActive(bracket) || scheduled?.stage === 'playIn') {
    const matchupId = scheduleGameId.replace(/^post-/, '');
    let playIn = [...(bracket.playIn ?? [])];
    const m = playIn.find((x) => x.id === matchupId);
    if (m && !m.completed) {
      playIn = playIn.map((x) =>
        x.id === matchupId ? matchupFromUserGame(m, leagueGame, uid, won) : x,
      );
    }
    bracket = { ...bracket, playIn };
    bracket = resolvePlayInIntoSeries(bracket, next.standings);
    const more = (bracket.playIn ?? []).filter(
      (m) => !m.completed && m.slotA.teamId && m.slotB.teamId,
    );
    playIn = [...(bracket.playIn ?? [])];
    for (const rm of more) {
      const result = completeNpcMatchup(next, rm, nextDay(next, leagueGames.length), 'playIn');
      leagueGames.push(result.game);
      playIn = playIn.map((x) => (x.id === rm.id ? result.matchup : x));
    }
    bracket = { ...bracket, playIn };
    bracket = resolvePlayInIntoSeries(bracket, next.standings);
    next = {
      ...next,
      bracket,
      seasonStage: playInStillActive(bracket) ? 'playIn' : 'playoffs',
    };
  } else {
    const seriesId = scheduled?.seriesId ?? scheduleGameId.match(/^post-(.+)-g\d+$/)?.[1];
    let series = [...(bracket.series ?? [])];
    const s = series.find((x) => x.id === seriesId);
    if (s && !s.completed) {
      const gameInSeries = scheduled?.gameInSeries ?? s.games.length + 1;
      series = series.map((x) =>
        x.id === seriesId
          ? seriesFromUserGame(s, leagueGame, uid, won, gameInSeries)
          : x,
      );
    }
    const open = activeSeries({ ...bracket, series });
    for (const os of open.filter((x) => x.id !== seriesId)) {
      const fresh = series.find((x) => x.id === os.id)!;
      if (fresh.completed) continue;
      const result = applyNpcSeriesGame(next, fresh, nextDay(next, leagueGames.length));
      leagueGames.push(result.game);
      series = series.map((x) => (x.id === os.id ? result.series : x));
    }
    bracket = advanceNbaBracket({ ...bracket, series });
    const complete = isNbaPlayoffsComplete(bracket) && Boolean(bracket.championId);
    next = {
      ...next,
      bracket: complete ? { ...bracket, status: 'complete' } : bracket,
      seasonStage: complete ? 'complete' : 'playoffs',
    };
  }

  next = noteChampion(next);
  next = enqueueUserPostseasonGame(next);
  return { save: next, leagueGames };
}

function spectatorMarker(save: CareerSave, day: number): GameLog {
  return {
    id: `post-tick-${save.id}-${day}`,
    saveId: save.id,
    season: save.season,
    phase: save.phase,
    gameNumber: save.nextGame,
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
  };
}

/** Advance one postseason tick when the user has no pending PO game (spectating). */
export function simulatePostseasonStep(save: CareerSave): {
  save: CareerSave;
  log: GameLog;
  leagueGames: LeagueGameRecord[];
} {
  if (!save.bracket) {
    throw new Error('No bracket active');
  }

  // Prefer queued user games — caller should play those via simulateNextGame.
  const queued = enqueueUserPostseasonGame(save);
  if (hasPendingUserSchedule(queued) && queued !== save) {
    return {
      save: queued,
      log: spectatorMarker(queued, nextDay(queued)),
      leagueGames: [],
    };
  }
  if (hasPendingUserSchedule(save)) {
    return {
      save,
      log: spectatorMarker(save, nextDay(save)),
      leagueGames: [],
    };
  }

  const day = nextDay(save);
  const leagueGames: LeagueGameRecord[] = [];
  let next = { ...save };

  if (save.bracket.kind === 'marchMadness') {
    let bracket = save.bracket;
    const round = nextMadnessRound(bracket);
    if (!round) {
      if (bracket.championId) {
        bracket = { ...bracket, status: 'complete' };
        next = { ...next, bracket, seasonStage: 'complete' };
      }
      // Stuck without champion — leave active; do not false-complete.
    } else {
      const pool =
        round === 'First Four'
          ? [...(bracket.firstFour ?? [])]
          : [...(bracket.rounds ?? [])];
      const toPlay = pool.filter(
        (m) =>
          m.round === round &&
          !m.completed &&
          m.slotA.teamId &&
          m.slotB.teamId &&
          !String(m.slotA.teamId).startsWith('ff-winner') &&
          !String(m.slotB.teamId).startsWith('ff-winner'),
      );

      let firstFour = bracket.firstFour ?? [];
      let rounds = bracket.rounds ?? [];

      for (const m of toPlay) {
        const result = completeNpcMatchup(next, m, day + leagueGames.length, 'tournament');
        leagueGames.push(result.game);
        if (round === 'First Four') {
          firstFour = firstFour.map((x) => (x.id === m.id ? result.matchup : x));
        } else {
          rounds = rounds.map((x) => (x.id === m.id ? result.matchup : x));
        }
      }

      bracket = { ...bracket, firstFour, rounds };
      bracket = advanceMadnessWinners(bracket, round);
      const complete = isMadnessComplete(bracket) && Boolean(bracket.championId);
      next = {
        ...next,
        bracket: complete ? { ...bracket, status: 'complete' } : bracket,
        seasonStage: complete ? 'complete' : 'tournament',
      };
    }
  } else if (playInStillActive(save.bracket)) {
    let bracket = save.bracket;
    let playIn = [...(bracket.playIn ?? [])];
    const playable = playIn.filter(
      (m) => !m.completed && m.slotA.teamId && m.slotB.teamId,
    );
    for (const m of playable.slice(0, 2)) {
      const result = completeNpcMatchup(next, m, day + leagueGames.length, 'playIn');
      leagueGames.push(result.game);
      playIn = playIn.map((x) => (x.id === m.id ? result.matchup : x));
    }
    bracket = { ...bracket, playIn };
    bracket = resolvePlayInIntoSeries(bracket, next.standings);
    const more = (bracket.playIn ?? []).filter(
      (m) => !m.completed && m.slotA.teamId && m.slotB.teamId,
    );
    playIn = [...(bracket.playIn ?? [])];
    for (const m of more) {
      const result = completeNpcMatchup(next, m, day + leagueGames.length, 'playIn');
      leagueGames.push(result.game);
      playIn = playIn.map((x) => (x.id === m.id ? result.matchup : x));
    }
    bracket = { ...bracket, playIn };
    bracket = resolvePlayInIntoSeries(bracket, next.standings);
    next = {
      ...next,
      bracket,
      seasonStage: playInStillActive(bracket) ? 'playIn' : 'playoffs',
    };
  } else {
    let bracket = save.bracket;
    const open = activeSeries(bracket);
    let series = [...(bracket.series ?? [])];
    for (const s of open) {
      const fresh = series.find((x) => x.id === s.id)!;
      if (fresh.completed || fresh.teamAId.startsWith('tbd-') || fresh.teamBId.startsWith('tbd-')) {
        continue;
      }
      const result = applyNpcSeriesGame(next, fresh, day + leagueGames.length);
      leagueGames.push(result.game);
      series = series.map((x) => (x.id === s.id ? result.series : x));
    }
    bracket = advanceNbaBracket({ ...bracket, series });
    const complete = isNbaPlayoffsComplete(bracket) && Boolean(bracket.championId);
    next = {
      ...next,
      bracket: complete ? { ...bracket, status: 'complete' } : bracket,
      seasonStage: complete ? 'complete' : 'playoffs',
    };
  }

  next = noteChampion(next);
  next = enqueueUserPostseasonGame(next);
  return { save: next, log: spectatorMarker(next, day), leagueGames };
}
