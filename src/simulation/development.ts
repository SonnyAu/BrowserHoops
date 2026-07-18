import { nbaPlayers } from '../data/nbaPlayers';
import { overall, overallFromRatings } from '../domain/derived';

/** Keep in sync with createCareer.LEAGUE_START_SEASON */
const LEAGUE_START_SEASON = 2026;
import {
  AttrKey,
  CareerSave,
  CollegeRosterMate,
  DevelopablePlayer,
  LeaguePlayer,
  Ratings,
  TrainingFocus,
  spendableAttrKeys,
} from '../domain/models';
import { Rng } from '../domain/rng';

export const XP_PER_POINT = 42;
export const SEASON_XP_SOFT_CAP = 520;

const FOCUS_MAP: Record<TrainingFocus, AttrKey[]> = {
  shooting: ['fg', 'tp', 'ft'],
  finishing: ['ins', 'dnk'],
  playmaking: ['pss', 'drb', 'oiq'],
  defense: ['diq', 'spd'],
  rebounding: ['reb', 'stre', 'jmp'],
  athleticism: ['spd', 'jmp', 'stre'],
  iq: ['oiq', 'diq'],
  conditioning: ['endu'],
  recovery: ['endu'],
  balanced: [...spendableAttrKeys],
};

const ATHLETIC: AttrKey[] = ['spd', 'jmp', 'endu', 'dnk'];

export function ageFactor(age: number, peakMin: number, peakMax: number): number {
  if (age < peakMin - 4) return 1.15;
  if (age < peakMin) return 1.05;
  if (age <= peakMax) return 0.95;
  if (age <= peakMax + 3) return 0.55;
  return 0.25;
}

export function accrueSeasonXp(
  currentXp: number,
  ctx: {
    minutes: number;
    usage: number;
    performance: number;
    roleTargetMinutes: number;
    progressionRate: number;
    trainingMult?: number;
    workEthic: number;
  },
): number {
  const statusFit =
    ctx.roleTargetMinutes > 0
      ? Math.min(1.35, Math.max(0.45, ctx.minutes / ctx.roleTargetMinutes))
      : 0.8;
  const perf = Math.min(1.5, Math.max(0.5, ctx.performance));
  const train = ctx.trainingMult ?? 1;
  const work = ctx.workEthic / 100;
  const base = (2.2 + ctx.minutes * 0.12 + ctx.usage * 14) * train * work * ctx.progressionRate;
  const delta = base * (0.7 + 0.5 * statusFit) * (0.85 + 0.3 * perf);
  return Math.min(SEASON_XP_SOFT_CAP, Math.round(currentXp + delta));
}

/** Proxy minutes/usage for NPC players from overall. */
export function proxyPlayingTime(overall: number): { minutes: number; usage: number; roleTarget: number } {
  if (overall >= 88) return { minutes: 34, usage: 0.3, roleTarget: 34 };
  if (overall >= 82) return { minutes: 30, usage: 0.24, roleTarget: 30 };
  if (overall >= 76) return { minutes: 26, usage: 0.2, roleTarget: 26 };
  if (overall >= 70) return { minutes: 20, usage: 0.16, roleTarget: 20 };
  if (overall >= 64) return { minutes: 14, usage: 0.13, roleTarget: 14 };
  return { minutes: 8, usage: 0.1, roleTarget: 10 };
}

export function defaultDevMeta(overall: number, truePotential: number): {
  workEthic: number;
  volatility: number;
  peakAgeMin: number;
  peakAgeMax: number;
} {
  return {
    workEthic: Math.min(95, Math.max(55, 60 + Math.round((truePotential - overall) * 0.8))),
    volatility: Math.min(70, Math.max(20, 45 + (truePotential - overall))),
    peakAgeMin: 25,
    peakAgeMax: 29,
  };
}

export function cloneLeagueRoster(calendarYear = LEAGUE_START_SEASON): LeaguePlayer[] {
  return nbaPlayers.map((p) => {
    const truePot = p.truePotential ?? p.potential ?? p.overall + 4;
    const meta = defaultDevMeta(p.overall, truePot);
    return {
      ...p,
      ratings: { ...p.ratings },
      age: Math.max(19, calendarYear - p.bornYear),
      seasonXp: 0,
      truePotential: truePot,
      workEthic: meta.workEthic,
      volatility: meta.volatility,
      peakAgeMin: meta.peakAgeMin,
      peakAgeMax: meta.peakAgeMax,
    };
  });
}

export function ensureLeagueRoster(save: CareerSave): CareerSave {
  if (save.leagueRoster?.length) return save;
  return { ...save, leagueRoster: cloneLeagueRoster(LEAGUE_START_SEASON + save.season - 1) };
}

function toDevelopableFromLeague(p: LeaguePlayer): DevelopablePlayer {
  const truePot = p.truePotential ?? p.potential ?? p.overall + 4;
  const meta = defaultDevMeta(p.overall, truePot);
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    ratings: { ...p.ratings },
    overall: p.overall,
    age: p.age ?? Math.max(19, LEAGUE_START_SEASON - p.bornYear),
    truePotential: truePot,
    seasonXp: p.seasonXp ?? 0,
    workEthic: p.workEthic ?? meta.workEthic,
    volatility: p.volatility ?? meta.volatility,
    peakAgeMin: p.peakAgeMin ?? meta.peakAgeMin,
    peakAgeMax: p.peakAgeMax ?? meta.peakAgeMax,
  };
}

function fromDevelopableToLeague(base: LeaguePlayer, d: DevelopablePlayer): LeaguePlayer {
  return {
    ...base,
    ratings: d.ratings,
    overall: d.overall,
    potential: Math.max(d.overall, Math.min(99, d.truePotential)),
    truePotential: d.truePotential,
    age: d.age,
    seasonXp: d.seasonXp,
    workEthic: d.workEthic,
    volatility: d.volatility,
    peakAgeMin: d.peakAgeMin,
    peakAgeMax: d.peakAgeMax,
  };
}

export function developPlayer(
  player: DevelopablePlayer,
  ctx: {
    seasonGrade: number;
    progressionRate: number;
    regressionRate: number;
    rng: Rng;
    focusAttrs?: AttrKey[];
  },
): { player: DevelopablePlayer; summary: string } {
  const af = ageFactor(player.age, player.peakAgeMin, player.peakAgeMax);
  const room = Math.max(0, player.truePotential - player.overall);
  const xpPower = player.seasonXp / XP_PER_POINT;
  const luck = (0.85 + ctx.rng.next() * 0.3) * (1 + player.volatility / 400);
  const grade = Math.min(1.4, Math.max(0.45, ctx.seasonGrade));
  let points = Math.round(xpPower * af * grade * luck * ctx.progressionRate);

  // Ceiling: can't explode past remaining room (+ small overflow for regression cases)
  if (room <= 0 && player.age <= player.peakAgeMax) points = Math.min(points, 1);
  else points = Math.min(points, Math.max(0, room + 2));

  let ratings: Ratings = { ...player.ratings };
  const focus = ctx.focusAttrs?.length ? ctx.focusAttrs : [...spendableAttrKeys];
  const weak = [...spendableAttrKeys].sort((a, b) => ratings[a] - ratings[b]);
  const spendOrder = [...new Set([...focus.filter((k) => k !== 'hgt'), ...weak])];

  let grown = 0;
  for (let i = 0; i < points; i++) {
    const key = spendOrder[i % spendOrder.length];
    if (ratings[key] >= 99) continue;
    if (overallFromRatings(ratings, player.position) >= player.truePotential && ctx.rng.next() > 0.25) {
      continue;
    }
    ratings[key] += 1;
    grown += 1;
  }

  let regressed = 0;
  const pastPeak = player.age > player.peakAgeMax;
  const badSeason = grade < 0.75 && player.age >= player.peakAgeMin;
  if (pastPeak || badSeason) {
    const regPoints = Math.round(
      (pastPeak ? 2 + (player.age - player.peakAgeMax) : 1) *
        ctx.regressionRate *
        (badSeason ? 1.3 : 1) *
        (1.1 - af),
    );
    for (let i = 0; i < regPoints; i++) {
      const key = ctx.rng.pick(ATHLETIC);
      if (ratings[key] > 25) {
        ratings[key] -= 1;
        regressed += 1;
      }
    }
  }

  const nextOverall = overallFromRatings(ratings, player.position);
  const next: DevelopablePlayer = {
    ...player,
    ratings,
    overall: nextOverall,
    age: player.age + 1,
    seasonXp: 0,
  };
  const delta = nextOverall - player.overall;
  const summary =
    delta === 0 && !grown && !regressed
      ? `${player.name}: flat offseason (${next.age})`
      : `${player.name}: ${delta >= 0 ? '+' : ''}${delta} OVR (${grown}+ / ${regressed}− attrs) · age ${next.age}`;
  return { player: next, summary };
}

export function seasonGradeFromXp(seasonXp: number, gamesPlayed: number): number {
  const expected = Math.max(1, gamesPlayed) * 6;
  return Math.min(1.4, Math.max(0.5, seasonXp / expected));
}

export function seasonGradeFromUserLogs(save: CareerSave): number {
  const logs = save.seasonLogBuffer.filter((l) => l.minutes > 0);
  if (!logs.length) return seasonGradeFromXp(save.seasonXp ?? 0, 1);
  const gp = logs.length;
  const ppg = logs.reduce((s, l) => s + l.points, 0) / gp;
  const mpg = logs.reduce((s, l) => s + l.minutes, 0) / gp;
  const target = Math.max(8, save.minutes);
  const statusFit = mpg / target;
  const prod = ppg / Math.max(8, target * 0.45);
  return Math.min(1.4, Math.max(0.5, 0.55 + 0.35 * statusFit + 0.35 * Math.min(1.2, prod)));
}

/** Accrue XP for user, college mates, and full NBA pack after a game. */
export function accrueXpAfterGame(
  save: CareerSave,
  ctx: {
    userMinutes: number;
    userUsage: number;
    userPerformance: number;
    teamWon: boolean;
    trainingMult: number;
  },
): CareerSave {
  let next = ensureLeagueRoster(save);
  const prog = next.settings.progressionRate;
  const userXp = accrueSeasonXp(next.seasonXp ?? 0, {
    minutes: ctx.userMinutes,
    usage: ctx.userUsage,
    performance: ctx.userPerformance,
    roleTargetMinutes: Math.max(8, next.minutes),
    progressionRate: prog,
    trainingMult: ctx.trainingMult,
    workEthic: next.hidden.workEthic,
  });

  const mates = (next.collegeRoster ?? []).map((m) => {
    const pt = proxyPlayingTime(m.overall);
    const perf = 0.85 + (ctx.teamWon ? 0.1 : 0) + (m.overall - 70) / 200;
    return {
      ...m,
      seasonXp: accrueSeasonXp(m.seasonXp ?? 0, {
        minutes: pt.minutes,
        usage: pt.usage,
        performance: perf,
        roleTargetMinutes: pt.roleTarget,
        progressionRate: prog,
        workEthic: m.workEthic,
      }),
    };
  });

  const leagueRoster = (next.leagueRoster ?? []).map((p) => {
    const ovr = p.overall;
    const pt = proxyPlayingTime(ovr);
    // Slightly less XP per user-game for league (they play many games; we only tick on user sims)
    const scale = 0.55;
    const perf = 0.8 + (ctx.teamWon ? 0.08 : 0) + (ovr - 72) / 180;
    const meta = defaultDevMeta(ovr, p.truePotential ?? p.potential ?? ovr + 4);
    const xp = accrueSeasonXp(p.seasonXp ?? 0, {
      minutes: pt.minutes * scale,
      usage: pt.usage,
      performance: perf,
      roleTargetMinutes: pt.roleTarget,
      progressionRate: prog,
      workEthic: p.workEthic ?? meta.workEthic,
    });
    return { ...p, seasonXp: xp };
  });

  return {
    ...next,
    seasonXp: userXp,
    collegeRoster: mates,
    leagueRoster,
  };
}

export function applyOffseasonDevelopment(save: CareerSave): CareerSave {
  let next = ensureLeagueRoster(save);
  const rng = new Rng(`${next.settings.seed}:offseason:${next.season}:${next.id}`);
  const logs: string[] = [];
  const focus = FOCUS_MAP[next.trainingFocus] ?? spendableAttrKeys;

  // User
  const userDev: DevelopablePlayer = {
    id: 'user',
    name: next.player.name,
    position: next.player.position,
    ratings: { ...next.player.ratings },
    overall: overall(next.player),
    age: next.age,
    truePotential: next.hidden.truePotential,
    seasonXp: next.seasonXp ?? 0,
    workEthic: next.hidden.workEthic,
    volatility: next.hidden.volatility,
    peakAgeMin: next.hidden.peakAgeMin,
    peakAgeMax: next.hidden.peakAgeMax,
  };
  const userResult = developPlayer(userDev, {
    seasonGrade: seasonGradeFromUserLogs(next),
    progressionRate: next.settings.progressionRate,
    regressionRate: next.settings.regressionRate,
    rng,
    focusAttrs: focus,
  });
  logs.push(userResult.summary);

  // College mates
  const collegeRoster = (next.collegeRoster ?? []).map((m) => {
    const d = developPlayer(
      {
        id: m.id,
        name: m.name,
        position: m.position,
        ratings: { ...m.ratings },
        overall: m.overall,
        age: m.age,
        truePotential: m.truePotential,
        seasonXp: m.seasonXp ?? 0,
        workEthic: m.workEthic,
        volatility: m.volatility,
        peakAgeMin: m.peakAgeMin,
        peakAgeMax: m.peakAgeMax,
      },
      {
        seasonGrade: seasonGradeFromXp(m.seasonXp ?? 0, next.settings.collegeSeasonLength),
        progressionRate: next.settings.progressionRate,
        regressionRate: next.settings.regressionRate,
        rng,
      },
    );
    if (Math.abs(d.player.overall - m.overall) >= 2) logs.push(d.summary);
    return {
      ...m,
      ...d.player,
      draftYear: m.draftYear,
    } as CollegeRosterMate;
  });

  // Full NBA pack
  const leagueRoster = (next.leagueRoster ?? []).map((p) => {
    const before = toDevelopableFromLeague(p);
    const d = developPlayer(before, {
      seasonGrade: seasonGradeFromXp(before.seasonXp, next.settings.proSeasonLength * 0.55),
      progressionRate: next.settings.progressionRate,
      regressionRate: next.settings.regressionRate,
      rng,
    });
    if (Math.abs(d.player.overall - before.overall) >= 3) logs.push(d.summary);
    return fromDevelopableToLeague(p, d.player);
  });

  const notable = logs.slice(0, 12);
  return {
    ...next,
    player: { ...next.player, ratings: userResult.player.ratings },
    age: userResult.player.age,
    seasonXp: 0,
    collegeRoster,
    leagueRoster,
    hidden: {
      ...next.hidden,
      // peak ages stay; true potential unchanged
    },
    developmentLog: [...notable, ...(next.developmentLog ?? [])].slice(0, 40),
    history: [...next.history, `Offseason development: ${userResult.summary}`],
  };
}

export function clearAllSeasonXp(save: CareerSave): CareerSave {
  return {
    ...save,
    seasonXp: 0,
    collegeRoster: (save.collegeRoster ?? []).map((m) => ({ ...m, seasonXp: 0 })),
    leagueRoster: (save.leagueRoster ?? []).map((p) => ({ ...p, seasonXp: 0 })),
  };
}

/** Carry grown teammates into next college year; fill gaps from prospect pack. */
export function mergeCollegeRoster(
  grown: CollegeRosterMate[],
  fresh: CollegeRosterMate[],
  draftYear: number,
): CollegeRosterMate[] {
  const kept = grown.filter((m) => m.draftYear >= draftYear);
  const map = new Map<string, CollegeRosterMate>();
  for (const p of fresh) map.set(p.id, { ...p, seasonXp: 0 });
  for (const p of kept) map.set(p.id, { ...p, seasonXp: 0 });
  return [...map.values()].sort((a, b) => b.overall - a.overall);
}
