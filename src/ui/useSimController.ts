import { useRef, useState } from 'react';
import { CareerSave, GameLog } from '../domain/models';
import { persistSimulationStep } from '../persistence/db';
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
  | { mode: 'until'; completedGames: number };

function completedCount(save: CareerSave): number {
  return save.schedule.filter((g) => g.completed).length;
}

function planSim(career: CareerSave, target: SimTarget): SimPlan {
  const isPro = career.phase === 'professional';
  const seasonLen = Math.max(
    career.schedule.length,
    isPro ? career.settings.proSeasonLength : career.settings.collegeSeasonLength,
    1,
  );

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
      // College: near end of regular season; NBA: late regular season.
      return {
        mode: 'until',
        completedGames: isPro
          ? Math.min(70, Math.floor(seasonLen * 0.85))
          : Math.max(1, seasonLen - 3),
      };
    case 'season':
      return { mode: 'batch', count: 999 };
  }
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
    if (plan.mode === 'until' && completedCount(career) >= plan.completedGames) {
      return;
    }

    pauseRef.current = false;
    setIsSim(true);
    let next = career;
    let steps = 0;

    while (!pauseRef.current) {
      if (plan.mode === 'batch' && steps >= plan.count) break;
      if (plan.mode === 'until' && completedCount(next) >= plan.completedGames) break;

      const remaining = next.schedule.filter((g) => !g.completed).length;
      if (remaining === 0) {
        const result = simulateNextGame(next);
        await persistSimulationStep(result.save, result.log);
        next = result.save;
        setCareer(next);
        setLogs((l) => [result.log, ...l]);
        break;
      }

      const result = simulateNextGame(next);
      await persistSimulationStep(result.save, result.log);
      next = result.save;
      setCareer(next);
      setLogs((l) => [result.log, ...l]);
      steps += 1;

      if (next.phase === 'seasonReview' || next.phase === 'draft') break;
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
