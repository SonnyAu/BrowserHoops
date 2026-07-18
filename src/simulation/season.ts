import { getCollege } from '../data/colleges';
import { getProTeam } from '../data/nbaTeams';
import {
  buildCollegeRoster,
  draftYearForCollegeSeason,
} from '../domain/createCareer';
import { overall, scoutedPotential } from '../domain/derived';
import { CareerSave } from '../domain/models';
import { clearAllSeasonXp, mergeCollegeRoster } from './development';
import {
  buildCollegeSchedule,
  buildProSchedule,
  initialCollegeStandings,
  initialProStandings,
} from './schedule';

function resetSeasonFields(save: CareerSave): Pick<
  CareerSave,
  | 'ratingsAtSeasonStart'
  | 'ovrAtSeasonStart'
  | 'potAtSeasonStart'
  | 'roleAtSeasonStart'
  | 'seasonLogBuffer'
  | 'seasonEvents'
  | 'seasonXp'
  | 'wins'
  | 'losses'
  | 'fatigue'
  | 'nextGame'
  | 'seasonStage'
  | 'bracket'
> {
  return {
    ratingsAtSeasonStart: { ...save.player.ratings },
    ovrAtSeasonStart: overall(save.player),
    potAtSeasonStart: scoutedPotential(save.player, save.hidden),
    roleAtSeasonStart: save.role,
    seasonLogBuffer: [],
    seasonEvents: [],
    seasonXp: 0,
    wins: 0,
    losses: 0,
    fatigue: 5,
    nextGame: 1,
    seasonStage: 'regular',
    bracket: null,
  };
}

export function startNextCollegeSeason(save: CareerSave): CareerSave {
  const collegeId = save.collegeId!;
  const college = getCollege(collegeId)!;
  const nextSeason = save.season + 1;
  const draftYear = draftYearForCollegeSeason(nextSeason);
  const schedule = buildCollegeSchedule(
    collegeId,
    save.settings.collegeSeasonLength,
    `${save.settings.seed}:y${nextSeason}`,
    draftYear,
  );
  const fresh = buildCollegeRoster(collegeId, draftYear);
  const collegeRoster = mergeCollegeRoster(save.collegeRoster ?? [], fresh, draftYear);
  // Age already applied in offseason development — do not age again.
  let next: CareerSave = {
    ...save,
    phase: 'college',
    season: nextSeason,
    draftYear,
    collegeRoster,
    schedule,
    standings: initialCollegeStandings(collegeId),
    draftBoard: null,
    pendingDecisions: [],
    history: [
      ...save.history,
      `Returned for college season ${nextSeason} (${draftYear} draft class on campus)`,
      ...(collegeRoster.length
        ? [`Teammates: ${collegeRoster.slice(0, 3).map((m) => m.name).join(', ')}`]
        : []),
    ],
    updatedAt: new Date().toISOString(),
    ...resetSeasonFields(save),
  };
  return clearAllSeasonXp(next);
}

export function startNextProSeason(save: CareerSave): CareerSave {
  const teamId = save.proTeamId!;
  const team = getProTeam(teamId)!;
  const schedule = buildProSchedule(
    teamId,
    Math.min(82, save.settings.proSeasonLength),
    `${save.settings.seed}:pro${save.season + 1}`,
  );
  const teamName = `${team.region} ${team.name}`;
  // Age already applied in offseason development.
  let next: CareerSave = {
    ...save,
    phase: 'professional',
    season: save.season + 1,
    schedule,
    standings: initialProStandings(teamId),
    draftBoard: null,
    collegeRoster: [],
    pendingDecisions: [],
    history: [...save.history, `Pro season ${save.season + 1} with ${teamName}`],
    updatedAt: new Date().toISOString(),
    ...resetSeasonFields(save),
  };
  return clearAllSeasonXp(next);
}
