import { CareerSettings, PlayerBuild, Ratings } from './models';
import { applyStarPreset } from './starPresets';
import { heightToHgt } from './traits';

export const defaultRatings = (): Ratings => ({
  hgt: heightToHgt(77),
  stre: 50,
  spd: 54,
  jmp: 52,
  endu: 52,
  ins: 50,
  dnk: 52,
  ft: 52,
  fg: 52,
  tp: 50,
  oiq: 52,
  diq: 50,
  drb: 52,
  pss: 48,
  reb: 44,
});

export const defaultPlayer = (): PlayerBuild => {
  const base: PlayerBuild = {
    name: 'Jordan Ellis',
    birthplace: 'Akron, OH',
    homeRegion: 'Midwest',
    highSchool: 'St. Vincent-St. Mary',
    position: 'SG',
    secondaryPosition: 'SF',
    heightInches: 77,
    weightPounds: 205,
    wingspanInches: 81,
    dominantHand: 'Right',
    jerseyNumber: 23,
    appearance: 'athletic-build',
    playStyle: 'Three-level scorer',
    personality: 'Grinder',
    careerPriorities: ['Winning', 'Development'],
    intendedStars: 3,
    traitIds: [],
    ratings: defaultRatings(),
  };
  return applyStarPreset(base, 3);
};

export const defaultSettings = (): CareerSettings => ({
  careerName: 'My Career',
  seed: crypto.randomUUID(),
  difficulty: 'balanced',
  simulationRealism: 'balanced',
  progressionRate: 1,
  regressionRate: 1,
  injuryFrequency: 1,
  injurySeverity: 1,
  fatigueImpact: 1,
  trainingEffectiveness: 1,
  tradeFrequency: 1,
  tradeRequestDifficulty: 1,
  contractDifficulty: 1,
  collegeSeasonLength: 32,
  proSeasonLength: 82,
  boxScoreRetentionYears: 3,
  playIn: true,
  salaryCap: true,
  draftRules: 'twoRound',
  transferRules: 'portal',
  eventFrequency: 1,
  autosaveFrequency: 'afterEveryGame',
  interruptOnInjury: true,
  interruptOnRoleChange: true,
  interruptOnDecisions: true,
  newsFrequency: 1,
  godMode: false,
});
