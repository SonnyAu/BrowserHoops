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

const TARGET_GAMES: Record<SimTarget, number> = {
  'one game': 1,
  week: 3,
  month: 8,
  'all-star break': 45,
  'trade deadline': 55,
  playoffs: 70,
  season: 999,
};

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
    pauseRef.current = false;
    setIsSim(true);
    let next = career;
    const max = TARGET_GAMES[target];
    for (let i = 0; i < max && !pauseRef.current; i++) {
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
