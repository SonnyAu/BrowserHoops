import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getCollege } from '../data/colleges';
import { getProTeam, getProTeamByTid } from '../data/nbaTeams';

const teamCache = new Map<string, { name: string; abbrev: string; colors: [string, string, string?] }>();

export function resolveTeam(teamId: string) {
  let hit = teamCache.get(teamId);
  if (hit) return hit;
  const pro = getProTeam(teamId);
  if (pro) {
    hit = { name: `${pro.region} ${pro.name}`, abbrev: pro.abbrev, colors: pro.colors };
  } else {
    const college = getCollege(teamId);
    hit = college
      ? { name: college.name, abbrev: college.abbrev, colors: college.colors }
      : { name: teamId, abbrev: teamId.slice(0, 3).toUpperCase(), colors: ['#444', '#ccc'] };
  }
  teamCache.set(teamId, hit);
  return hit;
}

export function teamIdFromTid(tid: number | 'FA' | null | undefined): string | null {
  if (tid == null || tid === 'FA') return null;
  return getProTeamByTid(tid)?.id ?? null;
}

export function TeamLink({
  saveId,
  teamId,
  children,
  abbrev,
  className,
}: {
  saveId: string;
  teamId: string;
  children?: ReactNode;
  abbrev?: boolean;
  className?: string;
}) {
  const t = resolveTeam(teamId);
  return (
    <Link className={className ?? 'entity-link'} to={`/career/${saveId}/team/${teamId}`}>
      {children ?? (abbrev ? t.abbrev : t.name)}
    </Link>
  );
}

export function PlayerLink({
  saveId,
  playerId,
  children,
  className,
}: {
  saveId: string;
  playerId: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Link className={className ?? 'entity-link'} to={`/career/${saveId}/player/${playerId}`}>
      {children}
    </Link>
  );
}
