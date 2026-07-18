import { colleges, getCollege } from '../data/colleges';
import { getDraftClass } from '../data/draftProspects';
import { getProTeam, nbaTeams } from '../data/nbaTeams';
import { CareerPhase, ScheduledGame, StandingRow } from '../domain/models';
import { Rng } from '../domain/rng';

export function buildCollegeSchedule(
  collegeId: string,
  length: number,
  seed: string,
  draftYear = 2026,
): ScheduledGame[] {
  const rng = new Rng(seed + ':sched:' + collegeId);
  const self = getCollege(collegeId)!;
  const confMates = colleges.filter((c) => c.conference === self.conference && c.id !== collegeId);
  const others = colleges.filter((c) => c.id !== collegeId && c.conference !== self.conference);

  const prospectSchoolIds = new Set(
    getDraftClass(draftYear)
      .filter((p) => p.collegeId && p.collegeId !== collegeId)
      .slice(0, 40)
      .map((p) => p.collegeId!),
  );
  const prospectSchools = others.filter((c) => prospectSchoolIds.has(c.id));
  const plainOthers = others.filter((c) => !prospectSchoolIds.has(c.id));

  const games: ScheduledGame[] = [];
  for (let i = 1; i <= length; i++) {
    let opp;
    if (i % 3 !== 0 && confMates.length) {
      opp = rng.pick(confMates);
    } else if (prospectSchools.length && rng.next() < 0.55) {
      opp = rng.pick(prospectSchools);
    } else {
      opp = rng.pick(plainOthers.length ? plainOthers : others);
    }
    games.push({
      id: `cg-${collegeId}-${i}`,
      gameNumber: i,
      opponentId: opp.id,
      opponentName: opp.name,
      home: i % 2 === 1,
      completed: false,
    });
  }
  return games;
}

export function buildProSchedule(teamId: string, length: number, seed: string): ScheduledGame[] {
  const rng = new Rng(seed + ':prosched:' + teamId);
  const others = nbaTeams.filter((t) => t.id !== teamId);
  const games: ScheduledGame[] = [];
  for (let i = 1; i <= length; i++) {
    const opp = rng.pick(others);
    games.push({
      id: `pg-${teamId}-${i}`,
      gameNumber: i,
      opponentId: opp.id,
      opponentName: `${opp.region} ${opp.name}`,
      home: i % 2 === 1,
      completed: false,
    });
  }
  return games;
}

export function listCollegeConferences(): string[] {
  return [...new Set(colleges.map((c) => c.conference))].sort();
}

export function listProConferences(): string[] {
  return ['East', 'West'];
}

/** Full national college standings (all conferences). */
export function initialCollegeStandings(_collegeId?: string): StandingRow[] {
  return colleges.map((c) => ({
    teamId: c.id,
    teamName: c.name,
    wins: 0,
    losses: 0,
    conference: c.conference,
  }));
}

/** Full NBA standings (East + West). */
export function initialProStandings(_teamId?: string): StandingRow[] {
  return nbaTeams.map((t) => ({
    teamId: t.id,
    teamName: `${t.region} ${t.name}`,
    wins: 0,
    losses: 0,
    conference: t.conference,
  }));
}

/** @deprecated use initialCollegeStandings / initialProStandings */
export function initialStandings(
  schedule: ScheduledGame[],
  selfId: string,
  selfName: string,
): StandingRow[] {
  const college = getCollege(selfId);
  if (college) return initialCollegeStandings(selfId);
  const pro = getProTeam(selfId);
  if (pro) return initialProStandings(selfId);
  const names = new Map<string, string>();
  names.set(selfId, selfName);
  for (const g of schedule) names.set(g.opponentId, g.opponentName);
  return [...names.entries()].map(([teamId, teamName]) => ({
    teamId,
    teamName,
    wins: 0,
    losses: 0,
    conference: 'Unknown',
  }));
}

export function updateStandings(
  standings: StandingRow[],
  selfId: string,
  opponentId: string,
  won: boolean,
): StandingRow[] {
  return standings.map((row) => {
    if (row.teamId === selfId) {
      return won
        ? { ...row, wins: row.wins + 1 }
        : { ...row, losses: row.losses + 1 };
    }
    if (row.teamId === opponentId) {
      return won
        ? { ...row, losses: row.losses + 1 }
        : { ...row, wins: row.wins + 1 };
    }
    return row;
  });
}

function teamStrength(teamId: string, phase: CareerPhase): number {
  if (phase === 'professional' || phase === 'draft') {
    const t = getProTeam(teamId);
    return t ? 75 + (t.tid % 7) : 72;
  }
  return getCollege(teamId)?.prestige ?? 70;
}

/** Advance other conference games so the table moves each sim day. */
export function advanceConferenceGames(
  standings: StandingRow[],
  seed: string,
  gameNumber: number,
  excludeIds: string[],
  phase: CareerPhase,
): StandingRow[] {
  const rng = new Rng(`${seed}:conf:${gameNumber}`);
  const exclude = new Set(excludeIds);
  const byConf = new Map<string, StandingRow[]>();
  for (const row of standings) {
    const list = byConf.get(row.conference) ?? [];
    list.push(row);
    byConf.set(row.conference, list);
  }

  let next = standings.map((r) => ({ ...r }));
  const index = new Map(next.map((r, i) => [r.teamId, i]));

  for (const [, rows] of byConf) {
    const pool = rows.filter((r) => !exclude.has(r.teamId));
    if (pool.length < 2) continue;
    const shuffled = [...pool].sort(() => rng.next() - 0.5);
    const pairs = Math.min(3, Math.floor(shuffled.length / 2));
    for (let p = 0; p < pairs; p++) {
      const a = shuffled[p * 2];
      const b = shuffled[p * 2 + 1];
      if (!a || !b) break;
      const sa = teamStrength(a.teamId, phase) + rng.int(-8, 8);
      const sb = teamStrength(b.teamId, phase) + rng.int(-8, 8);
      const aWon = sa >= sb;
      const ai = index.get(a.teamId)!;
      const bi = index.get(b.teamId)!;
      if (aWon) {
        next[ai] = { ...next[ai], wins: next[ai].wins + 1 };
        next[bi] = { ...next[bi], losses: next[bi].losses + 1 };
      } else {
        next[ai] = { ...next[ai], losses: next[ai].losses + 1 };
        next[bi] = { ...next[bi], wins: next[bi].wins + 1 };
      }
    }
  }
  return next;
}

/** Lazily add rows for another conference when the user switches the viewer. */
export function ensureConferenceInStandings(
  standings: StandingRow[],
  conference: string,
  phase: CareerPhase,
  seed: string,
  gamesPlayed: number,
): StandingRow[] {
  if (standings.some((r) => r.conference === conference)) return standings;
  let fresh: StandingRow[];
  if (phase === 'professional' || phase === 'draft') {
    fresh = nbaTeams
      .filter((t) => t.conference === conference)
      .map((t) => ({
        teamId: t.id,
        teamName: `${t.region} ${t.name}`,
        wins: 0,
        losses: 0,
        conference: t.conference,
      }));
  } else {
    fresh = colleges
      .filter((c) => c.conference === conference)
      .map((c) => ({
        teamId: c.id,
        teamName: c.name,
        wins: 0,
        losses: 0,
        conference: c.conference,
      }));
  }
  // Catch them up roughly to games played.
  let merged = [...standings, ...fresh];
  for (let g = 1; g <= gamesPlayed; g++) {
    merged = advanceConferenceGames(merged, `${seed}:lazy:${conference}`, g, [], phase);
  }
  return merged;
}
