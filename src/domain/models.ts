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

/** Named create-path dial; public recruiting stars still come from `intendedStars`. */
export type ProspectPathId =
  | 'underdog'
  | 'sleeper'
  | 'standard'
  | 'blueBlood'
  | 'lotteryLow'
  | 'lotteryHigh'
  | 'consensusOne'
  | 'generational';

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
  /** Named prospect path; defaults from intendedStars when missing on old templates. */
  prospectPath: ProspectPathId;
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

/** Shared development state for user, teammates, and NBA pack players. */
export interface DevelopablePlayer {
  id: string;
  name: string;
  position: Position;
  ratings: Ratings;
  overall: number;
  age: number;
  truePotential: number;
  seasonXp: number;
  workEthic: number;
  volatility: number;
  peakAgeMin: number;
  peakAgeMax: number;
}

export interface CollegeRosterMate extends DevelopablePlayer {
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
  /** Years of league box scores to keep (set only at new-game). */
  boxScoreRetentionYears: number;
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
  /** Jersey number (0–99). */
  jerseyNumber?: number;
  /** Optional per-team jersey overrides. */
  jerseyByTeamId?: Record<string, number>;
  /** Mutable development fields (filled when cloned onto a career save). */
  age?: number;
  seasonXp?: number;
  workEthic?: number;
  volatility?: number;
  peakAgeMin?: number;
  peakAgeMax?: number;
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

export interface DraftPoolProspect {
  id: string;
  name: string;
  position: Position;
  overall: number;
  potential: number;
  /** BPA base score used with need when selecting. */
  value: number;
  isUser: boolean;
}

export interface DraftBoardPick {
  pick: number;
  round: number;
  teamId: string;
  teamAbbrev: string;
  teamName: string;
  teamColors: [string, string, string?];
  /** Empty / TBD until the team on the clock selects. */
  prospectId: string;
  prospectName: string;
  position: Position;
  isUser: boolean;
  revealed: boolean;
}

export type DraftPositionCounts = Record<Position, number>;

export interface DraftBoardState {
  picks: DraftBoardPick[];
  currentIndex: number;
  /** Set when the user is selected; null while still available. */
  userPick: number | null;
  finished: boolean;
  undrafted: boolean;
  pool: DraftPoolProspect[];
  remainingIds: string[];
  /** Running position depth per team (updated as picks land). */
  teamNeeds: Record<string, DraftPositionCounts>;
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

/** Archived BBGM-shaped season totals (per-game derived in UI). */
export interface PlayerSeasonLine {
  id: string;
  saveId: string;
  playerId: string;
  season: number;
  level: 'college' | 'pro';
  phase: 'regular' | 'playoffs';
  teamId: string;
  teamAbbrev: string;
  age: number;
  gp: number;
  gs: number;
  min: number;
  fg: number;
  fga: number;
  tp: number;
  tpa: number;
  ft: number;
  fta: number;
  orb: number;
  drb: number;
  trb: number;
  ast: number;
  tov: number;
  stl: number;
  blk: number;
  pf: number;
  pts: number;
}

export type LeagueTransactionType =
  | 'trade'
  | 'signing'
  | 'release'
  | 'draft'
  | 'commitment'
  | 'extension';

export interface LeagueTransaction {
  id: string;
  saveId: string;
  season: number;
  dateKey: string;
  type: LeagueTransactionType;
  teamIds: string[];
  playerIds: string[];
  summary: string;
  assets?: {
    fromTeamId: string;
    toTeamId: string;
    playerIds: string[];
  }[];
  contract?: { playerId: string; amount: number; exp: number };
}

export interface TeamSeasonRecord {
  id: string;
  saveId: string;
  teamId: string;
  season: number;
  level: 'college' | 'pro';
  wins: number;
  losses: number;
  conference?: string;
}

export type SeasonStage = 'regular' | 'playIn' | 'playoffs' | 'tournament' | 'complete';

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
  stage?: SeasonStage;
  seriesId?: string;
  round?: string;
  gameInSeries?: number;
  leagueGameId?: string;
}

export interface BoxLine {
  playerId: string;
  playerName: string;
  teamId: string;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  orb?: number;
  drb?: number;
  pf?: number;
  isUser?: boolean;
}

export interface LeagueGamePlayoffMeta {
  region?: string;
  round?: string;
  seriesId?: string;
  gameInSeries?: number;
  homeSeed?: number;
  awaySeed?: number;
}

export interface LeagueGameRecord {
  id: string;
  saveId: string;
  season: number;
  level: 'college' | 'pro';
  stage: SeasonStage;
  day: number;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  playoffMeta?: LeagueGamePlayoffMeta;
  players: BoxLine[];
  createdAt: string;
}

export type MadnessRegion = 'East' | 'West' | 'South' | 'Midwest';

export interface BracketSlot {
  teamId: string | null;
  teamName: string;
  seed: number | null;
  conference?: string;
}

export interface BracketMatchup {
  id: string;
  round: string;
  region?: MadnessRegion | 'FinalFour' | 'Championship' | 'FirstFour' | 'PlayIn';
  slotA: BracketSlot;
  slotB: BracketSlot;
  winnerId?: string;
  homeScore?: number;
  awayScore?: number;
  leagueGameId?: string;
  completed: boolean;
}

export interface NbaSeriesGame {
  gameInSeries: number;
  homeTeamId: string;
  winnerId?: string;
  homeScore?: number;
  awayScore?: number;
  leagueGameId?: string;
}

export interface NbaSeriesState {
  id: string;
  round: string;
  conference: 'East' | 'West' | 'Finals';
  teamAId: string;
  teamAName: string;
  teamASeed: number;
  teamBId: string;
  teamBName: string;
  teamBSeed: number;
  winsA: number;
  winsB: number;
  games: NbaSeriesGame[];
  winnerId?: string;
  completed: boolean;
}

export interface BracketState {
  kind: 'marchMadness' | 'nbaPlayoffs';
  status: 'projected' | 'active' | 'complete';
  season: number;
  firstFour?: BracketMatchup[];
  rounds?: BracketMatchup[];
  playIn?: BracketMatchup[];
  series?: NbaSeriesState[];
  championId?: string;
  championName?: string;
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
  playoffs?: boolean;
  leagueGameId?: string;
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
  /** regular → postseason stages → complete before season review. */
  seasonStage: SeasonStage;
  /** Live / locked playoff bracket for the current season. */
  bracket: BracketState | null;
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
  /** User season XP bank (mirrors development; ratings update in offseason). */
  seasonXp: number;
  /** Short offseason development headlines. */
  developmentLog: string[];
  /** Full mutable NBA pack — develops every season including college years. */
  leagueRoster: LeaguePlayer[];
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
  prospectPath: z
    .enum([
      'underdog',
      'sleeper',
      'standard',
      'blueBlood',
      'lotteryLow',
      'lotteryHigh',
      'consensusOne',
      'generational',
    ])
    .default('standard'),
  traitIds: z.array(z.string()),
  ratings: ratingsSchema,
});

export const LOCKED_AFTER_CREATE: (keyof CareerSettings)[] = [
  'seed',
  'collegeSeasonLength',
  'proSeasonLength',
  'boxScoreRetentionYears',
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
