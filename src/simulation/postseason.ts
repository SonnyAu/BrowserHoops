import { getCollege } from '../data/colleges';
import { getProTeam } from '../data/nbaTeams';
import { overall } from '../domain/derived';
import {
  BracketMatchup,
  CareerSave,
  GameLog,
  LeagueGameRecord,
  NbaSeriesState,
  ScheduledGame,
} from '../domain/models';
import { Rng } from '../domain/rng';
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
  playInStillActive,
  resolvePlayInIntoSeries,
} from './nbaPlayoffs';

function userTeamId(save: CareerSave): string | null {
  return save.phase === 'professional' ? save.proTeamId : save.collegeId;
}

function userBoxFromGame(
  save: CareerSave,
  game: LeagueGameRecord,
  home: boolean,
  won: boolean,
  playoffs: boolean,
  gameNumber: number,
  opponentName: string,
  opponentId: string,
): GameLog {
  const rng = new Rng(`${save.settings.seed}:userBox:${game.id}`);
  const ovr = overall(save.player);
  const minutes = Math.max(18, Math.min(40, 28 + rng.int(-4, 6)));
  const points = Math.max(4, Math.round(ovr / 4.2 + rng.int(-4, 12)));
  const rebounds = Math.max(1, Math.round(ovr / 18 + rng.int(0, 6)));
  const assists = Math.max(0, Math.round(ovr / 22 + rng.int(0, 5)));
  const fga = Math.max(6, Math.round(points * 0.9 + 3));
  const fgm = Math.min(fga, Math.round(points * 0.42));
  return {
    id: `game-${save.id}-${gameNumber}`,
    saveId: save.id,
    season: save.season,
    phase: save.phase,
    gameNumber,
    opponent: opponentName,
    opponentId,
    home,
    result: won ? 'W' : 'L',
    teamScore: home ? game.homeScore : game.awayScore,
    opponentScore: home ? game.awayScore : game.homeScore,
    points,
    rebounds,
    assists,
    steals: rng.int(0, 3),
    blocks: rng.int(0, 2),
    turnovers: rng.int(0, 4),
    fouls: rng.int(1, 4),
    minutes,
    plusMinus: won ? rng.int(1, 18) : rng.int(-18, -1),
    fgm,
    fga,
    tpm: rng.int(0, 5),
    tpa: rng.int(2, 10),
    ftm: Math.max(0, Math.round(points * 0.2)),
    fta: Math.max(0, Math.round(points * 0.25)),
    grade: points >= 25 ? 'A' : points >= 15 ? 'B' : 'C',
    createdAt: new Date().toISOString(),
    playoffs,
    leagueGameId: game.id,
  };
}

function completeMatchup(
  save: CareerSave,
  m: BracketMatchup,
  day: number,
  stage: CareerSave['seasonStage'],
): {
  matchup: BracketMatchup;
  game: LeagueGameRecord;
  userLog?: GameLog;
  scheduleGame?: ScheduledGame;
  won?: boolean;
} {
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
  );
  const winnerId = homeWon ? homeId : awayId;
  const matchup: BracketMatchup = {
    ...m,
    completed: true,
    winnerId,
    homeScore,
    awayScore,
    leagueGameId: game.id,
  };
  const uid = userTeamId(save);
  let userLog: GameLog | undefined;
  let scheduleGame: ScheduledGame | undefined;
  let won: boolean | undefined;
  if (uid && (uid === homeId || uid === awayId)) {
    const home = uid === homeId;
    won = home ? homeWon : !homeWon;
    const oppId = home ? awayId : homeId;
    const oppName = home ? game.awayTeamName : game.homeTeamName;
    const gameNumber = save.nextGame;
    userLog = userBoxFromGame(save, game, home, won, true, gameNumber, oppName, oppId);
    // Attach user line into league game players
    game.players = [
      ...game.players,
      {
        playerId: 'user',
        playerName: save.player.name,
        teamId: uid,
        minutes: userLog.minutes,
        points: userLog.points,
        rebounds: userLog.rebounds,
        assists: userLog.assists,
        steals: userLog.steals,
        blocks: userLog.blocks,
        turnovers: userLog.turnovers,
        fgm: userLog.fgm,
        fga: userLog.fga,
        tpm: userLog.tpm,
        tpa: userLog.tpa,
        ftm: userLog.ftm,
        fta: userLog.fta,
        isUser: true,
      },
    ];
    scheduleGame = {
      id: `post-${m.id}`,
      gameNumber,
      opponentId: oppId,
      opponentName: oppName,
      home,
      completed: true,
      result: won ? 'W' : 'L',
      teamScore: userLog.teamScore,
      opponentScore: userLog.opponentScore,
      stage,
      round: m.round,
      leagueGameId: game.id,
    };
  }
  return { matchup, game, userLog, scheduleGame, won };
}

function applySeriesGame(
  save: CareerSave,
  series: NbaSeriesState,
  day: number,
): {
  series: NbaSeriesState;
  game: LeagueGameRecord;
  userLog?: GameLog;
  scheduleGame?: ScheduledGame;
  won?: boolean;
} {
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
  let winsA = series.winsA + (winnerId === series.teamAId ? 1 : 0);
  let winsB = series.winsB + (winnerId === series.teamBId ? 1 : 0);
  const completed = winsA >= 4 || winsB >= 4;
  const nextSeries: NbaSeriesState = {
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
  };

  const uid = userTeamId(save);
  let userLog: GameLog | undefined;
  let scheduleGame: ScheduledGame | undefined;
  let won: boolean | undefined;
  if (uid && (uid === series.teamAId || uid === series.teamBId)) {
    const home = uid === homeTeamId;
    won = home ? homeWon : !homeWon;
    const oppId = home ? awayTeamId : homeTeamId;
    const oppName =
      oppId === series.teamAId ? series.teamAName : series.teamBName;
    const gameNumber = save.nextGame;
    userLog = userBoxFromGame(save, game, home, won, true, gameNumber, oppName, oppId);
    game.players = [
      ...game.players,
      {
        playerId: 'user',
        playerName: save.player.name,
        teamId: uid,
        minutes: userLog.minutes,
        points: userLog.points,
        rebounds: userLog.rebounds,
        assists: userLog.assists,
        steals: userLog.steals,
        blocks: userLog.blocks,
        turnovers: userLog.turnovers,
        fgm: userLog.fgm,
        fga: userLog.fga,
        tpm: userLog.tpm,
        tpa: userLog.tpa,
        ftm: userLog.ftm,
        fta: userLog.fta,
        isUser: true,
      },
    ];
    scheduleGame = {
      id: `post-${series.id}-g${gameInSeries}`,
      gameNumber,
      opponentId: oppId,
      opponentName: oppName,
      home,
      completed: true,
      result: won ? 'W' : 'L',
      teamScore: userLog.teamScore,
      opponentScore: userLog.opponentScore,
      stage: 'playoffs',
      seriesId: series.id,
      round: series.round,
      gameInSeries,
      leagueGameId: game.id,
    };
  }
  return { series: nextSeries, game, userLog, scheduleGame, won };
}

function withUserResult(
  save: CareerSave,
  log: GameLog | undefined,
  scheduleGame: ScheduledGame | undefined,
  won: boolean | undefined,
): CareerSave {
  if (!log || !scheduleGame) {
    return { ...save, updatedAt: new Date().toISOString() };
  }
  return {
    ...save,
    nextGame: save.nextGame + 1,
    wins: save.wins + (won ? 1 : 0),
    losses: save.losses + (won ? 0 : 1),
    schedule: [...save.schedule, scheduleGame],
    seasonLogBuffer: [...save.seasonLogBuffer, log],
    gameLogsSummary: [
      `S${save.season} G${log.gameNumber} [PO]: ${log.result} ${log.teamScore}-${log.opponentScore} vs ${log.opponent} — ${log.points}/${log.rebounds}/${log.assists}`,
      ...save.gameLogsSummary,
    ].slice(0, 200),
    history: [
      ...save.history,
      `Playoffs G${log.gameNumber}: ${log.result} vs ${log.opponent}, ${log.points} pts`,
    ],
    updatedAt: log.createdAt,
  };
}

/** Advance one postseason tick (Madness round batch or one NBA series game day). */
export function simulatePostseasonStep(save: CareerSave): {
  save: CareerSave;
  log: GameLog;
  leagueGames: LeagueGameRecord[];
} {
  if (!save.bracket) {
    throw new Error('No bracket active');
  }
  const day = 1000 + save.nextGame;
  const leagueGames: LeagueGameRecord[] = [];
  let next = { ...save };
  let userLog: GameLog | undefined;

  if (save.bracket.kind === 'marchMadness') {
    let bracket = save.bracket;
    const round = nextMadnessRound(bracket);
    if (!round) {
      bracket = { ...bracket, status: 'complete' };
      next = { ...next, bracket, seasonStage: 'complete' };
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

      // Prefer playing user's game alone first if present
      const uid = userTeamId(save);
      const userM = uid ? pendingUserMadnessGame(bracket, uid) : null;
      const batch = userM ? [userM] : toPlay;

      let firstFour = bracket.firstFour ?? [];
      let rounds = bracket.rounds ?? [];

      for (const m of batch) {
        const result = completeMatchup(next, m, day + leagueGames.length, 'tournament');
        leagueGames.push(result.game);
        if (round === 'First Four') {
          firstFour = firstFour.map((x) => (x.id === m.id ? result.matchup : x));
        } else {
          rounds = rounds.map((x) => (x.id === m.id ? result.matchup : x));
        }
        if (result.userLog) {
          userLog = result.userLog;
          next = withUserResult(next, result.userLog, result.scheduleGame, result.won);
        }
      }

      bracket = { ...bracket, firstFour, rounds };
      bracket = advanceMadnessWinners(bracket, round);

      // If we only played user game, also play rest of round (non-user) in same step when no user log pending
      if (userM && batch.length === 1) {
        const rest = toPlay.filter((m) => m.id !== userM.id);
        for (const m of rest) {
          const result = completeMatchup(next, m, day + leagueGames.length, 'tournament');
          leagueGames.push(result.game);
          if (round === 'First Four') {
            firstFour = firstFour.map((x) => (x.id === m.id ? result.matchup : x));
          } else {
            rounds = rounds.map((x) => (x.id === m.id ? result.matchup : x));
          }
        }
        bracket = { ...bracket, firstFour, rounds };
        bracket = advanceMadnessWinners(bracket, round);
      }

      next = {
        ...next,
        bracket,
        seasonStage: isMadnessComplete(bracket) ? 'complete' : 'tournament',
      };
    }
  } else {
    // NBA
    let bracket = save.bracket;
    if (playInStillActive(bracket)) {
      const uid = userTeamId(save);
      const userPi = uid ? pendingUserPlayIn(bracket, uid) : null;
      let playIn = [...(bracket.playIn ?? [])];
      const playable = playIn.filter(
        (m) => !m.completed && m.slotA.teamId && m.slotB.teamId,
      );
      const batch = userPi ? [userPi] : playable.slice(0, 2);

      for (const m of batch) {
        const result = completeMatchup(next, m, day + leagueGames.length, 'playIn');
        leagueGames.push(result.game);
        playIn = playIn.map((x) => (x.id === m.id ? result.matchup : x));
        if (result.userLog) {
          userLog = result.userLog;
          next = withUserResult(next, result.userLog, result.scheduleGame, result.won);
        }
      }
      bracket = { ...bracket, playIn };
      bracket = resolvePlayInIntoSeries(bracket, next.standings);
      // Play remaining playable in same step if user was in batch
      if (userPi) {
        const more = (bracket.playIn ?? []).filter(
          (m) => !m.completed && m.slotA.teamId && m.slotB.teamId,
        );
        playIn = [...(bracket.playIn ?? [])];
        for (const m of more) {
          const result = completeMatchup(next, m, day + leagueGames.length, 'playIn');
          leagueGames.push(result.game);
          playIn = playIn.map((x) => (x.id === m.id ? result.matchup : x));
        }
        bracket = { ...bracket, playIn };
        bracket = resolvePlayInIntoSeries(bracket, next.standings);
      }
      next = {
        ...next,
        bracket,
        seasonStage: playInStillActive(bracket) ? 'playIn' : 'playoffs',
      };
    } else {
      const open = activeSeries(bracket);
      const uid = userTeamId(save);
      const userSeries = open.find((s) => s.teamAId === uid || s.teamBId === uid);
      const toPlay = userSeries ? [userSeries] : open;

      let series = [...(bracket.series ?? [])];
      for (const s of toPlay) {
        const result = applySeriesGame(next, s, day + leagueGames.length);
        leagueGames.push(result.game);
        series = series.map((x) => (x.id === s.id ? result.series : x));
        if (result.userLog) {
          userLog = result.userLog;
          next = withUserResult(next, result.userLog, result.scheduleGame, result.won);
        }
      }
      // If user series only, also advance other series one game
      if (userSeries) {
        for (const s of open.filter((x) => x.id !== userSeries.id)) {
          const fresh = series.find((x) => x.id === s.id)!;
          if (fresh.completed) continue;
          const result = applySeriesGame(next, fresh, day + leagueGames.length);
          leagueGames.push(result.game);
          series = series.map((x) => (x.id === s.id ? result.series : x));
        }
      }
      bracket = advanceNbaBracket({ ...bracket, series });
      next = {
        ...next,
        bracket,
        seasonStage: isNbaPlayoffsComplete(bracket) ? 'complete' : 'playoffs',
      };
    }
  }

  const marker: GameLog =
    userLog ??
    ({
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
    } satisfies GameLog);

  // Champ history note
  if (next.bracket?.status === 'complete' && next.bracket.championName) {
    const label =
      next.bracket.kind === 'marchMadness' ? 'NCAA Champion' : 'NBA Champion';
    next = {
      ...next,
      history: [
        ...next.history,
        `${label}: ${next.bracket.championName}`,
      ],
    };
  }

  void getCollege;
  void getProTeam;

  return { save: next, log: marker, leagueGames };
}
