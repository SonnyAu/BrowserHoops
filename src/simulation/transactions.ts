import { getCollege } from '../data/colleges';
import { getProTeam, getProTeamByTid, nbaTeams } from '../data/nbaTeams';
import {
  CareerSave,
  LeaguePlayer,
  LeagueTransaction,
  Position,
} from '../domain/models';
import { Rng } from '../domain/rng';
import { bulkPutLeagueTransactions } from '../persistence/db';

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const ROSTER_SOFT_CAP = 15;

function teamIdFromTid(tid: number | 'FA'): string | null {
  if (tid === 'FA') return null;
  return getProTeamByTid(tid)?.id ?? null;
}

function countsForTeam(roster: LeaguePlayer[], tid: number): Record<Position, number> {
  const c: Record<Position, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const p of roster) {
    if (p.tid === tid) c[p.position] += 1;
  }
  return c;
}

function needAt(pos: Position, counts: Record<Position, number>): number {
  const n = counts[pos];
  if (n <= 1) return 5;
  if (n === 2) return 2.5;
  if (n === 3) return 0;
  return -2;
}

function contractAmountForOvr(ovr: number): number {
  if (ovr >= 85) return 35000 + (ovr - 85) * 2000;
  if (ovr >= 78) return 15000 + (ovr - 78) * 2500;
  if (ovr >= 72) return 5000 + (ovr - 72) * 1500;
  if (ovr >= 65) return 2000 + (ovr - 65) * 400;
  return 600;
}

function userProtectedIds(save: CareerSave): Set<string> {
  const ids = new Set<string>(['user']);
  return ids;
}

function userTeamTid(save: CareerSave): number | null {
  if (!save.proTeamId) return null;
  return getProTeam(save.proTeamId)?.tid ?? null;
}

/** Run AI–AI trades + FA market. Returns updated save + rows to persist. */
export function applyProOffseasonMarket(save: CareerSave): {
  save: CareerSave;
  transactions: LeagueTransaction[];
} {
  if (!save.leagueRoster?.length) return { save, transactions: [] };
  const rng = new Rng(`${save.settings.seed}:market:${save.id}:${save.season + 1}`);
  const freq = Math.max(0.1, Math.min(2, save.settings.tradeFrequency ?? 1));
  let roster = save.leagueRoster.map((p) => ({ ...p }));
  const txs: LeagueTransaction[] = [];
  const season = save.season + 1;
  const protectedPlayers = userProtectedIds(save);
  const userTid = userTeamTid(save);

  // --- Trades ---
  const tradeTarget = Math.round(4 + freq * 8);
  let deals = 0;
  const teams = [...nbaTeams];
  for (let attempt = 0; attempt < tradeTarget * 8 && deals < tradeTarget; attempt++) {
    const a = rng.pick(teams);
    const b = rng.pick(teams);
    if (a.tid === b.tid) continue;
    if (userTid != null && (a.tid === userTid || b.tid === userTid)) continue;

    const aRoster = roster.filter((p) => p.tid === a.tid && !protectedPlayers.has(p.id));
    const bRoster = roster.filter((p) => p.tid === b.tid && !protectedPlayers.has(p.id));
    if (aRoster.length < 6 || bRoster.length < 6) continue;

    const aCounts = countsForTeam(roster, a.tid);
    const bCounts = countsForTeam(roster, b.tid);

    // Find positions A needs and B is deep
    let best: {
      fromA: LeaguePlayer;
      fromB: LeaguePlayer;
      score: number;
    } | null = null;

    for (const pos of POSITIONS) {
      if (needAt(pos, aCounts) < 2.5) continue;
      if ((bCounts[pos] ?? 0) < 3) continue;
      const candidatesB = bRoster
        .filter((p) => p.position === pos)
        .sort((x, y) => x.overall - y.overall);
      const giveB = candidatesB[0];
      if (!giveB) continue;
      // A returns a surplus piece
      const surplusPos = POSITIONS.find((p) => (aCounts[p] ?? 0) >= 4) ?? POSITIONS.find((p) => (aCounts[p] ?? 0) >= 3);
      if (!surplusPos) continue;
      const giveA = aRoster
        .filter((p) => p.position === surplusPos)
        .sort((x, y) => x.overall - y.overall)[0];
      if (!giveA) continue;
      if (Math.abs(giveA.overall - giveB.overall) > 8) continue;
      const score =
        needAt(pos, aCounts) +
        needAt(surplusPos, bCounts) -
        Math.abs(giveA.overall - giveB.overall);
      if (!best || score > best.score) best = { fromA: giveA, fromB: giveB, score };
    }

    if (!best || best.score < 3) continue;

    roster = roster.map((p) => {
      if (p.id === best!.fromA.id) return { ...p, tid: b.tid };
      if (p.id === best!.fromB.id) return { ...p, tid: a.tid };
      return p;
    });
    txs.push({
      id: crypto.randomUUID(),
      saveId: save.id,
      season,
      dateKey: `${season}-offseason-trade-${deals}`,
      type: 'trade',
      teamIds: [a.id, b.id],
      playerIds: [best.fromA.id, best.fromB.id],
      summary: `${a.abbrev} trades ${best.fromA.name} to ${b.abbrev} for ${best.fromB.name}`,
      assets: [
        { fromTeamId: a.id, toTeamId: b.id, playerIds: [best.fromA.id] },
        { fromTeamId: b.id, toTeamId: a.id, playerIds: [best.fromB.id] },
      ],
    });
    deals += 1;
  }

  // --- Expiring → FA + signings ---
  roster = roster.map((p) => {
    if (protectedPlayers.has(p.id)) return p;
    if (p.tid !== 'FA' && p.contractExp < season) {
      return { ...p, tid: 'FA' as const };
    }
    return p;
  });

  const faPool = roster
    .filter((p) => p.tid === 'FA' && !protectedPlayers.has(p.id))
    .sort((a, b) => b.overall - a.overall);

  for (const team of teams) {
    if (userTid != null && team.tid === userTid) continue;
    let teamPlayers = roster.filter((p) => p.tid === team.tid);
    // Releases over soft cap
    while (teamPlayers.length > ROSTER_SOFT_CAP) {
      const cut = [...teamPlayers].sort((a, b) => a.overall - b.overall)[0];
      if (!cut || protectedPlayers.has(cut.id)) break;
      roster = roster.map((p) => (p.id === cut.id ? { ...p, tid: 'FA' as const } : p));
      txs.push({
        id: crypto.randomUUID(),
        saveId: save.id,
        season,
        dateKey: `${season}-offseason-release-${cut.id}`,
        type: 'release',
        teamIds: [team.id],
        playerIds: [cut.id],
        summary: `${team.abbrev} releases ${cut.name}`,
      });
      teamPlayers = roster.filter((p) => p.tid === team.tid);
    }

    const counts = countsForTeam(roster, team.tid);
    const needPos = POSITIONS.filter((pos) => needAt(pos, counts) >= 2.5);
    if (!needPos.length || teamPlayers.length >= ROSTER_SOFT_CAP) continue;

    for (const pos of needPos) {
      if (roster.filter((p) => p.tid === team.tid).length >= ROSTER_SOFT_CAP) break;
      const idx = faPool.findIndex(
        (p) =>
          p.position === pos &&
          roster.find((r) => r.id === p.id)?.tid === 'FA',
      );
      if (idx < 0) continue;
      const signee = faPool[idx]!;
      const years = rng.int(1, 4);
      const amount = Math.round(contractAmountForOvr(signee.overall));
      roster = roster.map((p) =>
        p.id === signee.id
          ? {
              ...p,
              tid: team.tid,
              contractAmount: amount,
              contractExp: season + years - 1,
            }
          : p,
      );
      txs.push({
        id: crypto.randomUUID(),
        saveId: save.id,
        season,
        dateKey: `${season}-offseason-sign-${signee.id}`,
        type: 'signing',
        teamIds: [team.id],
        playerIds: [signee.id],
        summary: `${team.abbrev} signs ${signee.name} (${years}yr, $${amount}k)`,
        contract: { playerId: signee.id, amount, exp: season + years - 1 },
      });
    }
  }

  // --- Extensions for stars ---
  for (const team of teams) {
    if (userTid != null && team.tid === userTid) continue;
    if (rng.next() > 0.35 * freq) continue;
    const stars = roster.filter(
      (p) =>
        p.tid === team.tid &&
        p.overall >= 82 &&
        p.contractExp <= season + 1 &&
        !protectedPlayers.has(p.id),
    );
    const star = stars[0];
    if (!star) continue;
    const years = rng.int(2, 4);
    const amount = Math.round(contractAmountForOvr(star.overall) * 1.1);
    roster = roster.map((p) =>
      p.id === star.id
        ? { ...p, contractAmount: amount, contractExp: season + years }
        : p,
    );
    txs.push({
      id: crypto.randomUUID(),
      saveId: save.id,
      season,
      dateKey: `${season}-offseason-ext-${star.id}`,
      type: 'extension',
      teamIds: [team.id],
      playerIds: [star.id],
      summary: `${team.abbrev} extends ${star.name} (${years}yr, $${amount}k)`,
      contract: { playerId: star.id, amount, exp: season + years },
    });
  }

  const tradeNote =
    deals > 0 ? `${deals} AI trades executed in ${season} offseason` : null;
  return {
    save: {
      ...save,
      leagueRoster: roster,
      history: tradeNote ? [...save.history, tradeNote] : save.history,
      updatedAt: new Date().toISOString(),
    },
    transactions: txs,
  };
}

export async function persistLeagueTransactions(txs: LeagueTransaction[]) {
  await bulkPutLeagueTransactions(txs);
}

export function logCommitmentTransaction(
  save: CareerSave,
  collegeId: string,
  playerId = 'user',
): LeagueTransaction {
  return {
    id: crypto.randomUUID(),
    saveId: save.id,
    season: save.season,
    dateKey: `${save.season}-commitment`,
    type: 'commitment',
    teamIds: [collegeId],
    playerIds: [playerId],
    summary: `Committed to ${getCollege(collegeId)?.name ?? collegeId}`,
  };
}

void teamIdFromTid;
