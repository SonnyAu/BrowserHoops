import { getCollege } from '../data/colleges';
import { getProTeam } from '../data/nbaTeams';
import {
  CareerSave,
  GameLog,
  LeagueGameRecord,
  PlayerSeasonLine,
  TeamSeasonRecord,
} from '../domain/models';
import {
  bulkPutPlayerSeasonLines,
  bulkPutTeamSeasonRecords,
  loadLeagueGamesForSeason,
} from '../persistence/db';

function teamAbbrev(teamId: string, level: 'college' | 'pro'): string {
  if (level === 'pro') {
    return getProTeam(teamId)?.abbrev ?? teamId.slice(0, 3).toUpperCase();
  }
  return getCollege(teamId)?.abbrev ?? teamId.slice(0, 4).toUpperCase();
}

type AggKey = string;

function emptyLine(
  saveId: string,
  playerId: string,
  season: number,
  level: 'college' | 'pro',
  phase: 'regular' | 'playoffs',
  teamId: string,
  age: number,
): PlayerSeasonLine {
  return {
    id: `${saveId}:${playerId}:${season}:${level}:${phase}:${teamId}`,
    saveId,
    playerId,
    season,
    level,
    phase,
    teamId,
    teamAbbrev: teamAbbrev(teamId, level),
    age,
    gp: 0,
    gs: 0,
    min: 0,
    fg: 0,
    fga: 0,
    tp: 0,
    tpa: 0,
    ft: 0,
    fta: 0,
    orb: 0,
    drb: 0,
    trb: 0,
    ast: 0,
    tov: 0,
    stl: 0,
    blk: 0,
    pf: 0,
    pts: 0,
  };
}

function addBox(
  line: PlayerSeasonLine,
  box: {
    minutes: number;
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    turnovers: number;
    fgm: number;
    fga: number;
    tpm: number;
    tpa: number;
    ftm: number;
    fta: number;
    orb?: number;
    drb?: number;
    pf?: number;
  },
  started: boolean,
) {
  line.gp += 1;
  if (started) line.gs += 1;
  line.min += box.minutes;
  line.pts += box.points;
  line.trb += box.rebounds;
  const orb = box.orb ?? 0;
  const drb = box.drb ?? Math.max(0, box.rebounds - orb);
  line.orb += orb;
  line.drb += drb;
  line.ast += box.assists;
  line.stl += box.steals;
  line.blk += box.blocks;
  line.tov += box.turnovers;
  line.fg += box.fgm;
  line.fga += box.fga;
  line.tp += box.tpm;
  line.tpa += box.tpa;
  line.ft += box.ftm;
  line.fta += box.fta;
  line.pf += box.pf ?? 0;
}

export function aggregateFromLeagueGames(
  save: CareerSave,
  games: LeagueGameRecord[],
): PlayerSeasonLine[] {
  const map = new Map<AggKey, PlayerSeasonLine>();
  const level: 'college' | 'pro' =
    save.phase === 'professional' || !!save.proTeamId ? 'pro' : 'college';
  const ageByPlayer = new Map<string, number>();
  ageByPlayer.set('user', save.age);
  for (const p of save.leagueRoster ?? []) {
    ageByPlayer.set(p.id, p.age ?? Math.max(19, save.season - (p.bornYear ?? 2000)));
  }

  for (const g of games) {
    const phase: 'regular' | 'playoffs' =
      g.stage === 'regular' ? 'regular' : 'playoffs';
    for (const box of g.players) {
      if (!box.playerId || box.minutes <= 0) continue;
      const key = `${box.playerId}|${phase}|${box.teamId}`;
      let line = map.get(key);
      if (!line) {
        line = emptyLine(
          save.id,
          box.playerId,
          save.season,
          g.level ?? level,
          phase,
          box.teamId,
          ageByPlayer.get(box.playerId) ?? save.age,
        );
        map.set(key, line);
      }
      addBox(line, box, box.minutes >= 20);
    }
  }
  return [...map.values()];
}

export function aggregateUserLogs(save: CareerSave, logs: GameLog[]): PlayerSeasonLine[] {
  const level: 'college' | 'pro' =
    save.proTeamId || save.phase === 'professional' ? 'pro' : 'college';
  const selfId =
    level === 'pro'
      ? save.proTeamId ?? 'self'
      : save.collegeId ?? 'self';
  const map = new Map<AggKey, PlayerSeasonLine>();

  for (const log of logs) {
    if (log.minutes <= 0) continue;
    const phase: 'regular' | 'playoffs' = log.playoffs ? 'playoffs' : 'regular';
    const teamId = selfId;
    const key = `user|${phase}|${teamId}`;
    let line = map.get(key);
    if (!line) {
      line = emptyLine(save.id, 'user', save.season, level, phase, teamId, save.age);
      map.set(key, line);
    }
    addBox(
      line,
      {
        minutes: log.minutes,
        points: log.points,
        rebounds: log.rebounds,
        assists: log.assists,
        steals: log.steals,
        blocks: log.blocks,
        turnovers: log.turnovers,
        fgm: log.fgm,
        fga: log.fga,
        tpm: log.tpm,
        tpa: log.tpa,
        ftm: log.ftm,
        fta: log.fta,
        orb: 0,
        drb: log.rebounds,
        pf: log.fouls,
      },
      log.minutes >= 20,
    );
  }
  return [...map.values()];
}

/** In-progress current-season lines for one player, viewable before the season is archived. */
export async function liveSeasonLines(
  save: CareerSave,
  playerId: string,
): Promise<PlayerSeasonLine[]> {
  let lines: PlayerSeasonLine[];
  if (playerId === 'user') {
    lines = aggregateUserLogs(save, save.seasonLogBuffer ?? []);
  } else {
    const games = await loadLeagueGamesForSeason(save.id, save.season);
    lines = aggregateFromLeagueGames(save, games).filter((l) => l.playerId === playerId);
  }
  return lines.map((l) => ({ ...l, live: true }));
}

export async function archiveSeasonHistory(save: CareerSave): Promise<void> {
  const games = await loadLeagueGamesForSeason(save.id, save.season);
  const fromLeague = aggregateFromLeagueGames(save, games);
  const fromUser = aggregateUserLogs(save, save.seasonLogBuffer ?? []);

  // Prefer user-aggregated lines for playerId 'user' (more accurate).
  const byId = new Map<string, PlayerSeasonLine>();
  for (const row of fromLeague) {
    if (row.playerId === 'user') continue;
    byId.set(row.id, row);
  }
  for (const row of fromUser) {
    byId.set(row.id, row);
  }
  await bulkPutPlayerSeasonLines([...byId.values()]);

  const level: 'college' | 'pro' =
    save.phase === 'professional' || !!save.proTeamId ? 'pro' : 'college';
  const teamRows: TeamSeasonRecord[] = (save.standings ?? []).map((r) => ({
    id: `${save.id}:${r.teamId}:${save.season}`,
    saveId: save.id,
    teamId: r.teamId,
    season: save.season,
    level,
    wins: r.wins,
    losses: r.losses,
    conference: r.conference,
  }));
  await bulkPutTeamSeasonRecords(teamRows);
}

export function jerseyStopsFromLines(
  lines: PlayerSeasonLine[],
  currentTeamId?: string | null,
): { teamId: string; level: 'college' | 'pro' }[] {
  const ordered: { teamId: string; level: 'college' | 'pro' }[] = [];
  const seen = new Set<string>();
  const sorted = [...lines].sort((a, b) => {
    if (a.level !== b.level) return a.level === 'college' ? -1 : 1;
    return a.season - b.season;
  });
  for (const l of sorted) {
    const key = `${l.level}:${l.teamId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push({ teamId: l.teamId, level: l.level });
  }
  if (currentTeamId && !seen.has(`pro:${currentTeamId}`) && !seen.has(`college:${currentTeamId}`)) {
    const pro = getProTeam(currentTeamId);
    ordered.push({
      teamId: currentTeamId,
      level: pro ? 'pro' : 'college',
    });
  }
  return ordered;
}
