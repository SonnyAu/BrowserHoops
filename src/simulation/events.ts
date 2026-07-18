import { nbaPlayers } from '../data/nbaPlayers';
import { CareerSave, GameLog, SeasonEvent } from '../domain/models';
import { Rng } from '../domain/rng';

function leaguePool(save: CareerSave) {
  return save.leagueRoster?.length ? save.leagueRoster : nbaPlayers;
}

const MAX_EVENTS = 80;

export function pushSeasonEvents(save: CareerSave, events: SeasonEvent[]): CareerSave {
  if (!events.length) return save;
  const seasonEvents = [...events, ...(save.seasonEvents ?? [])].slice(0, MAX_EVENTS);
  return { ...save, seasonEvents };
}

export function eventFromHugeGame(
  save: CareerSave,
  log: GameLog,
  oppStarLine: string | null,
): SeasonEvent[] {
  const out: SeasonEvent[] = [];
  const { points: pts, rebounds: reb, assists: ast, minutes } = log;
  if (minutes <= 0) {
    if (oppStarLine && /([3-9]\d)\s*pts/.test(oppStarLine)) {
      out.push({
        id: crypto.randomUUID(),
        gameNumber: log.gameNumber,
        kind: 'huge_game',
        headline: oppStarLine,
        detail: `vs ${log.opponent}`,
      });
    }
    return out;
  }

  const triple = pts >= 10 && reb >= 10 && ast >= 10;
  if (pts >= 40) {
    out.push({
      id: crypto.randomUUID(),
      gameNumber: log.gameNumber,
      kind: 'huge_game',
      headline: `${save.player.name} drops ${pts} points`,
      detail: `${log.result} vs ${log.opponent} · ${pts}/${reb}/${ast}`,
    });
  } else if (triple) {
    out.push({
      id: crypto.randomUUID(),
      gameNumber: log.gameNumber,
      kind: 'huge_game',
      headline: `${save.player.name} records a triple-double`,
      detail: `${pts}/${reb}/${ast} vs ${log.opponent}`,
    });
  } else if (pts >= 30 || (pts >= 20 && reb >= 15) || (pts >= 20 && ast >= 12)) {
    out.push({
      id: crypto.randomUUID(),
      gameNumber: log.gameNumber,
      kind: 'huge_game',
      headline: `${save.player.name} goes for ${pts}/${reb}/${ast}`,
      detail: `${log.result} vs ${log.opponent}`,
    });
  }

  if (oppStarLine) {
    const m = oppStarLine.match(/(\d+)\s*pts/);
    const oppPts = m ? Number(m[1]) : 0;
    if (oppPts >= 30) {
      out.push({
        id: crypto.randomUUID(),
        gameNumber: log.gameNumber,
        kind: 'huge_game',
        headline: oppStarLine,
        detail: `Opponent spotlight vs ${save.player.name}`,
      });
    }
  }
  return out;
}

export function maybeAllStarEvents(save: CareerSave, gameNumber: number): SeasonEvent[] {
  if (save.phase !== 'professional') return [];
  if (gameNumber !== 45) return [];
  if ((save.seasonEvents ?? []).some((e) => e.kind === 'all_star' && e.gameNumber === 45)) {
    return [];
  }

  const logs = save.seasonLogBuffer.filter((l) => l.minutes > 0);
  const gp = logs.length || 1;
  const ppg = logs.reduce((s, l) => s + l.points, 0) / gp;
  const mpg = logs.reduce((s, l) => s + l.minutes, 0) / gp;
  const out: SeasonEvent[] = [];

  if (ppg >= 18 && mpg >= 28) {
    out.push({
      id: crypto.randomUUID(),
      gameNumber,
      kind: 'all_star',
      headline: `${save.player.name} named an All-Star`,
      detail: `${ppg.toFixed(1)} PPG · ${mpg.toFixed(1)} MPG`,
    });
  } else {
    const stars = [...leaguePool(save)].sort((a, b) => b.overall - a.overall).slice(0, 3);
    out.push({
      id: crypto.randomUUID(),
      gameNumber,
      kind: 'all_star',
      headline: `All-Star starters announced`,
      detail: stars.map((p) => p.name).join(', '),
    });
  }
  return out;
}

export function maybeHofEvent(save: CareerSave, gameNumber: number, seed: string): SeasonEvent[] {
  if (save.phase !== 'professional') return [];
  if (gameNumber < 50 || gameNumber % 17 !== 0) return [];
  const rng = new Rng(`${seed}:hof:${save.season}:${gameNumber}`);
  if (rng.next() > 0.35) return [];
  const veterans = leaguePool(save).filter((p) => p.overall >= 80).slice(0, 40);
  if (!veterans.length) return [];
  const pick = rng.pick(veterans);
  return [
    {
      id: crypto.randomUUID(),
      gameNumber,
      kind: 'hof',
      headline: `${pick.name} announces retirement`,
      detail: 'Hall of Fame case already locked in the eyes of many',
    },
  ];
}

export function maybeNewsEvent(save: CareerSave, gameNumber: number, seed: string): SeasonEvent[] {
  const freq = save.settings.newsFrequency ?? 1;
  const rng = new Rng(`${seed}:news:${save.season}:${gameNumber}`);
  if (rng.next() > 0.12 * freq) return [];
  const blurbs =
    save.phase === 'professional'
      ? [
          'Trade rumors swirl around the deadline window',
          'League notes: load management debates continue',
          'Western Conference race tightens mid-stretch',
        ]
      : [
          'Conference race heating up in non-conference shakeouts',
          'Scouts flock to midweek primetime matchups',
          'Transfer portal whispers pick up around campus',
        ];
  return [
    {
      id: crypto.randomUUID(),
      gameNumber,
      kind: 'news',
      headline: rng.pick(blurbs),
    },
  ];
}

export function awardEvents(
  save: CareerSave,
  awards: { type: string }[],
): SeasonEvent[] {
  return awards.map((a) => ({
    id: crypto.randomUUID(),
    gameNumber: save.nextGame,
    kind: 'award' as const,
    headline: `${save.player.name} — ${a.type}`,
    detail: `Season ${save.season}`,
  }));
}
