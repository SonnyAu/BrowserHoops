import { overall } from '../domain/derived';
import { CareerSave } from '../domain/models';

export type SeasonAward = { season: number; type: string; level: 'college' | 'pro' };

function ppg(save: CareerSave): number {
  const logs = save.seasonLogBuffer.filter((l) => l.minutes > 0);
  if (!logs.length) return 0;
  return logs.reduce((s, l) => s + l.points, 0) / logs.length;
}

function mpg(save: CareerSave): number {
  const logs = save.seasonLogBuffer.filter((l) => l.minutes > 0);
  if (!logs.length) return 0;
  return logs.reduce((s, l) => s + l.minutes, 0) / logs.length;
}

function winPct(save: CareerSave): number {
  const g = save.wins + save.losses;
  return g ? save.wins / g : 0;
}

/** Grant college or NBA awards for the completed season. */
export function grantSeasonAwards(save: CareerSave): { awards: SeasonAward[]; history: string[] } {
  const isPro = Boolean(save.proTeamId);
  const level: 'college' | 'pro' = isPro ? 'pro' : 'college';
  const season = save.season;
  const pts = ppg(save);
  const min = mpg(save);
  const ovr = overall(save.player);
  const wp = winPct(save);
  const out: SeasonAward[] = [];
  const history: string[] = [];

  const push = (type: string) => {
    out.push({ season, type, level });
    history.push(`Award: ${type}`);
  };

  if (!isPro) {
    if (pts >= 18 && min >= 28 && wp >= 0.55) push('Conference Player of the Year');
    else if (pts >= 15 && min >= 26) push('All-Conference First Team');
    else if (pts >= 12 && min >= 22) push('All-Conference Second Team');
    else if (pts >= 9 && min >= 18) push('All-Conference Honorable Mention');

    if (save.season === 1 && pts >= 11 && min >= 20) push('Freshman of the Year');
    if (pts >= 20 && min >= 30 && ovr >= 78) push('Consensus All-American');
    else if (pts >= 17 && min >= 28 && ovr >= 74) push('All-American Honorable Mention');
    if (pts >= 14 && wp >= 0.6) push('Team MVP');
  } else {
    const isRookie = save.draft != null && save.season <= (save.draft.year ? save.season : 99);
    // First pro season heuristic: careerStats length before finalize append
    const firstPro = save.careerStats.filter((s) => s.level === 'pro').length === 0;
    if (firstPro && pts >= 14 && min >= 26) push('All-Rookie First Team');
    else if (firstPro && pts >= 10 && min >= 20) push('All-Rookie Second Team');

    const prev = save.careerStats.filter((s) => s.level === 'pro').at(-1);
    if (prev && prev.gp > 0) {
      const prevPpg = prev.pts / prev.gp;
      if (pts - prevPpg >= 4 && ovr - save.ovrAtSeasonStart >= 2) push('Most Improved Player');
    }

    if (pts >= 22 && min >= 32 && wp >= 0.45) push('All-Star');
    if (pts >= 26 && min >= 34 && ovr >= 88) push('All-NBA First Team');
    else if (pts >= 20 && min >= 32 && ovr >= 84) push('All-NBA Second Team');
    if (ovr >= 82 && save.player.ratings.diq >= 80 && min >= 28) push('All-Defensive Team');
    if (
      (save.role === 'Sixth Man' || save.role === 'Rotation Player' || min < 26) &&
      pts >= 14 &&
      min >= 18
    ) {
      push('Sixth Man Candidate');
    }
    void isRookie;
  }

  return { awards: out, history };
}
