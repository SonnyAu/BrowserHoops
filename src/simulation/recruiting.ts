import { colleges } from '../data/colleges';
import { overall, strengthsWeaknesses } from '../domain/derived';
import { College, CollegeOffer, PlayerBuild, RecruitingProfile, RoleLabel, StarTier } from '../domain/models';
import { resolvePlayerPath } from '../domain/prospectPaths';
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

type Scored = { c: College; score: number };

/** Minutes floors so underdogs stay playable and elites stay competitive. */
export function offerMinutesFloor(tradeoff: CollegeOffer['tradeoff'], stars: StarTier): number {
  if (tradeoff === 'buildAround') return stars <= 2 ? 28 : stars <= 3 ? 26 : 24;
  if (tradeoff === 'mid') return stars <= 2 ? 22 : 18;
  if (tradeoff === 'ranked') return stars <= 2 ? 18 : 14;
  // elite
  return stars >= 4 ? 10 : 12;
}

function minutesForOffer(
  tradeoff: CollegeOffer['tradeoff'],
  stars: StarTier,
  rng: Rng,
): number {
  let minutes = 12;
  if (tradeoff === 'elite') minutes = 10 + Math.max(0, 8 - stars);
  if (tradeoff === 'ranked') minutes = 16 + stars;
  if (tradeoff === 'mid') minutes = 22 + Math.min(6, stars);
  if (tradeoff === 'buildAround') minutes = 28 + Math.min(4, 5 - Math.min(5, stars));
  minutes = Math.min(34, Math.max(6, minutes + rng.int(-2, 2)));
  return Math.max(offerMinutesFloor(tradeoff, stars), minutes);
}

export function generateRecruitingProfile(player: PlayerBuild, seed: string): RecruitingProfile {
  const rng = new Rng(seed + ':recruit:' + player.name);
  const path = resolvePlayerPath(player);
  const stars = path.stars;
  const band = path.rankBand;
  const nationalRank = rng.int(band[0], band[1]);
  const positionalRank = Math.max(1, Math.round(nationalRank / 5 + rng.int(-5, 8)));
  const stateRank = Math.max(1, Math.round(nationalRank / 12 + rng.int(-3, 6)));
  const r = getEffectiveRatings(player);
  const sw = strengthsWeaknesses(player);
  const o = overall(player);
  const ppg = Math.round(10 + o / 9 + r.tp / 25 + r.fg / 30 + rng.int(-2, 4));
  const accolades = [...path.accolades];

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
    summary: `${player.name} is a ${stars}-star ${path.label.toLowerCase()} ${player.position} from ${player.highSchool}. Scouts cite ${sw.strengths.join(' and ')} with questions about ${sw.weaknesses.join(' and ')}. National rank ~#${nationalRank}.`,
  };
}

/**
 * Always returns four tradeoff slots. Seed diversifies schools only —
 * never whether you "got" a usable offer for your star tier.
 */
export function generateOffers(
  player: PlayerBuild,
  profile: RecruitingProfile,
  seed: string,
): CollegeOffer[] {
  const rng = new Rng(seed + ':offers:' + player.name);
  const stars = profile.stars;
  const starPrestige = stars * 18;
  const regionBoost = (region: string) => (region === player.homeRegion ? 8 : 0);

  const scored: Scored[] = colleges.map((c) => {
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

  const byPrestige = [...colleges].sort((a, b) => b.prestige - a.prestige);
  const elitePool = scored.filter((x) => x.c.prestige >= 88);
  const rankedPool = scored.filter((x) => x.c.prestige >= 78 && x.c.prestige < 88);
  const midPool = scored.filter((x) => x.c.prestige >= 65 && x.c.prestige < 78);
  const lowPool = scored.filter((x) => x.c.prestige < 65);

  const pickFrom = (pool: Scored[], fallback: College[]): College => {
    if (pool.length) return rng.pick(pool).c;
    return rng.pick(fallback.length ? fallback : byPrestige);
  };

  // 4–5★: elite slot must be a true high-prestige school.
  const eliteCollege =
    stars >= 4
      ? pickFrom(elitePool, byPrestige.filter((c) => c.prestige >= 88))
      : pickFrom(elitePool.length ? elitePool : scored, byPrestige);

  const rankedCollege = pickFrom(rankedPool, byPrestige.filter((c) => c.prestige >= 75 && c.prestige < 90));
  const midCollege = pickFrom(midPool, byPrestige.filter((c) => c.prestige >= 60 && c.prestige < 80));
  // 1–2★: build-around from lower prestige with development upside.
  const buildPool =
    stars <= 2
      ? lowPool.length
        ? lowPool
        : scored.filter((x) => x.c.prestige < 72)
      : lowPool;
  const buildCollege = pickFrom(
    buildPool,
    [...byPrestige].filter((c) => c.prestige < 70).reverse(),
  );

  const chosen: { college: College; tradeoff: CollegeOffer['tradeoff'] }[] = [
    { college: eliteCollege, tradeoff: 'elite' },
    { college: rankedCollege, tradeoff: 'ranked' },
    { college: midCollege, tradeoff: 'mid' },
    { college: buildCollege, tradeoff: 'buildAround' },
  ];

  const seen = new Set<string>();
  for (let i = 0; i < chosen.length; i++) {
    if (seen.has(chosen[i].college.id)) {
      const alt = scored.find((x) => !seen.has(x.c.id));
      if (alt) chosen[i].college = alt.c;
      else {
        const any = byPrestige.find((c) => !seen.has(c.id));
        if (any) chosen[i].college = any;
      }
    }
    seen.add(chosen[i].college.id);
  }

  // Enforce elite prestige floor for 4–5★ after dedupe.
  if (stars >= 4 && chosen[0].college.prestige < 88) {
    const hi = byPrestige.find((c) => c.prestige >= 88 && !seen.has(c.id))
      ?? byPrestige.find((c) => c.prestige >= 88);
    if (hi) {
      seen.delete(chosen[0].college.id);
      chosen[0].college = hi;
      seen.add(hi.id);
    }
  }

  return chosen.map(({ college: c, tradeoff }) => {
    const minutes = minutesForOffer(tradeoff, stars, rng);
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
