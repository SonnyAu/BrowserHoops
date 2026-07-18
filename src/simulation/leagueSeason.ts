import { colleges, getCollege } from '../data/colleges';
import { getProTeam, nbaTeams } from '../data/nbaTeams';
import { Rng } from '../domain/rng';
import {
  BoxLine,
  CareerPhase,
  CareerSave,
  LeagueGameRecord,
  LeaguePlayer,
  SeasonStage,
  StandingRow,
} from '../domain/models';
import { updateStandings } from './schedule';

function rosterForTeam(teamId: string, leagueRoster: LeaguePlayer[]): LeaguePlayer[] {
  const t = getProTeam(teamId);
  if (!t) return [];
  return leagueRoster.filter((p) => p.tid === t.tid).slice(0, 8);
}

function teamStrength(teamId: string, phase: CareerPhase, leagueRoster: LeaguePlayer[]): number {
  if (phase === 'professional' || phase === 'draft') {
    const t = getProTeam(teamId);
    const rosterBoost = rosterForTeam(teamId, leagueRoster)
      .slice(0, 5)
      .reduce((s, p) => s + (p.overall - 70) * 0.15, 0);
    return (t ? 75 + (t.tid % 7) : 72) + rosterBoost;
  }
  return getCollege(teamId)?.prestige ?? 70;
}

function teamName(teamId: string, level: 'college' | 'pro'): string {
  if (level === 'pro') {
    const t = getProTeam(teamId);
    return t ? `${t.region} ${t.name}` : teamId;
  }
  return getCollege(teamId)?.name ?? teamId;
}

function synthBoxLines(
  teamId: string,
  score: number,
  rng: Rng,
  leagueRoster: LeaguePlayer[],
  level: 'college' | 'pro',
): BoxLine[] {
  const roster = level === 'pro' ? rosterForTeam(teamId, leagueRoster) : [];
  const lines: BoxLine[] = [];
  let ptsLeft = score;
  const n = Math.min(5, Math.max(5, roster.length || 5));
  for (let i = 0; i < n; i++) {
    const p = roster[i];
    const share = i === 0 ? 0.22 : i < 5 ? 0.14 : 0.08;
    const pts = i === n - 1 ? Math.max(0, ptsLeft) : Math.round(score * share + rng.int(-3, 3));
    ptsLeft -= pts;
    const fga = Math.max(1, Math.round(pts * 0.85 + rng.int(1, 6)));
    const fgm = Math.min(fga, Math.round(pts * 0.4 + rng.int(0, 3)));
    lines.push({
      playerId: p?.id ?? `${teamId}-p${i}`,
      playerName: p?.name ?? `Player ${i + 1}`,
      teamId,
      minutes: Math.max(8, 32 - i * 3 + rng.int(-2, 2)),
      points: Math.max(0, pts),
      rebounds: Math.max(0, rng.int(1, 9) + (i < 2 ? 2 : 0)),
      assists: Math.max(0, rng.int(0, 7) + (i === 0 ? 2 : 0)),
      steals: rng.int(0, 3),
      blocks: rng.int(0, 2),
      turnovers: rng.int(0, 4),
      fgm,
      fga,
      tpm: Math.min(fgm, rng.int(0, 4)),
      tpa: rng.int(1, 8),
      ftm: Math.max(0, Math.round(pts * 0.15)),
      fta: Math.max(0, Math.round(pts * 0.2)),
    });
  }
  return lines;
}

function scoreGame(
  homeId: string,
  awayId: string,
  phase: CareerPhase,
  leagueRoster: LeaguePlayer[],
  rng: Rng,
): { homeScore: number; awayScore: number } {
  const hs = teamStrength(homeId, phase, leagueRoster) + 3 + rng.int(-8, 8);
  const as = teamStrength(awayId, phase, leagueRoster) + rng.int(-8, 8);
  const homeScore = Math.round(62 + (hs - 70) / 2.2 + rng.int(0, 18));
  const awayScore = Math.round(60 + (as - 70) / 2.5 + rng.int(0, 18));
  if (homeScore === awayScore) {
    return rng.next() < 0.5
      ? { homeScore: homeScore + 1, awayScore }
      : { homeScore, awayScore: awayScore + 1 };
  }
  return { homeScore, awayScore };
}

/** Build a deterministic slate of games for one league day (excluding user matchup). */
export function buildLeagueDayPairings(
  level: 'college' | 'pro',
  day: number,
  seed: string,
  excludeIds: string[],
): { homeId: string; awayId: string }[] {
  const rng = new Rng(`${seed}:leagueDay:${level}:${day}`);
  const exclude = new Set(excludeIds);
  const teams =
    level === 'pro'
      ? nbaTeams.map((t) => t.id)
      : colleges.map((c) => c.id);
  const pool = teams.filter((id) => !exclude.has(id));
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const byConf = new Map<string, string[]>();
  for (const id of shuffled) {
    const conf =
      level === 'pro'
        ? getProTeam(id)?.conference ?? 'East'
        : getCollege(id)?.conference ?? 'Ind';
    const list = byConf.get(conf) ?? [];
    list.push(id);
    byConf.set(conf, list);
  }
  const used = new Set<string>();
  const pairs: { homeId: string; awayId: string }[] = [];

  for (const [, ids] of byConf) {
    for (let i = 0; i + 1 < ids.length; i += 2) {
      if (rng.next() > 0.7) continue;
      const a = ids[i];
      const b = ids[i + 1];
      if (used.has(a) || used.has(b)) continue;
      used.add(a);
      used.add(b);
      pairs.push({ homeId: a, awayId: b });
    }
  }
  const leftovers = shuffled.filter((id) => !used.has(id));
  for (let i = 0; i + 1 < leftovers.length; i += 2) {
    pairs.push({ homeId: leftovers[i], awayId: leftovers[i + 1] });
  }
  return pairs;
}

export function simulateLeagueDay(args: {
  save: CareerSave;
  day: number;
  excludeIds: string[];
  stage?: SeasonStage;
}): { standings: StandingRow[]; games: LeagueGameRecord[] } {
  const { save, day, excludeIds } = args;
  const stage = args.stage ?? 'regular';
  const level: 'college' | 'pro' =
    save.phase === 'professional' || save.proTeamId ? 'pro' : 'college';
  const phase = save.phase;
  const pairs = buildLeagueDayPairings(level, day, save.settings.seed, excludeIds);
  const rng = new Rng(`${save.settings.seed}:lgSim:${level}:${day}`);
  let standings = save.standings.map((r) => ({ ...r }));
  const games: LeagueGameRecord[] = [];
  const roster = save.leagueRoster ?? [];

  for (const { homeId, awayId } of pairs) {
    const { homeScore, awayScore } = scoreGame(homeId, awayId, phase, roster, rng);
    const homeWon = homeScore > awayScore;
    standings = updateStandings(standings, homeId, awayId, homeWon);
    const homeName = teamName(homeId, level);
    const awayName = teamName(awayId, level);
    const players = [
      ...synthBoxLines(homeId, homeScore, rng, roster, level),
      ...synthBoxLines(awayId, awayScore, rng, roster, level),
    ];
    games.push({
      id: `lg-${save.id}-s${save.season}-d${day}-${homeId}-${awayId}`,
      saveId: save.id,
      season: save.season,
      level,
      stage,
      day,
      homeTeamId: homeId,
      homeTeamName: homeName,
      awayTeamId: awayId,
      awayTeamName: awayName,
      homeScore,
      awayScore,
      players,
      createdAt: new Date().toISOString(),
    });
  }
  return { standings, games };
}

/** Ensure standings include every team in the league. */
export function ensureNationalStandings(save: CareerSave): StandingRow[] {
  const level: 'college' | 'pro' =
    save.phase === 'professional' || !!save.proTeamId ? 'pro' : 'college';
  const existing = new Map((save.standings ?? []).map((r) => [r.teamId, r]));
  if (level === 'pro') {
    return nbaTeams.map((t) => {
      const prev = existing.get(t.id);
      return (
        prev ?? {
          teamId: t.id,
          teamName: `${t.region} ${t.name}`,
          wins: 0,
          losses: 0,
          conference: t.conference,
        }
      );
    });
  }
  return colleges.map((c) => {
    const prev = existing.get(c.id);
    return (
      prev ?? {
        teamId: c.id,
        teamName: c.name,
        wins: 0,
        losses: 0,
        conference: c.conference,
      }
    );
  });
}

export function simulateNeutralGame(
  save: CareerSave,
  homeId: string,
  awayId: string,
  day: number,
  stage: SeasonStage,
  meta?: LeagueGameRecord['playoffMeta'],
): { homeScore: number; awayScore: number; game: LeagueGameRecord; homeWon: boolean } {
  const level: 'college' | 'pro' =
    save.phase === 'professional' || !!save.proTeamId ? 'pro' : 'college';
  const rng = new Rng(
    `${save.settings.seed}:neutral:${save.season}:${day}:${homeId}:${awayId}:${meta?.round ?? ''}`,
  );
  const { homeScore, awayScore } = scoreGame(
    homeId,
    awayId,
    save.phase,
    save.leagueRoster ?? [],
    rng,
  );
  const homeWon = homeScore > awayScore;
  const game: LeagueGameRecord = {
    id: `lg-${save.id}-s${save.season}-d${day}-${homeId}-${awayId}-${meta?.round ?? stage}`,
    saveId: save.id,
    season: save.season,
    level,
    stage,
    day,
    homeTeamId: homeId,
    homeTeamName: teamName(homeId, level),
    awayTeamId: awayId,
    awayTeamName: teamName(awayId, level),
    homeScore,
    awayScore,
    playoffMeta: meta,
    players: [
      ...synthBoxLines(homeId, homeScore, rng, save.leagueRoster ?? [], level),
      ...synthBoxLines(awayId, awayScore, rng, save.leagueRoster ?? [], level),
    ],
    createdAt: new Date().toISOString(),
  };
  return { homeScore, awayScore, game, homeWon };
}
