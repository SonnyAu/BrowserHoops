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

function competitionPenalty(save: CareerSave): number {
  const ovr = overall(save.player);
  if (save.proTeamId) {
    const mates = nbaPlayers.filter(
      (p) => p.tid === getProTeam(save.proTeamId!)?.tid && p.position === save.player.position,
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

  const info = roleFromContext({
    ovr: ovr + formBoost + trustBoost - comp * 0.35,
    prestige,
    stars: save.recruiting.stars,
    rank: save.recruiting.nationalRank,
    positionNeed: 50 + save.coachTrust / 4,
  });

  // Blend toward target so status moves gradually
  const targetMin = status === 'resting' ? Math.min(12, info.minutes) : info.minutes;
  const minutes = Math.round(save.minutes * 0.55 + targetMin * 0.45);
  const role = info.role as RoleLabel;

  return {
    ...save,
    rosterStatus: status,
    role,
    minutes: Math.max(4, Math.min(36, minutes)),
    usage: info.usage,
  };
}
