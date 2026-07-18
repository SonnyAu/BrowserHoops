import { nbaPlayers } from '../data/nbaPlayers';
import { overall, roleFromContext } from '../domain/derived';
import { CareerSave, RoleLabel, RosterStatus } from '../domain/models';
import { getCollege } from '../data/colleges';
import { getProTeam } from '../data/nbaTeams';

function recentPpg(save: CareerSave): number {
  const logs = save.seasonLogBuffer.filter((l) => l.minutes > 0).slice(-8);
  if (!logs.length) return 0;
  return logs.reduce((s, l) => s + l.points, 0) / logs.length;
}

function leaguePool(save: CareerSave) {
  return save.leagueRoster?.length ? save.leagueRoster : nbaPlayers;
}

function competitionPenalty(save: CareerSave): number {
  const ovr = overall(save.player);
  if (save.proTeamId) {
    const tid = getProTeam(save.proTeamId!)?.tid;
    const mates = leaguePool(save).filter(
      (p) => p.tid === tid && p.position === save.player.position,
    );
    const better = mates.filter((p) => p.overall > ovr + 2).length;
    return better * 3;
  }
  const better = save.collegeRoster.filter((m) => m.overall > ovr + 1).length;
  return better * 2.5;
}

export function resolveRosterStatus(save: CareerSave): RosterStatus {
  if (save.injury.gamesRemaining > 0) return 'injured';
  if (save.fatigue >= 92) return 'resting';
  return 'active';
}

/** Recompute role/minutes/usage from form, trust, and roster competition. */
export function updateRosterStatus(save: CareerSave): CareerSave {
  const status = resolveRosterStatus(save);
  if (status === 'injured' || status === 'suspended') {
    return {
      ...save,
      rosterStatus: status,
      minutes: Math.min(save.minutes, 4),
    };
  }

  const college = save.collegeId ? getCollege(save.collegeId) : undefined;
  const prestige = college?.prestige ?? (save.proTeamId ? 78 : 70);
  const ovr = overall(save.player);
  const ppg = recentPpg(save);
  const formBoost = Math.min(8, Math.max(-6, (ppg - 10) * 0.45));
  const trustBoost = (save.coachTrust - 60) / 12;
  const comp = competitionPenalty(save);

  const stars = save.recruiting.stars;
  // Underdogs who produce get an extra readiness bump (earn minutes).
  const underdogProduce =
    stars <= 2 && ppg >= 11 ? Math.min(6, (ppg - 10) * 0.8) : stars <= 3 && ppg >= 14 ? 3 : 0;

  const info = roleFromContext({
    ovr: ovr + formBoost + trustBoost - comp * 0.35 + underdogProduce,
    prestige,
    stars,
    rank: save.recruiting.nationalRank,
    positionNeed: 50 + save.coachTrust / 4,
  });

  // Blend toward target so status moves gradually
  let targetMin = status === 'resting' ? Math.min(12, info.minutes) : info.minutes;
  if (stars <= 2 && ppg >= 12) {
    targetMin = Math.max(targetMin, Math.min(32, Math.round(18 + ppg * 0.7)));
  }
  const minutes = Math.round(save.minutes * 0.55 + targetMin * 0.45);
  const role = info.role as RoleLabel;

  return {
    ...save,
    rosterStatus: status,
    role,
    minutes: Math.max(4, Math.min(36, minutes)),
    usage: Math.min(0.4, info.usage + (stars <= 2 && ppg >= 14 ? 0.02 : 0)),
  };
}
