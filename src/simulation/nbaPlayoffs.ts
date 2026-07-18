import { getProTeam } from '../data/nbaTeams';
import {
  BracketMatchup,
  BracketState,
  CareerSave,
  NbaSeriesState,
  StandingRow,
} from '../domain/models';

function winPct(r: StandingRow): number {
  const g = r.wins + r.losses;
  return g ? r.wins / g : 0;
}

function rankConference(standings: StandingRow[], conference: 'East' | 'West'): StandingRow[] {
  return standings
    .filter((r) => r.conference === conference)
    .sort((a, b) => {
      const d = winPct(b) - winPct(a);
      if (Math.abs(d) > 1e-9) return d;
      if (b.wins !== a.wins) return b.wins - a.wins;
      const ta = getProTeam(a.teamId);
      const tb = getProTeam(b.teamId);
      return (ta?.tid ?? 99) - (tb?.tid ?? 99);
    });
}

function makeSeries(
  id: string,
  round: string,
  conference: 'East' | 'West' | 'Finals',
  a: StandingRow,
  seedA: number,
  b: StandingRow,
  seedB: number,
): NbaSeriesState {
  return {
    id,
    round,
    conference,
    teamAId: a.teamId,
    teamAName: a.teamName,
    teamASeed: seedA,
    teamBId: b.teamId,
    teamBName: b.teamName,
    teamBSeed: seedB,
    winsA: 0,
    winsB: 0,
    games: [],
    completed: false,
  };
}

/** Home court 2-2-1-1-1 — higher seed (lower number) is teamA by convention. */
export function homeTeamForSeriesGame(series: NbaSeriesState, gameInSeries: number): string {
  // Higher seed hosts games 1,2,5,7
  const higherIsA = series.teamASeed <= series.teamBSeed;
  const higherId = higherIsA ? series.teamAId : series.teamBId;
  const lowerId = higherIsA ? series.teamBId : series.teamAId;
  if (gameInSeries === 1 || gameInSeries === 2 || gameInSeries === 5 || gameInSeries === 7) {
    return higherId;
  }
  return lowerId;
}

export function buildNbaPlayoffBracket(
  standings: StandingRow[],
  season: number,
  playIn: boolean,
): BracketState {
  const east = rankConference(standings, 'East');
  const west = rankConference(standings, 'West');

  const playInMatchups: BracketMatchup[] = [];
  let eastSeeds: StandingRow[] = east.slice(0, 8);
  let westSeeds: StandingRow[] = west.slice(0, 8);

  if (playIn && east.length >= 10 && west.length >= 10) {
    eastSeeds = east.slice(0, 6);
    westSeeds = west.slice(0, 6);
    // 7 vs 8 winners get 7; 9 vs 10 then vs loser for 8
    for (const [conf, rows] of [
      ['East', east],
      ['West', west],
    ] as const) {
      playInMatchups.push(
        {
          id: `pi-${season}-${conf}-7v8`,
          round: 'Play-In',
          region: 'PlayIn',
          slotA: {
            teamId: rows[6].teamId,
            teamName: rows[6].teamName,
            seed: 7,
            conference: conf,
          },
          slotB: {
            teamId: rows[7].teamId,
            teamName: rows[7].teamName,
            seed: 8,
            conference: conf,
          },
          completed: false,
        },
        {
          id: `pi-${season}-${conf}-9v10`,
          round: 'Play-In',
          region: 'PlayIn',
          slotA: {
            teamId: rows[8].teamId,
            teamName: rows[8].teamName,
            seed: 9,
            conference: conf,
          },
          slotB: {
            teamId: rows[9].teamId,
            teamName: rows[9].teamName,
            seed: 10,
            conference: conf,
          },
          completed: false,
        },
        {
          id: `pi-${season}-${conf}-8seed`,
          round: 'Play-In',
          region: 'PlayIn',
          slotA: { teamId: null, teamName: '7/8 Loser', seed: 8, conference: conf },
          slotB: { teamId: null, teamName: '9/10 Winner', seed: 9, conference: conf },
          completed: false,
        },
      );
    }
  }

  const series: NbaSeriesState[] = [];
  const pairs: [number, number][] = [
    [0, 7],
    [3, 4],
    [2, 5],
    [1, 6],
  ];

  if (playIn && playInMatchups.length > 0) {
    // Tentative 1–8 tree: 7/8 slots are TBD until Play-In resolves.
    for (const conf of ['East', 'West'] as const) {
      const top6 = conf === 'East' ? east.slice(0, 6) : west.slice(0, 6);
      if (top6.length < 6) continue;
      const tbd7: StandingRow = {
        teamId: `tbd-7-${conf}`,
        teamName: 'Play-In 7 Seed',
        wins: 0,
        losses: 0,
        conference: conf,
      };
      const tbd8: StandingRow = {
        teamId: `tbd-8-${conf}`,
        teamName: 'Play-In 8 Seed',
        wins: 0,
        losses: 0,
        conference: conf,
      };
      const seeds = [...top6, tbd7, tbd8];
      for (let i = 0; i < 4; i++) {
        const [ai, bi] = pairs[i];
        series.push(
          makeSeries(
            `r1-${season}-${conf}-${i}`,
            'First Round',
            conf,
            seeds[ai],
            ai + 1,
            seeds[bi],
            bi + 1,
          ),
        );
      }
    }
  } else if (eastSeeds.length >= 8 && westSeeds.length >= 8) {
    for (const conf of ['East', 'West'] as const) {
      const seeds = conf === 'East' ? eastSeeds : westSeeds;
      for (let i = 0; i < 4; i++) {
        const [ai, bi] = pairs[i];
        series.push(
          makeSeries(
            `r1-${season}-${conf}-${i}`,
            'First Round',
            conf,
            seeds[ai],
            ai + 1,
            seeds[bi],
            bi + 1,
          ),
        );
      }
    }
  }

  return {
    kind: 'nbaPlayoffs',
    status: 'active',
    season,
    playIn: playInMatchups.length ? playInMatchups : undefined,
    series,
  };
}

export function projectNbaPlayoffs(
  standings: StandingRow[],
  season: number,
  playIn: boolean,
): BracketState {
  return { ...buildNbaPlayoffBracket(standings, season, playIn), status: 'projected' };
}

export function playInStillActive(bracket: BracketState): boolean {
  return (bracket.playIn ?? []).some((m) => !m.completed);
}

/** After play-in games resolve, fill 7/8 seeds and create first-round series. */
export function resolvePlayInIntoSeries(bracket: BracketState, standings: StandingRow[]): BracketState {
  const playIn = [...(bracket.playIn ?? [])];
  if (!playIn.length || playIn.some((m) => !m.completed && m.slotA.teamId && m.slotB.teamId)) {
    // Still need to fill dependent 8-seed game slots first
  }

  // Fill 8-seed games when 7v8 and 9v10 done
  for (const conf of ['East', 'West'] as const) {
    const g78 = playIn.find((m) => m.id === `pi-${bracket.season}-${conf}-7v8`);
    const g910 = playIn.find((m) => m.id === `pi-${bracket.season}-${conf}-9v10`);
    const g8 = playIn.findIndex((m) => m.id === `pi-${bracket.season}-${conf}-8seed`);
    if (g78?.completed && g910?.completed && g8 >= 0 && !playIn[g8].slotA.teamId) {
      const loser78 =
        g78.winnerId === g78.slotA.teamId ? g78.slotB : g78.slotA;
      const winner910 =
        g910.winnerId === g910.slotA.teamId ? g910.slotA : g910.slotB;
      playIn[g8] = {
        ...playIn[g8],
        slotA: { ...loser78, seed: 8 },
        slotB: { ...winner910, seed: 9 },
      };
    }
  }

  if (playIn.some((m) => !m.completed)) {
    return { ...bracket, playIn };
  }

  // Build final 1-8
  const series: NbaSeriesState[] = [];
  for (const conf of ['East', 'West'] as const) {
    const ranked = rankConference(standings, conf);
    const top6 = ranked.slice(0, 6);
    const g78 = playIn.find((m) => m.id === `pi-${bracket.season}-${conf}-7v8`)!;
    const g8 = playIn.find((m) => m.id === `pi-${bracket.season}-${conf}-8seed`)!;
    const seed7Row = ranked.find((r) => r.teamId === g78.winnerId)!;
    const seed8Row = ranked.find((r) => r.teamId === g8.winnerId)!;
    const seeds = [...top6, seed7Row, seed8Row];
    const pairs: [number, number][] = [
      [0, 7],
      [3, 4],
      [2, 5],
      [1, 6],
    ];
    for (let i = 0; i < 4; i++) {
      const [ai, bi] = pairs[i];
      series.push(
        makeSeries(
          `r1-${bracket.season}-${conf}-${i}`,
          'First Round',
          conf,
          seeds[ai],
          ai + 1,
          seeds[bi],
          bi + 1,
        ),
      );
    }
  }
  return { ...bracket, playIn, series, status: 'active' };
}

export function activeSeries(bracket: BracketState): NbaSeriesState[] {
  const series = bracket.series ?? [];
  if (playInStillActive(bracket)) return [];
  const rounds = ['First Round', 'Conf Semis', 'Conf Finals', 'Finals'];
  for (const round of rounds) {
    const open = series.filter((s) => s.round === round && !s.completed);
    if (open.length) return open;
  }
  return [];
}

export function advanceNbaBracket(bracket: BracketState): BracketState {
  const series = [...(bracket.series ?? [])];
  const season = bracket.season;

  const ensureRound = (
    fromRound: string,
    toRound: string,
    conference: 'East' | 'West' | 'Finals',
  ) => {
    const done = series.filter((s) => s.round === fromRound && s.conference === conference && s.completed);
    if (conference !== 'Finals') {
      if (done.length < 4 && toRound === 'Conf Semis') return;
      if (done.length < 2 && toRound === 'Conf Finals') return;
    }
    if (toRound === 'Conf Semis' && conference !== 'Finals') {
      for (let i = 0; i < 2; i++) {
        const id = `r2-${season}-${conference}-${i}`;
        if (series.some((s) => s.id === id)) continue;
        const a = done[i * 2];
        const b = done[i * 2 + 1];
        if (!a?.winnerId || !b?.winnerId) continue;
        const aIsA = a.winnerId === a.teamAId;
        const bIsA = b.winnerId === b.teamAId;
        series.push({
          id,
          round: toRound,
          conference,
          teamAId: a.winnerId,
          teamAName: aIsA ? a.teamAName : a.teamBName,
          teamASeed: aIsA ? a.teamASeed : a.teamBSeed,
          teamBId: b.winnerId,
          teamBName: bIsA ? b.teamAName : b.teamBName,
          teamBSeed: bIsA ? b.teamASeed : b.teamBSeed,
          winsA: 0,
          winsB: 0,
          games: [],
          completed: false,
        });
      }
    }
    if (toRound === 'Conf Finals' && conference !== 'Finals') {
      const id = `cf-${season}-${conference}`;
      if (series.some((s) => s.id === id)) return;
      const semis = series.filter(
        (s) => s.round === 'Conf Semis' && s.conference === conference && s.completed,
      );
      if (semis.length < 2) return;
      const a = semis[0];
      const b = semis[1];
      const aIsA = a.winnerId === a.teamAId;
      const bIsA = b.winnerId === b.teamAId;
      series.push({
        id,
        round: toRound,
        conference,
        teamAId: a.winnerId!,
        teamAName: aIsA ? a.teamAName : a.teamBName,
        teamASeed: aIsA ? a.teamASeed : a.teamBSeed,
        teamBId: b.winnerId!,
        teamBName: bIsA ? b.teamAName : b.teamBName,
        teamBSeed: bIsA ? b.teamASeed : b.teamBSeed,
        winsA: 0,
        winsB: 0,
        games: [],
        completed: false,
      });
    }
  };

  ensureRound('First Round', 'Conf Semis', 'East');
  ensureRound('First Round', 'Conf Semis', 'West');
  ensureRound('Conf Semis', 'Conf Finals', 'East');
  ensureRound('Conf Semis', 'Conf Finals', 'West');

  const eastChamp = series.find(
    (s) => s.round === 'Conf Finals' && s.conference === 'East' && s.completed,
  );
  const westChamp = series.find(
    (s) => s.round === 'Conf Finals' && s.conference === 'West' && s.completed,
  );
  if (eastChamp?.winnerId && westChamp?.winnerId && !series.some((s) => s.round === 'Finals')) {
    const eIsA = eastChamp.winnerId === eastChamp.teamAId;
    const wIsA = westChamp.winnerId === westChamp.teamAId;
    // Better record / lower seed hosts — use seed as proxy
    const eSeed = eIsA ? eastChamp.teamASeed : eastChamp.teamBSeed;
    const wSeed = wIsA ? westChamp.teamASeed : westChamp.teamBSeed;
    const eFirst = eSeed <= wSeed;
    series.push({
      id: `finals-${season}`,
      round: 'Finals',
      conference: 'Finals',
      teamAId: eFirst ? eastChamp.winnerId : westChamp.winnerId,
      teamAName: eFirst
        ? eIsA
          ? eastChamp.teamAName
          : eastChamp.teamBName
        : wIsA
          ? westChamp.teamAName
          : westChamp.teamBName,
      teamASeed: eFirst ? eSeed : wSeed,
      teamBId: eFirst ? westChamp.winnerId : eastChamp.winnerId,
      teamBName: eFirst
        ? wIsA
          ? westChamp.teamAName
          : westChamp.teamBName
        : eIsA
          ? eastChamp.teamAName
          : eastChamp.teamBName,
      teamBSeed: eFirst ? wSeed : eSeed,
      winsA: 0,
      winsB: 0,
      games: [],
      completed: false,
    });
  }

  const finals = series.find((s) => s.round === 'Finals' && s.completed);
  if (finals?.winnerId) {
    const name =
      finals.winnerId === finals.teamAId ? finals.teamAName : finals.teamBName;
    return {
      ...bracket,
      series,
      status: 'complete',
      championId: finals.winnerId,
      championName: name,
    };
  }
  return { ...bracket, series };
}

export function pendingUserSeriesGame(
  bracket: BracketState,
  teamId: string,
): { series: NbaSeriesState; gameInSeries: number; homeTeamId: string } | null {
  if (playInStillActive(bracket)) {
    return null;
  }
  const open = activeSeries(bracket).find(
    (s) => (s.teamAId === teamId || s.teamBId === teamId) && !s.completed,
  );
  if (!open) return null;
  const gameInSeries = open.games.length + 1;
  if (gameInSeries > 7) return null;
  return {
    series: open,
    gameInSeries,
    homeTeamId: homeTeamForSeriesGame(open, gameInSeries),
  };
}

export function pendingUserPlayIn(
  bracket: BracketState,
  teamId: string,
): BracketMatchup | null {
  return (
    (bracket.playIn ?? []).find(
      (m) =>
        !m.completed &&
        m.slotA.teamId &&
        m.slotB.teamId &&
        (m.slotA.teamId === teamId || m.slotB.teamId === teamId),
    ) ?? null
  );
}

export function isNbaPlayoffsComplete(bracket: BracketState): boolean {
  return bracket.status === 'complete' || Boolean(
    (bracket.series ?? []).find((s) => s.round === 'Finals')?.completed,
  );
}

export function startNbaPostseason(save: CareerSave): CareerSave {
  const playIn = save.settings.playIn !== false;
  const bracket = buildNbaPlayoffBracket(save.standings, save.season, playIn);
  return {
    ...save,
    seasonStage: playIn && (bracket.playIn?.length ?? 0) > 0 ? 'playIn' : 'playoffs',
    bracket,
    history: [
      ...save.history,
      playIn
        ? `NBA Play-In and playoffs set for season ${save.season}`
        : `NBA playoffs set for season ${save.season}`,
    ],
  };
}

export function isTentativeSeries(s: NbaSeriesState): boolean {
  return s.teamAId.startsWith('tbd-') || s.teamBId.startsWith('tbd-');
}
