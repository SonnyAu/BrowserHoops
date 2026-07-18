import { PlayerSeasonLine } from '../domain/models';

export type PerGameRow = {
  season: number;
  teamId: string;
  teamAbbrev: string;
  age: number;
  gp: number;
  gs: number;
  mp: number;
  fg: number;
  fga: number;
  fgPct: number | null;
  tp: number;
  tpa: number;
  tpPct: number | null;
  twop: number;
  twopa: number;
  twopPct: number | null;
  efgPct: number | null;
  ft: number;
  fta: number;
  ftPct: number | null;
  orb: number;
  drb: number;
  trb: number;
  ast: number;
  tov: number;
  stl: number;
  blk: number;
  pf: number;
  pts: number;
};

function pct(made: number, att: number): number | null {
  if (att <= 0) return null;
  return made / att;
}

function per(total: number, gp: number): number {
  if (gp <= 0) return 0;
  return total / gp;
}

/** Convert archived totals into BBGM-style per-game display row. */
export function toPerGame(line: PlayerSeasonLine): PerGameRow {
  const gp = line.gp;
  const twopa = Math.max(0, line.fga - line.tpa);
  const twop = Math.max(0, line.fg - line.tp);
  return {
    season: line.season,
    teamId: line.teamId,
    teamAbbrev: line.teamAbbrev,
    age: line.age,
    gp,
    gs: line.gs,
    mp: per(line.min, gp),
    fg: per(line.fg, gp),
    fga: per(line.fga, gp),
    fgPct: pct(line.fg, line.fga),
    tp: per(line.tp, gp),
    tpa: per(line.tpa, gp),
    tpPct: pct(line.tp, line.tpa),
    twop: per(twop, gp),
    twopa: per(twopa, gp),
    twopPct: pct(twop, twopa),
    efgPct: line.fga > 0 ? (line.fg + 0.5 * line.tp) / line.fga : null,
    ft: per(line.ft, gp),
    fta: per(line.fta, gp),
    ftPct: pct(line.ft, line.fta),
    orb: per(line.orb, gp),
    drb: per(line.drb, gp),
    trb: per(line.trb, gp),
    ast: per(line.ast, gp),
    tov: per(line.tov, gp),
    stl: per(line.stl, gp),
    blk: per(line.blk, gp),
    pf: per(line.pf, gp),
    pts: per(line.pts, gp),
  };
}

export function mergeLines(lines: PlayerSeasonLine[]): PlayerSeasonLine | null {
  if (!lines.length) return null;
  const base = lines[0]!;
  const sum = { ...base };
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]!;
    sum.gp += l.gp;
    sum.gs += l.gs;
    sum.min += l.min;
    sum.fg += l.fg;
    sum.fga += l.fga;
    sum.tp += l.tp;
    sum.tpa += l.tpa;
    sum.ft += l.ft;
    sum.fta += l.fta;
    sum.orb += l.orb;
    sum.drb += l.drb;
    sum.trb += l.trb;
    sum.ast += l.ast;
    sum.tov += l.tov;
    sum.stl += l.stl;
    sum.blk += l.blk;
    sum.pf += l.pf;
    sum.pts += l.pts;
  }
  sum.id = `career-${base.playerId}-${base.level}`;
  return sum;
}

export function formatPct(v: number | null): string {
  if (v == null) return '—';
  return (v * 100).toFixed(1);
}

export function formatStat(v: number, digits = 1): string {
  return v.toFixed(digits);
}
