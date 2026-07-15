import { z } from 'zod';
import { overallFromRatings } from '../domain/derived';
import { College, LeaguePlayer, ProTeam, Ratings } from '../domain/models';
import { heightToHgt, inferTraits } from '../domain/traits';

export const BSCL_VERSION = 1;

const ratingsSchema = z.object({
  hgt: z.number(),
  stre: z.number(),
  spd: z.number(),
  jmp: z.number(),
  endu: z.number(),
  ins: z.number(),
  dnk: z.number(),
  ft: z.number(),
  fg: z.number(),
  tp: z.number(),
  oiq: z.number(),
  diq: z.number(),
  drb: z.number(),
  pss: z.number(),
  reb: z.number(),
});

export const basketballSoloCareerLeagueSchema = z.object({
  format: z.literal('BasketballSoloCareerLeague'),
  version: z.literal(1),
  meta: z.object({
    name: z.string(),
    startingSeason: z.number(),
    provenance: z.string().optional(),
  }),
  colleges: z.array(z.record(z.string(), z.unknown())).optional(),
  teams: z.array(z.record(z.string(), z.unknown())).optional(),
  players: z.array(z.record(z.string(), z.unknown())).optional(),
  rules: z
    .object({
      numGames: z.number().optional(),
      salaryCap: z.number().optional(),
      numGamesPlayoffSeries: z.array(z.number()).optional(),
    })
    .optional(),
});

export type BasketballSoloCareerLeague = z.infer<typeof basketballSoloCareerLeagueSchema>;

export interface ImportReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  repaired: string[];
  colleges: College[];
  teams: ProTeam[];
  players: LeaguePlayer[];
}

function clampRating(n: unknown, fallback = 60): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (Number.isNaN(v)) return fallback;
  return Math.max(0, Math.min(99, Math.round(v)));
}

/** Map Basketball-GM style ratings into canonical Ratings. */
export function mapBgmRatings(r: Record<string, unknown>, heightInches = 78): Ratings {
  // Legacy coarse keys → approximate BGM sheet
  if (typeof r.finishing === 'number' && typeof r.stre !== 'number') {
    const fin = clampRating(r.finishing, 65);
    const shoot = clampRating(r.shooting, 65);
    const play = clampRating(r.playmaking, 60);
    const def = clampRating(r.defense, 60);
    const reb = clampRating(r.rebounding, 60);
    const ath = clampRating(r.athleticism, 65);
    const stam = clampRating(r.stamina, 70);
    const iq = clampRating(r.basketballIq, 70);
    return {
      hgt: heightToHgt(heightInches),
      stre: ath,
      spd: ath,
      jmp: ath,
      endu: stam,
      ins: fin,
      dnk: fin,
      ft: shoot,
      fg: shoot,
      tp: shoot,
      oiq: iq,
      diq: def,
      drb: play,
      pss: play,
      reb,
    };
  }

  return {
    hgt: clampRating(r.hgt ?? heightToHgt(heightInches), heightToHgt(heightInches)),
    stre: clampRating(r.stre, 65),
    spd: clampRating(r.spd, 65),
    jmp: clampRating(r.jmp, 65),
    endu: clampRating(r.endu, 70),
    ins: clampRating(r.ins, 65),
    dnk: clampRating(r.dnk, 65),
    ft: clampRating(r.ft, 65),
    fg: clampRating(r.fg, 65),
    tp: clampRating(r.tp, 65),
    oiq: clampRating(r.oiq, 70),
    diq: clampRating(r.diq, 60),
    drb: clampRating(r.drb, 60),
    pss: clampRating(r.pss, 60),
    reb: clampRating(r.reb, 60),
  };
}

export function parseBasketballSoloCareerLeague(raw: unknown): ImportReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const repaired: string[] = [];
  const parsed = basketballSoloCareerLeagueSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      warnings,
      repaired,
      colleges: [],
      teams: [],
      players: [],
    };
  }
  const data = parsed.data;
  const colleges: College[] = [];
  const teams: ProTeam[] = [];
  const players: LeaguePlayer[] = [];

  for (const [i, c] of (data.colleges ?? []).entries()) {
    try {
      colleges.push({
        id: String(c.id ?? `college-${i}`),
        name: String(c.name ?? 'Unknown'),
        abbrev: String(c.abbrev ?? 'UNK'),
        city: String(c.city ?? ''),
        state: String(c.state ?? ''),
        region: String(c.region ?? 'National'),
        conference: String(c.conference ?? 'Independent'),
        colors: (c.colors as [string, string, string?]) ?? ['#333', '#fff'],
        prestige: Number(c.prestige ?? 70),
        preseasonRank: (c.preseasonRank as number | null) ?? null,
        coaching: Number(c.coaching ?? 70),
        development: Number(c.development ?? 70),
        recruiting: Number(c.recruiting ?? 70),
        facilities: Number(c.facilities ?? 70),
        fanIntensity: Number(c.fanIntensity ?? 70),
        mediaScrutiny: Number(c.mediaScrutiny ?? 70),
        proExposure: Number(c.proExposure ?? 70),
        offensiveStyle: String(c.offensiveStyle ?? 'balanced'),
        defensiveStyle: String(c.defensiveStyle ?? 'pack-line'),
        pace: Number(c.pace ?? 70),
        recentSuccess: Number(c.recentSuccess ?? 70),
      });
    } catch (e) {
      errors.push(`colleges[${i}]: ${String(e)}`);
    }
  }

  for (const [i, t] of (data.teams ?? []).entries()) {
    try {
      teams.push({
        id: String(t.id ?? t.abbrev ?? `t${i}`).toLowerCase(),
        tid: Number(t.tid ?? i),
        region: String(t.region ?? ''),
        name: String(t.name ?? ''),
        abbrev: String(t.abbrev ?? 'UNK'),
        colors: (t.colors as [string, string, string?]) ?? ['#333', '#fff'],
        conference: (t.conference as 'East' | 'West') ?? 'East',
        division: String(t.division ?? ''),
      });
    } catch (e) {
      errors.push(`teams[${i}]: ${String(e)}`);
    }
  }

  for (const [i, p] of (data.players ?? []).entries()) {
    try {
      const heightInches = Number(p.heightInches ?? p.hgt ?? 78);
      const ratingsRaw = (p.ratings as Record<string, unknown>) ?? {};
      const ratingsParsed = ratingsSchema.safeParse(ratingsRaw);
      const ratings = ratingsParsed.success
        ? (ratingsRaw as Ratings)
        : mapBgmRatings(ratingsRaw, heightInches);
      const traitIds = Array.isArray(p.traitIds)
        ? (p.traitIds as string[])
        : inferTraits(ratings, heightInches);
      const pos = (p.position as LeaguePlayer['position']) ?? 'SF';
      players.push({
        id: String(p.id ?? `p${i}`),
        name: String(p.name ?? `Player ${i}`),
        tid: (p.tid as number | 'FA') ?? 'FA',
        position: pos,
        heightInches,
        weightPounds: Number(p.weightPounds ?? p.weight ?? 210),
        wingspanInches: Number(p.wingspanInches ?? heightInches + 3),
        bornYear: Number(p.bornYear ?? (p.born as { year?: number })?.year ?? 2000),
        birthplace: String(p.birthplace ?? (p.born as { loc?: string })?.loc ?? ''),
        college: String(p.college ?? ''),
        ratings,
        traitIds,
        overall: Number(p.overall ?? overallFromRatings(ratings, pos)),
        potential: Number(p.potential ?? 75),
        contractAmount: Number((p.contract as { amount?: number })?.amount ?? p.contractAmount ?? 1000),
        contractExp: Number((p.contract as { exp?: number })?.exp ?? p.contractExp ?? 2027),
        draftYear: Number((p.draft as { year?: number })?.year ?? p.draftYear ?? 2024),
        draftRound: Number((p.draft as { round?: number })?.round ?? p.draftRound ?? 0),
        draftPick: Number((p.draft as { pick?: number })?.pick ?? p.draftPick ?? 0),
        draftTid: Number((p.draft as { tid?: number })?.tid ?? p.draftTid ?? -1),
      });
    } catch (e) {
      warnings.push(`players[${i}] skipped: ${String(e)}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, repaired, colleges, teams, players };
}

/** Adapter for Basketball-GM-like external JSON example. */
export function adaptExternalLeagueJson(raw: unknown): ImportReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const repaired: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Root must be an object'], warnings, repaired, colleges: [], teams: [], players: [] };
  }
  const data = raw as Record<string, unknown>;
  const teamsIn = Array.isArray(data.teams) ? data.teams : [];
  const playersIn = Array.isArray(data.players) ? data.players : [];

  const teams: ProTeam[] = teamsIn.map((t: Record<string, unknown>, i: number) => {
    if (t.tid == null) repaired.push(`teams[${i}]: assigned tid ${i}`);
    return {
      id: String(t.abbrev ?? `t${i}`).toLowerCase(),
      tid: Number(t.tid ?? i),
      region: String(t.region ?? ''),
      name: String(t.name ?? ''),
      abbrev: String(t.abbrev ?? 'UNK'),
      colors: (t.colors as [string, string, string?]) ?? ['#333', '#fff', '#000'],
      conference: i < 15 ? 'East' : 'West',
      division: 'Imported',
    };
  });

  const seenIds = new Set<number>();
  const players: LeaguePlayer[] = [];
  for (const [i, p] of playersIn.entries()) {
    const row = p as Record<string, unknown>;
    const pid = Number(row.pid ?? i + 1000);
    if (seenIds.has(pid)) {
      warnings.push(`players[${i}]: duplicate pid ${pid}, skipped`);
      continue;
    }
    seenIds.add(pid);
    const ratingsArr = Array.isArray(row.ratings) ? row.ratings : [];
    const current = (ratingsArr[ratingsArr.length - 1] ?? {}) as Record<string, unknown>;
    const heightInches = Number(row.hgt ?? 78);
    const ratings = mapBgmRatings(current, heightInches);
    const born = (row.born ?? {}) as { year?: number; loc?: string };
    const draft = (row.draft ?? {}) as { year?: number; round?: number; pick?: number; tid?: number };
    const contract = (row.contract ?? {}) as { amount?: number; exp?: number };
    const pos = String(row.pos ?? 'SF');
    const position = (['PG', 'SG', 'SF', 'PF', 'C'].includes(pos) ? pos : 'SF') as LeaguePlayer['position'];
    if (!['PG', 'SG', 'SF', 'PF', 'C'].includes(String(row.pos))) {
      repaired.push(`players[${i}]: normalized position ${row.pos} → ${position}`);
    }
    const traitIds = inferTraits(ratings, heightInches);
    players.push({
      id: `ext-${pid}`,
      name: String(row.name ?? `Player ${pid}`),
      tid: row.tid === -1 || row.tid == null ? 'FA' : Number(row.tid),
      position,
      heightInches,
      weightPounds: Number(row.weight ?? 210),
      wingspanInches: heightInches + 3,
      bornYear: Number(born.year ?? 2000),
      birthplace: String(born.loc ?? ''),
      college: String(row.college ?? ''),
      ratings,
      traitIds,
      overall: overallFromRatings(ratings, position),
      potential: clampRating(current.pot ?? 75),
      contractAmount: Number(contract.amount ?? 1000),
      contractExp: Number(contract.exp ?? 2027),
      draftYear: Number(draft.year ?? 2024),
      draftRound: Number(draft.round ?? 0),
      draftPick: Number(draft.pick ?? 0),
      draftTid: Number(draft.tid ?? -1),
    });
  }

  return { ok: errors.length === 0, errors, warnings, repaired, colleges: [], teams, players };
}

export function toCanonicalLeaguePack(report: ImportReport, name = 'Custom Pack') {
  return {
    format: 'BasketballSoloCareerLeague' as const,
    version: BSCL_VERSION,
    meta: { name, startingSeason: 2026, provenance: 'converted' },
    colleges: report.colleges,
    teams: report.teams,
    players: report.players,
  };
}
