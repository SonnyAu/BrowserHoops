import { useRef, useState } from 'react';
import { CareerSave, GameLog } from '../domain/models';
import { persistSimulationStep, pruneLeagueGames } from '../persistence/db';
import { simulateNextGame } from '../simulation/game';

export type SimTarget =
  | 'one game'
  | 'week'
  | 'month'
  | 'all-star break'
  | 'trade deadline'
  | 'playoffs'
  | 'season';

/** NBA milestones — college has no All-Star break or trade deadline. */
export const PRO_SIM_TARGETS: SimTarget[] = [
  'one game',
  'week',
  'month',
  'all-star break',
  'trade deadline',
  'playoffs',
  'season',
];

/** College / non-pro — shorter season, no All-Star or trade deadline. */
export const COLLEGE_SIM_TARGETS: SimTarget[] = [
  'one game',
  'week',
  'month',
  'playoffs',
  'season',
];

export function simTargetsForCareer(career: CareerSave): SimTarget[] {
  return career.phase === 'professional' ? PRO_SIM_TARGETS : COLLEGE_SIM_TARGETS;
}

type SimPlan =
  | { mode: 'batch'; count: number }
  | { mode: 'until'; completedGames: number }
  | { mode: 'untilPlayoffs' }
  | { mode: 'untilSeasonEnd' };

function regularCompleted(save: CareerSave): number {
  return save.schedule.filter((g) => g.completed && (g.stage ?? 'regular') === 'regular').length;
}

function regularLength(save: CareerSave): number {
  const isPro = save.phase === 'professional';
  return Math.max(
    save.schedule.filter((g) => (g.stage ?? 'regular') === 'regular').length,
    isPro ? save.settings.proSeasonLength : save.settings.collegeSeasonLength,
    1,
  );
}

function planSim(career: CareerSave, target: SimTarget): SimPlan {
  const isPro = career.phase === 'professional';
  const seasonLen = regularLength(career);

  switch (target) {
    case 'one game':
      return { mode: 'batch', count: 1 };
    case 'week':
      return { mode: 'batch', count: isPro ? 3 : 2 };
    case 'month':
      return { mode: 'batch', count: isPro ? 8 : 6 };
    case 'all-star break':
      return { mode: 'until', completedGames: Math.min(45, Math.floor(seasonLen * 0.55)) };
    case 'trade deadline':
      return { mode: 'until', completedGames: Math.min(55, Math.floor(seasonLen * 0.67)) };
    case 'playoffs':
      return { mode: 'untilPlayoffs' };
    case 'season':
      return { mode: 'untilSeasonEnd' };
  }
}

function inPostseason(save: CareerSave): boolean {
  const stage = save.seasonStage ?? 'regular';
  return stage === 'playIn' || stage === 'playoffs' || stage === 'tournament' || stage === 'complete';
}

export function useSimController(
  career: CareerSave | undefined,
  setCareer: (c: CareerSave) => void,
  setLogs: (fn: (logs: GameLog[]) => GameLog[]) => void,
) {
  const [isSim, setIsSim] = useState(false);
  const pauseRef = useRef(false);

  async function sim(target: SimTarget) {
    if (!career || isSim || career.retired) return;
    if (career.phase === 'seasonReview') {
      alert('Review the completed season before continuing.');
      return;
    }
    if (career.phase === 'draft') {
      alert('Finish draft night before simulating.');
      return;
    }
    if (career.pendingDecisions.some((d) => d.interrupt)) {
      alert('Resolve pending decisions before simulating.');
      return;
    }
    if (career.phase !== 'professional' && (target === 'all-star break' || target === 'trade deadline')) {
      return;
    }

    const plan = planSim(career, target);
    if (plan.mode === 'until' && regularCompleted(career) >= plan.completedGames) {
      return;
    }
    if (plan.mode === 'untilPlayoffs' && inPostseason(career)) {
      return;
    }

    pauseRef.current = false;
    setIsSim(true);
    let next = career;
    let steps = 0;

    while (!pauseRef.current) {
      if (plan.mode === 'batch' && steps >= plan.count) break;
      if (plan.mode === 'until' && regularCompleted(next) >= plan.completedGames) break;
      if (plan.mode === 'untilPlayoffs' && inPostseason(next)) break;
      if (plan.mode === 'untilSeasonEnd' && next.phase === 'seasonReview') break;

      const result = simulateNextGame(next);
      await persistSimulationStep(result.save, result.log, result.leagueGames);
      next = result.save;
      setCareer(next);
      if (result.log.minutes > 0 || result.log.opponent === 'Season Complete' || result.log.playoffs) {
        setLogs((l) => [result.log, ...l]);
      }
      steps += 1;

      if (next.phase === 'seasonReview') {
        const years = next.settings.boxScoreRetentionYears ?? 3;
        await pruneLeagueGames(next.id, next.season, years);
        break;
      }
      if (next.phase === 'draft') break;
      if (next.pendingDecisions.some((d) => d.interrupt)) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    setIsSim(false);
  }

  function pause() {
    pauseRef.current = true;
    setIsSim(false);
  }

  return { isSim, sim, pause };
}
