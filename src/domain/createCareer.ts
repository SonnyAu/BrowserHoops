import { colleges, getCollege } from '../data/colleges';
import { activeCollegeProspects, prospectsAtCollege } from '../data/draftProspects';
import { cloneLeagueRoster, defaultDevMeta } from '../simulation/development';
import { generateOffers, generateRecruitingProfile } from '../simulation/recruiting';
import { buildCollegeSchedule, initialCollegeStandings } from '../simulation/schedule';
import {
  computeTruePotential,
  overall,
  overallFromRatings,
  roleFromContext,
  scoutedPotential,
} from './derived';
import {
  CareerSave,
  CollegeRosterMate,
  HiddenDevelopment,
  PlayerBuild,
} from './models';
import { Rng } from './rng';
import { getEffectiveRatings, syncHeightRating } from './traits';

export const LEAGUE_START_SEASON = 2026;

export function draftYearForCollegeSeason(season: number): number {
  return LEAGUE_START_SEASON + (season - 1);
}

/** Scout bias by tier — flavor only, never save-killing. */
export function potentialBiasRange(stars: number): [number, number] {
  if (stars >= 5) return [-3, 3];
  if (stars >= 4) return [-4, 4];
  if (stars >= 3) return [-5, 5];
  return [-6, 6];
}

export function createHiddenDevelopment(player: PlayerBuild, seed: string): HiddenDevelopment {
  const rng = new Rng(seed + ':hidden:' + player.name);
  const truePotential = computeTruePotential(player, {
    age: 18,
    stars: player.intendedStars,
  });
  const [biasLo, biasHi] = potentialBiasRange(player.intendedStars);
  return {
    truePotential,
    potentialBias: rng.int(biasLo, biasHi),
    peakAgeMin: 24 + rng.int(0, 3),
    peakAgeMax: 28 + rng.int(0, 4),
    volatility: rng.int(20, 70),
    workEthic:
      player.personality === 'Grinder' || player.personality === 'Competitor'
        ? rng.int(75, 95)
        : rng.int(55, 85),
    injuryResilience: Math.round(
      (getEffectiveRatings(player).endu + getEffectiveRatings(player).stre) / 2 + rng.int(-5, 5),
    ),
  };
}

export function buildCollegeRoster(
  collegeId: string,
  draftYear: number,
): CollegeRosterMate[] {
  const atSchool = prospectsAtCollege(collegeId).filter((p) => p.draftYear >= draftYear);
  const college = getCollege(collegeId);
  const byName = college
    ? activeCollegeProspects(draftYear).filter(
        (p) =>
          p.collegeId === collegeId ||
          p.college.toLowerCase() === college.name.toLowerCase(),
      )
    : [];
  const map = new Map<string, CollegeRosterMate>();
  for (const p of [...atSchool, ...byName]) {
    const ratings = { ...p.ratings };
    const truePot = p.truePotential ?? p.potential ?? p.overall + 6;
    const meta = defaultDevMeta(p.overall, truePot);
    const age = Math.max(18, 18 + (draftYear - p.draftYear) + 1);
    map.set(p.id, {
      id: p.id,
      name: p.name,
      position: p.position,
      ratings,
      overall: overallFromRatings(ratings, p.position),
      age,
      truePotential: truePot,
      seasonXp: 0,
      workEthic: meta.workEthic,
      volatility: meta.volatility,
      peakAgeMin: meta.peakAgeMin,
      peakAgeMax: meta.peakAgeMax,
      draftYear: p.draftYear,
    });
  }
  return [...map.values()].sort((a, b) => b.overall - a.overall);
}

export function createCareer(
  player: PlayerBuild,
  settings: import('./models').CareerSettings,
  collegeId?: string,
): CareerSave {
  const synced: PlayerBuild = {
    ...player,
    ratings: syncHeightRating(player.ratings, player.heightInches),
  };
  const recruiting = generateRecruitingProfile(synced, settings.seed);
  const offers = generateOffers(synced, recruiting, settings.seed);
  const chosen = collegeId ?? offers[0].collegeId;
  const college = getCollege(chosen) ?? colleges[0];
  const offer = offers.find((o) => o.collegeId === chosen) ?? offers[0];
  const hidden = createHiddenDevelopment(synced, settings.seed);
  const ovr = overall(synced);
  const pot = scoutedPotential(synced, hidden);
  const roleInfo = roleFromContext({
    ovr,
    prestige: college.prestige,
    stars: recruiting.stars,
    rank: recruiting.nationalRank,
    positionNeed: 60,
  });
  const now = new Date().toISOString();
  const draftYear = LEAGUE_START_SEASON;
  const schedule = buildCollegeSchedule(
    chosen,
    settings.collegeSeasonLength,
    settings.seed,
    draftYear,
  );
  const standings = initialCollegeStandings(chosen);
  const collegeRoster = buildCollegeRoster(chosen, draftYear);
  const role = offer.expectedRole;

  return {
    id: crypto.randomUUID(),
    name: settings.careerName || `${synced.name} Career`,
    player: synced,
    settings: { ...settings, seed: settings.seed || crypto.randomUUID() },
    phase: 'college',
    collegeId: chosen,
    proTeamId: null,
    recruiting,
    offers,
    recruitingLocked: true,
    hidden,
    season: 1,
    nextGame: 1,
    schedule,
    standings,
    seasonEvents: [],
    seasonStats: [],
    careerStats: [],
    gameLogsSummary: [],
    trainingFocus: 'balanced',
    trainingIntensity: 'normal',
    fatigue: 8,
    morale: {
      overall: 72,
      roleSatisfaction: offer.expectedMinutes >= roleInfo.minutes - 2 ? 75 : 60,
      coachRelationship: 70,
      teammateChemistry: 68,
    },
    injury: { type: 'Healthy', gamesRemaining: 0 },
    coachTrust: 65 + Math.floor(recruiting.stars * 4),
    role,
    roleAtSeasonStart: role,
    minutes: offer.expectedMinutes,
    usage: roleInfo.usage,
    rosterStatus: 'active',
    collegeRoster,
    draftStock: Math.max(5, 80 - recruiting.nationalRank / 8),
    draft: null,
    draftBoard: null,
    draftYear,
    contract: null,
    goals: [
      { id: 'g1', label: 'Earn a starting role', completed: false },
      { id: 'g2', label: 'Make conference awards', completed: false },
      { id: 'g3', label: 'Declare for the draft when ready', completed: false },
    ],
    pendingDecisions: [],
    history: [
      `Committed to ${college.name} (${offer.tradeoff} path)`,
      ...(collegeRoster.length
        ? [`Campus mates include ${collegeRoster.slice(0, 3).map((m) => m.name).join(', ')}`]
        : []),
    ],
    awards: [],
    transactions: [{ season: 1, type: 'Commitment', detail: `Signed with ${college.name}` }],
    seasonReviews: [],
    ratingsAtSeasonStart: { ...synced.ratings },
    ovrAtSeasonStart: ovr,
    potAtSeasonStart: pot,
    customized: false,
    godModeLog: [],
    godModeBackup: null,
    createdAt: now,
    updatedAt: now,
    retired: false,
    age: 18,
    wins: 0,
    losses: 0,
    seasonLogBuffer: [],
    seasonXp: 0,
    developmentLog: [],
    leagueRoster: cloneLeagueRoster(LEAGUE_START_SEASON),
  };
}
