import { z } from 'zod';

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

/** Basketball GM–style attribute keys */
export type AttrKey =
  | 'hgt'
  | 'stre'
  | 'spd'
  | 'jmp'
  | 'endu'
  | 'ins'
  | 'dnk'
  | 'ft'
  | 'fg'
  | 'tp'
  | 'oiq'
  | 'diq'
  | 'drb'
  | 'pss'
  | 'reb';

/** Spendable attributes (height is derived from inches). */
export type SpendableAttrKey = Exclude<AttrKey, 'hgt'>;

export const spendableAttrKeys: SpendableAttrKey[] = [
  'stre',
  'spd',
  'jmp',
  'endu',
  'ins',
  'dnk',
  'ft',
  'fg',
  'tp',
  'oiq',
  'diq',
  'drb',
  'pss',
  'reb',
];

export const allAttrKeys: AttrKey[] = ['hgt', ...spendableAttrKeys];

export const ATTR_LABELS: Record<AttrKey, string> = {
  hgt: 'Height',
  stre: 'Strength',
  spd: 'Speed',
  jmp: 'Jumping',
  endu: 'Endurance',
  ins: 'Inside',
  dnk: 'Dunks/Layups',
  ft: 'Free Throws',
  fg: 'Mid Range',
  tp: 'Three Pointers',
  oiq: 'Offensive IQ',
  diq: 'Defensive IQ',
  drb: 'Dribbling',
  pss: 'Passing',
  reb: 'Rebounding',
};

export const ATTR_GROUPS: { id: string; label: string; keys: AttrKey[] }[] = [
  { id: 'physical', label: 'Physical', keys: ['hgt', 'stre', 'spd', 'jmp', 'endu'] },
  { id: 'shooting', label: 'Shooting', keys: ['ins', 'dnk', 'ft', 'fg', 'tp'] },
  { id: 'skill', label: 'Skill', keys: ['oiq', 'diq', 'drb', 'pss', 'reb'] },
];

export type Ratings = Record<AttrKey, number>;
/** @deprecated alias */
export type RatingKey = AttrKey;
export const ratingKeys = allAttrKeys;

export type Personality = 'Leader' | 'Grinder' | 'Showman' | 'Technician' | 'Competitor';
export type StarTier = 1 | 2 | 3 | 4 | 5;

export type CareerPhase =
  | 'recruiting'
  | 'college'
  | 'seasonReview'
  | 'draft'
  | 'professional'
  | 'retired';

export type TrainingFocus =
  | 'shooting'
  | 'finishing'
  | 'playmaking'
  | 'defense'
  | 'rebounding'
  | 'athleticism'
  | 'iq'
  | 'conditioning'
  | 'recovery'
  | 'balanced';

export type RoleLabel =
  | 'Deep Reserve'
  | 'Developmental Reserve'
  | 'Rotation Player'
  | 'Sixth Man'
  | 'Spot Starter'
  | 'Starter'
  | 'Featured Starter'
  | 'Primary Option'
  | 'Program Star';

export interface PlayerTraitDef {
  id: string;
  name: string;
  summary: string;
  minStars: StarTier;
  pointCost: number;
  bonuses: Partial<Record<AttrKey, number>>;
}

export interface PlayerBuild {
  name: string;
  birthplace: string;
  homeRegion: string;
  highSchool: string;
  position: Position;
  secondaryPosition?: Position;
  heightInches: number;
  weightPounds: number;
  wingspanInches: number;
  dominantHand: 'Left' | 'Right';
  jerseyNumber: number;
  appearance: string;
  playStyle: string;
  personality: Personality;
  careerPriorities: string[];
  intendedStars: StarTier;
  traitIds: string[];
  ratings: Ratings;
}

export interface HiddenDevelopment {
  truePotential: number;
  /** Sticky scout error: displayed pot ≈ clamp(true + bias). */
  potentialBias: number;
  peakAgeMin: number;
  peakAgeMax: number;
  volatility: number;
  workEthic: number;
  injuryResilience: number;
}

export type RosterStatus = 'active' | 'injured' | 'resting' | 'suspended';

export interface CollegeRosterMate {
  id: string;
  name: string;
  position: Position;
  overall: number;
  draftYear: number;
}

export interface CareerSettings {
  careerName: string;
  seed: string;
  difficulty: 'forgiving' | 'balanced' | 'harsh';
  simulationRealism: 'arcade' | 'balanced' | 'sim';
  progressionRate: number;
  regressionRate: number;
  injuryFrequency: number;
  injurySeverity: number;
  fatigueImpact: number;
  trainingEffectiveness: number;
  tradeFrequency: number;
  tradeRequestDifficulty: number;
  contractDifficulty: number;
  collegeSeasonLength: number;
  proSeasonLength: number;
  playIn: boolean;
  salaryCap: boolean;
  draftRules: 'standard' | 'twoRound';
  transferRules: 'portal' | 'restricted';
  eventFrequency: number;
  autosaveFrequency: 'afterEveryGame' | 'weekly';
  interruptOnInjury: boolean;
  interruptOnRoleChange: boolean;
  interruptOnDecisions: boolean;
  newsFrequency: number;
  godMode: boolean;
}

export interface College {
  id: string;
  name: string;
  abbrev: string;
  city: string;
  state: string;
  region: string;
  conference: string;
  colors: [string, string, string?];
  prestige: number;
  preseasonRank: number | null;
  coaching: number;
  development: number;
  recruiting: number;
  facilities: number;
  fanIntensity: number;
  mediaScrutiny: number;
  proExposure: number;
  offensiveStyle: string;
  defensiveStyle: string;
  pace: number;
  recentSuccess: number;
}

export interface ProTeam {
  id: string;
  tid: number;
  region: string;
  name: string;
  abbrev: string;
  colors: [string, string, string?];
  conference: 'East' | 'West';
  division: string;
}

export interface LeaguePlayer {
  id: string;
  name: string;
  tid: number | 'FA';
  position: Position;
  heightInches: number;
  weightPounds: number;
  wingspanInches: number;
  bornYear: number;
  birthplace: string;
  college: string;
  collegeId?: string | null;
  ratings: Ratings;
  traitIds: string[];
  overall: number;
  /** Scouted / displayed potential (may include bias). */
  potential: number;
  potentialBias?: number;
  truePotential?: number;
  contractAmount: number;
  contractExp: number;
  draftYear: number;
  draftRound: number;
  draftPick: number;
  draftTid: number;
}

/** Pre-draft college prospect from league pack. */
export type DraftProspect = LeaguePlayer;

export interface SimilarityRef {
  id: string;
  name: string;
  position: Position;
  offensive: number[];
  defensive: number[];
  physical: number[];
}

export interface RecruitingProfile {
  nationalRank: number;
  positionalRank: number;
  stateRank: number;
  stars: StarTier;
  highSchoolStats: { ppg: number; rpg: number; apg: number; spg: number; bpg: number };
  accolades: string[];
  scoutConfidence: number;
  strengths: string[];
  weaknesses: string[];
  summary: string;
}

export interface CollegeOffer {
  collegeId: string;
  scholarship: boolean;
  expectedRole: RoleLabel;
  expectedMinutes: number;
  fitScore: number;
  competition: number;
  scrutiny: number;
  nationalExposure: number;
  draftVisibility: number;
  schemeFit: number;
  pitch: string;
  tradeoff: 'elite' | 'ranked' | 'mid' | 'buildAround';
}

export interface PlayerInjury {
  type: string;
  gamesRemaining: number;
}

export interface PlayerMorale {
  overall: number;
  roleSatisfaction: number;
  coachRelationship: number;
  teammateChemistry: number;
}

export interface PlayerContract {
  amount: number;
  exp: number;
  type: 'rookie' | 'extension' | 'veteran' | 'minimum' | 'none';
  option?: 'team' | 'player' | null;
}

export interface DraftInformation {
  year: number;
  round: number | null;
  pick: number | null;
  tid: number | null;
  undrafted: boolean;
}

export interface DraftBoardPick {
  pick: number;
  round: number;
  teamId: string;
  teamAbbrev: string;
  teamName: string;
  teamColors: [string, string, string?];
  prospectId: string;
  prospectName: string;
  position: Position;
  isUser: boolean;
  revealed: boolean;
}

export interface DraftBoardState {
  picks: DraftBoardPick[];
  currentIndex: number;
  userPick: number | null;
  finished: boolean;
  undrafted: boolean;
}

export interface CareerGoal {
  id: string;
  label: string;
  completed: boolean;
}

export interface SeasonStats {
  season: number;
  level: 'college' | 'pro';
  teamId: string;
  teamName: string;
  gp: number;
  gs: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fg: number;
  fga: number;
  tp: number;
  tpa: number;
  ft: number;
  fta: number;
  playoffs: boolean;
  awards: string[];
}

export interface ScheduledGame {
  id: string;
  gameNumber: number;
  opponentId: string;
  opponentName: string;
  home: boolean;
  completed: boolean;
  result?: 'W' | 'L';
  teamScore?: number;
  opponentScore?: number;
}

export interface StandingRow {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  conference: string;
}

export type SeasonEventKind = 'huge_game' | 'all_star' | 'award' | 'hof' | 'news';

export interface SeasonEvent {
  id: string;
  gameNumber: number;
  kind: SeasonEventKind;
  headline: string;
  detail?: string;
}

export interface PendingDecision {
  id: string;
  type: string;
  title: string;
  body: string;
  choices: { id: string; label: string; effect: string }[];
  interrupt: boolean;
}

export interface GodModeEdit {
  id: string;
  at: string;
  commandType: string;
  summary: string;
  playerId: string;
}

export interface GameLog {
  id: string;
  saveId: string;
  season: number;
  phase: CareerPhase;
  gameNumber: number;
  opponent: string;
  opponentId: string;
  home: boolean;
  result: 'W' | 'L';
  teamScore: number;
  opponentScore: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  minutes: number;
  plusMinus: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  grade: string;
  injuryUpdate?: string;
  createdAt: string;
}

export interface SeasonReview {
  season: number;
  phase: CareerPhase;
  teamName: string;
  record: string;
  statsLine: string;
  awards: string[];
  ratingChange: string;
  roleChange: string;
  narrative: string;
  ovr: number;
  ovrDelta: number;
  pot: number;
  potDelta: number;
  gp: number;
  ppg: number;
  rpg: number;
  apg: number;
  acknowledged: boolean;
}

export interface CareerSave {
  id: string;
  name: string;
  player: PlayerBuild;
  settings: CareerSettings;
  phase: CareerPhase;
  collegeId: string | null;
  proTeamId: string | null;
  recruiting: RecruitingProfile;
  offers: CollegeOffer[];
  recruitingLocked: boolean;
  hidden: HiddenDevelopment;
  season: number;
  nextGame: number;
  schedule: ScheduledGame[];
  standings: StandingRow[];
  /** Newest-first season news / milestones (capped in sim). */
  seasonEvents: SeasonEvent[];
  seasonStats: SeasonStats[];
  careerStats: SeasonStats[];
  gameLogsSummary: string[];
  trainingFocus: TrainingFocus;
  trainingIntensity: 'light' | 'normal' | 'intense';
  secondaryFocus?: TrainingFocus;
  fatigue: number;
  morale: PlayerMorale;
  injury: PlayerInjury;
  coachTrust: number;
  role: RoleLabel;
  roleAtSeasonStart: RoleLabel;
  minutes: number;
  usage: number;
  rosterStatus: RosterStatus;
  collegeRoster: CollegeRosterMate[];
  draftStock: number;
  draft: DraftInformation | null;
  draftBoard: DraftBoardState | null;
  draftYear: number;
  contract: PlayerContract | null;
  goals: CareerGoal[];
  pendingDecisions: PendingDecision[];
  history: string[];
  awards: { season: number; type: string; level: 'college' | 'pro' }[];
  transactions: { season: number; type: string; detail: string }[];
  seasonReviews: SeasonReview[];
  ratingsAtSeasonStart: Ratings;
  ovrAtSeasonStart: number;
  potAtSeasonStart: number;
  customized: boolean;
  godModeLog: GodModeEdit[];
  godModeBackup: CareerSaveSnapshot | null;
  createdAt: string;
  updatedAt: string;
  retired: boolean;
  legacyScore?: number;
  legacySummary?: string;
  age: number;
  wins: number;
  losses: number;
  seasonLogBuffer: GameLog[];
}

export type CareerSaveSnapshot = Omit<CareerSave, 'godModeBackup'>;

export interface CharacterTemplate {
  id: string;
  name: string;
  player: PlayerBuild;
  createdAt: string;
  updatedAt: string;
}

export const ratingSchema = z.number().int().min(0).max(99);
export const ratingsSchema = z.object({
  hgt: ratingSchema,
  stre: ratingSchema,
  spd: ratingSchema,
  jmp: ratingSchema,
  endu: ratingSchema,
  ins: ratingSchema,
  dnk: ratingSchema,
  ft: ratingSchema,
  fg: ratingSchema,
  tp: ratingSchema,
  oiq: ratingSchema,
  diq: ratingSchema,
  drb: ratingSchema,
  pss: ratingSchema,
  reb: ratingSchema,
});

export const playerBuildSchema = z.object({
  name: z.string().min(1),
  birthplace: z.string().min(1),
  homeRegion: z.string().min(1),
  highSchool: z.string().min(1),
  position: z.enum(['PG', 'SG', 'SF', 'PF', 'C']),
  secondaryPosition: z.enum(['PG', 'SG', 'SF', 'PF', 'C']).optional(),
  heightInches: z.number().int().min(66).max(88),
  weightPounds: z.number().int().min(150).max(320),
  wingspanInches: z.number().int().min(66).max(95),
  dominantHand: z.enum(['Left', 'Right']),
  jerseyNumber: z.number().int().min(0).max(99),
  appearance: z.string(),
  playStyle: z.string().min(1),
  personality: z.enum(['Leader', 'Grinder', 'Showman', 'Technician', 'Competitor']),
  careerPriorities: z.array(z.string()),
  intendedStars: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  traitIds: z.array(z.string()),
  ratings: ratingsSchema,
});

export const LOCKED_AFTER_CREATE: (keyof CareerSettings)[] = [
  'seed',
  'collegeSeasonLength',
  'proSeasonLength',
  'playIn',
  'salaryCap',
  'draftRules',
  'transferRules',
  'godMode',
  'simulationRealism',
];

export const MUTABLE_AFTER_CREATE: (keyof CareerSettings)[] = [
  'autosaveFrequency',
  'interruptOnInjury',
  'interruptOnRoleChange',
  'interruptOnDecisions',
  'newsFrequency',
  'eventFrequency',
];
