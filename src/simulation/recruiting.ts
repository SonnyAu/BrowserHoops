import { colleges } from '../data/colleges';
import { overall, strengthsWeaknesses } from '../domain/derived';
import { STAR_PRESETS } from '../domain/starPresets';
import { CollegeOffer, PlayerBuild, RecruitingProfile, RoleLabel, StarTier } from '../domain/models';
import { Rng } from '../domain/rng';
import { getEffectiveRatings } from '../domain/traits';

function roleForMinutes(min: number): RoleLabel {
  if (min >= 32) return 'Primary Option';
  if (min >= 28) return 'Featured Starter';
  if (min >= 24) return 'Starter';
  if (min >= 20) return 'Spot Starter';
  if (min >= 16) return 'Sixth Man';
  if (min >= 12) return 'Rotation Player';
  if (min >= 8) return 'Developmental Reserve';
  return 'Deep Reserve';
}

export function generateRecruitingProfile(player: PlayerBuild, seed: string): RecruitingProfile {
  const rng = new Rng(seed + ':recruit:' + player.name);
  const stars = player.intendedStars as StarTier;
  const band = STAR_PRESETS[stars].rankBand;
  const nationalRank = rng.int(band[0], band[1]);
  const positionalRank = Math.max(1, Math.round(nationalRank / 5 + rng.int(-5, 8)));
  const stateRank = Math.max(1, Math.round(nationalRank / 12 + rng.int(-3, 6)));
  const r = getEffectiveRatings(player);
  const sw = strengthsWeaknesses(player);
  const o = overall(player);
  const ppg = Math.round(10 + o / 9 + r.tp / 25 + r.fg / 30 + rng.int(-2, 4));
  const accolades: string[] = [];
  if (stars >= 5) accolades.push("McDonald's All-American");
  if (stars >= 4) accolades.push('All-State first team');
  if (stars >= 3) accolades.push('Conference player of the year');
  if (stars === 1) accolades.push('Under-the-radar prospect');
  if (stars === 2) accolades.push('Regional honorable mention');

  return {
    nationalRank,
    positionalRank,
    stateRank,
    stars,
    highSchoolStats: {
      ppg,
      rpg: Math.round(3 + r.reb / 18 + rng.int(0, 3)),
      apg: Math.round(2 + r.pss / 20 + rng.int(0, 3)),
      spg: Math.round(1 + r.diq / 40 + r.spd / 50),
      bpg: Math.round(r.diq / 50 + (player.heightInches > 80 ? 1 : 0)),
    },
    accolades,
    scoutConfidence: rng.int(58, 94),
    strengths: sw.strengths,
    weaknesses: sw.weaknesses,
    summary: `${player.name} is a ${stars}-star ${player.position} from ${player.highSchool}. Scouts cite ${sw.strengths.join(' and ')} with questions about ${sw.weaknesses.join(' and ')}. National rank ~#${nationalRank}.`,
  };
}

export function generateOffers(
  player: PlayerBuild,
  profile: RecruitingProfile,
  seed: string,
): CollegeOffer[] {
  const rng = new Rng(seed + ':offers:' + player.name);
  const starPrestige = profile.stars * 18;
  const regionBoost = (region: string) => (region === player.homeRegion ? 8 : 0);

  const scored = colleges.map((c) => {
    const prestigeFit = 100 - Math.abs(c.prestige - starPrestige);
    const score =
      prestigeFit * 0.4 +
      c.development * 0.15 +
      c.recruiting * 0.1 +
      regionBoost(c.region) +
      rng.int(-10, 10);
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const elite = scored.filter((x) => x.c.prestige >= 88).slice(0, 12);
  const ranked = scored.filter((x) => x.c.prestige >= 78 && x.c.prestige < 88).slice(0, 20);
  const mid = scored.filter((x) => x.c.prestige >= 65 && x.c.prestige < 78).slice(0, 30);
  const low = scored.filter((x) => x.c.prestige < 65).slice(0, 40);

  const pick = (pool: typeof scored, fallback: typeof scored) => {
    const src = pool.length ? pool : fallback;
    return rng.pick(src).c;
  };

  const chosen = [
    { college: pick(elite, scored), tradeoff: 'elite' as const },
    { college: pick(ranked, scored), tradeoff: 'ranked' as const },
    { college: pick(mid, scored), tradeoff: 'mid' as const },
    { college: pick(low, scored), tradeoff: 'buildAround' as const },
  ];

  const seen = new Set<string>();
  for (let i = 0; i < chosen.length; i++) {
    if (seen.has(chosen[i].college.id)) {
      const alt = scored.find((x) => !seen.has(x.c.id));
      if (alt) chosen[i].college = alt.c;
    }
    seen.add(chosen[i].college.id);
  }

  return chosen.map(({ college: c, tradeoff }) => {
    let minutes = 12;
    if (tradeoff === 'elite') minutes = 10 + Math.max(0, 8 - profile.stars);
    if (tradeoff === 'ranked') minutes = 16 + profile.stars;
    if (tradeoff === 'mid') minutes = 22 + Math.min(6, profile.stars);
    if (tradeoff === 'buildAround') minutes = 28 + Math.min(4, 5 - Math.min(5, profile.stars));
    minutes = Math.min(34, Math.max(6, minutes + rng.int(-2, 2)));

    const schemeFit = Math.max(
      40,
      Math.min(
        99,
        Math.round(
          (c.development + c.coaching) / 2 +
            (player.playStyle.toLowerCase().includes(c.offensiveStyle.slice(0, 4)) ? 8 : 0) +
            rng.int(-8, 8),
        ),
      ),
    );

    return {
      collegeId: c.id,
      scholarship: true,
      expectedRole: roleForMinutes(minutes),
      expectedMinutes: minutes,
      fitScore: schemeFit,
      competition: Math.round(c.prestige * 0.9 + rng.int(-5, 5)),
      scrutiny: c.mediaScrutiny,
      nationalExposure: c.proExposure,
      draftVisibility: Math.round((c.proExposure + c.prestige) / 2),
      schemeFit,
      tradeoff,
      pitch:
        tradeoff === 'elite'
          ? `${c.name}: elite brand, limited early minutes, max exposure.`
          : tradeoff === 'ranked'
            ? `${c.name}: ranked program with a real rotation path.`
            : tradeoff === 'mid'
              ? `${c.name}: mid-major/high-major hybrid offering a starting look.`
              : `${c.name}: lower prestige, build the offense around you.`,
    };
  });
}
