import { colleges, getCollege } from '../data/colleges';
import { getDraftClass } from '../data/draftProspects';
import { nbaTeams } from '../data/nbaTeams';
import { ScheduledGame, StandingRow } from '../domain/models';
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

  // Bias non-conference toward schools hosting top prospects in this draft class
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

export function initialStandings(
  schedule: ScheduledGame[],
  selfId: string,
  selfName: string,
): StandingRow[] {
  const names = new Map<string, string>();
  names.set(selfId, selfName);
  for (const g of schedule) names.set(g.opponentId, g.opponentName);
  return [...names.entries()].map(([teamId, teamName]) => ({
    teamId,
    teamName,
    wins: 0,
    losses: 0,
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
