import { getDraftClass } from '../data/draftProspects';
import { getProTeamByTid } from '../data/nbaTeams';
import { overall } from '../domain/derived';
import { BracketState, CareerSave, LeaguePlayer, SeasonStats } from '../domain/models';

/** One line on an honors board (All-League team slot, MVP, etc.). */
export type HonorEntry = {
  playerId: string | null;
  name: string;
  teamId: string | null;
  detail?: string;
  isUser?: boolean;
};

export type ProSeasonHonors = {
  mvp: HonorEntry | null;
  dpoy: HonorEntry | null;
  allLeague: HonorEntry[][];
  bestEast: { teamId: string; teamName: string; record: string } | null;
  bestWest: { teamId: string; teamName: string; record: string } | null;
  finals: string | null;
};

export type CollegeSeasonHonors = {
  playerOfYear: HonorEntry | null;
  allAmerica: HonorEntry[][];
  userRun: string | null;
};

function teamIdFromTid(tid: number | 'FA'): string | null {
  if (tid === 'FA') return null;
  return getProTeamByTid(tid)?.id ?? null;
}

function userSeasonStats(save: CareerSave): SeasonStats | null {
  return (
    [...save.seasonStats].reverse().find((s) => s.season === save.season) ?? null
  );
}

function bestOfConference(save: CareerSave, conference: 'East' | 'West') {
  const rows = (save.standings ?? []).filter((r) => r.conference === conference);
  if (!rows.length) return null;
  const best = [...rows].sort((a, b) => b.wins - a.wins || a.losses - b.losses)[0];
  return {
    teamId: best.teamId,
    teamName: best.teamName,
    record: `${best.wins}-${best.losses}`,
  };
}

function finalsSummary(bracket: BracketState | null | undefined): string | null {
  if (!bracket || bracket.kind !== 'nbaPlayoffs') return null;
  const finals = (bracket.series ?? []).find((s) => s.round === 'Finals');
  if (!finals?.completed || !finals.winnerId) return null;
  const winnerIsA = finals.winnerId === finals.teamAId;
  const winner = winnerIsA ? finals.teamAName : finals.teamBName;
  const loser = winnerIsA ? finals.teamBName : finals.teamAName;
  const w = Math.max(finals.winsA, finals.winsB);
  const l = Math.min(finals.winsA, finals.winsB);
  return `${winner} def. ${loser} ${w}-${l}`;
}

/**
 * League honors for a finished NBA season. There is no full league stat sim,
 * so voting blends player overalls with team success — plus the user's real
 * season line, so a monster year wins real hardware.
 */
export function computeProSeasonHonors(save: CareerSave): ProSeasonHonors {
  const standings = save.standings ?? [];
  const wp = new Map(
    standings.map((r) => [
      r.teamId,
      r.wins + r.losses ? r.wins / (r.wins + r.losses) : 0.5,
    ]),
  );
  const pool = (save.leagueRoster ?? []).filter((p) => p.tid !== 'FA');

  const mvpScore = (p: LeaguePlayer) =>
    p.overall + (wp.get(teamIdFromTid(p.tid) ?? '') ?? 0.5) * 14;
  const dpoyScore = (p: LeaguePlayer) =>
    p.ratings.diq * 0.6 +
    p.ratings.hgt * 0.15 +
    p.overall * 0.35 +
    (wp.get(teamIdFromTid(p.tid) ?? '') ?? 0.5) * 8;

  const toEntry = (p: LeaguePlayer, detail?: string): HonorEntry => ({
    playerId: p.id,
    name: p.name,
    teamId: teamIdFromTid(p.tid),
    detail: detail ?? `${p.overall} OVR`,
  });

  type Cand = { entry: HonorEntry; mvp: number; dpoy: number };
  const candidates: Cand[] = pool.map((p) => ({
    entry: toEntry(p),
    mvp: mvpScore(p),
    dpoy: dpoyScore(p),
  }));

  // The user competes with their real season line.
  const stats = userSeasonStats(save);
  if (save.proTeamId && stats && stats.gp > 0) {
    const ovr = overall(save.player);
    const ppg = stats.pts / stats.gp;
    const userWp = wp.get(save.proTeamId) ?? 0.5;
    candidates.push({
      entry: {
        playerId: 'user',
        name: save.player.name,
        teamId: save.proTeamId,
        detail: `${ppg.toFixed(1)} PPG · ${ovr} OVR`,
        isUser: true,
      },
      mvp: ovr + userWp * 14 + Math.max(0, ppg - 18) * 0.9,
      dpoy:
        save.player.ratings.diq * 0.6 +
        save.player.ratings.hgt * 0.15 +
        ovr * 0.35 +
        userWp * 8,
    });
  }

  const byMvp = [...candidates].sort((a, b) => b.mvp - a.mvp);
  const byDpoy = [...candidates].sort((a, b) => b.dpoy - a.dpoy);
  const top15 = byMvp.slice(0, 15).map((c) => c.entry);

  return {
    mvp: byMvp[0]?.entry ?? null,
    dpoy: byDpoy[0]?.entry ?? null,
    allLeague: [top15.slice(0, 5), top15.slice(5, 10), top15.slice(10, 15)],
    bestEast: bestOfConference(save, 'East'),
    bestWest: bestOfConference(save, 'West'),
    finals: finalsSummary(save.bracket),
  };
}

const MADNESS_ROUND_ORDER = [
  'First Four',
  'Round of 64',
  'Round of 32',
  'Sweet 16',
  'Elite Eight',
  'Final Four',
  'Championship',
];

/** One-line summary of a team's tournament, e.g. "Eliminated in the Sweet 16". */
export function madnessRunLabel(
  bracket: BracketState | null | undefined,
  teamId: string | null,
): string | null {
  if (!bracket || bracket.kind !== 'marchMadness' || !teamId) return null;
  if (bracket.championId === teamId) return 'National Champions';
  const all = [...(bracket.firstFour ?? []), ...(bracket.rounds ?? [])];
  const mine = all.filter(
    (m) => m.slotA.teamId === teamId || m.slotB.teamId === teamId,
  );
  if (!mine.length) return 'Missed the tournament';
  const last = [...mine].sort(
    (a, b) =>
      MADNESS_ROUND_ORDER.indexOf(a.round) - MADNESS_ROUND_ORDER.indexOf(b.round),
  )[mine.length - 1];
  if (!last.completed) return `Alive in the ${last.round}`;
  const won = last.winnerId === teamId;
  if (last.round === 'Championship') {
    return won ? 'National Champions' : 'National runner-up';
  }
  return won ? `Won the ${last.round}` : `Eliminated in the ${last.round}`;
}

/** All-America teams voted from the current draft class, with the user in the race. */
export function computeCollegeSeasonHonors(save: CareerSave): CollegeSeasonHonors {
  const prospects = getDraftClass(save.draftYear) ?? [];
  const entries: { entry: HonorEntry; score: number }[] = prospects
    .filter((p) => p.collegeId)
    .slice(0, 40)
    .map((p) => ({
      entry: {
        playerId: null,
        name: p.name,
        teamId: p.collegeId ?? null,
        detail: `${p.overall} OVR`,
      },
      score: p.overall,
    }));

  const stats = userSeasonStats(save);
  if (save.collegeId && stats && stats.gp > 0) {
    const ovr = overall(save.player);
    const ppg = stats.pts / stats.gp;
    entries.push({
      entry: {
        playerId: 'user',
        name: save.player.name,
        teamId: save.collegeId,
        detail: `${ppg.toFixed(1)} PPG · ${ovr} OVR`,
        isUser: true,
      },
      score: ovr + Math.max(0, ppg - 12) * 0.8,
    });
  }

  const ranked = entries.sort((a, b) => b.score - a.score).map((e) => e.entry);
  return {
    playerOfYear: ranked[0] ?? null,
    allAmerica: [ranked.slice(0, 5), ranked.slice(5, 10)],
    userRun: madnessRunLabel(save.bracket, save.collegeId),
  };
}
