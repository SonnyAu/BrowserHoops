import { colleges, getCollege } from '../data/colleges';
import { LeaguePlayer } from './models';

const SKIP_COLLEGE_NAMES = new Set(
  [
    '',
    'none',
    'n/a',
    'na',
    'g league ignite',
    'ignite',
    'overtime elite',
    'nba g league',
    'australia',
    'serbia',
    'spain',
    'france',
    'canada',
    'slovenia',
    'greece',
    'germany',
    'italy',
    'brazil',
    'argentina',
    'lithuania',
    'croatia',
    'turkey',
    'high school',
    'prep',
  ].map((s) => s.toLowerCase()),
);

function normalizeCollegeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

let nameIndex: Map<string, string> | null = null;

function collegeNameIndex(): Map<string, string> {
  if (nameIndex) return nameIndex;
  nameIndex = new Map();
  for (const c of colleges) {
    const keys = [
      c.id,
      c.name,
      c.abbrev,
      c.name.replace(/^University of /i, ''),
      c.name.replace(/ University$/i, ''),
      c.name.replace(/^University of /i, '').replace(/ University$/i, ''),
    ];
    for (const k of keys) {
      const norm = normalizeCollegeKey(k);
      if (norm && !nameIndex.has(norm)) nameIndex.set(norm, c.id);
    }
  }
  // Common short names used in NBA pack college fields
  const aliases: Record<string, string> = {
    unc: 'north-carolina',
    'n c state': 'nc-state',
    'nc state': 'nc-state',
    'north carolina state': 'nc-state',
    ucla: 'ucla',
    usc: 'usc',
    lsu: 'lsu',
    byu: 'byu',
    'ohio st': 'ohio-state',
    'ohio state': 'ohio-state',
    'michigan st': 'michigan-state',
    'michigan state': 'michigan-state',
    'florida st': 'florida-state',
    'florida state': 'florida-state',
    'arizona st': 'arizona-state',
    'arizona state': 'arizona-state',
    'penn st': 'penn-state',
    'penn state': 'penn-state',
    'texas a m': 'texas-am',
    'texas am': 'texas-am',
    'ole miss': 'ole-miss',
    pitt: 'pittsburgh',
    'st johns': 'st-johns',
    'saint johns': 'st-johns',
    uconn: 'connecticut',
    connecticut: 'connecticut',
    cal: 'california',
    'virginia tech': 'virginia-tech',
    'georgia tech': 'georgia-tech',
    'wake forest': 'wake-forest',
    'boston college': 'boston-college',
    'san diego state': 'san-diego-state',
    'colorado state': 'colorado-state',
    'oklahoma state': 'oklahoma-state',
    'kansas state': 'kansas-state',
    'iowa state': 'iowa-state',
    'west virginia': 'west-virginia',
    'notre dame': 'notre-dame',
    'seton hall': 'seton-hall',
    'st marys': 'st-marys',
    'saint marys': 'st-marys',
    'wichita state': 'wichita-state',
    'virginia commonwealth': 'vcu',
    'southern california': 'usc',
    'california los angeles': 'ucla',
  };
  for (const [alias, id] of Object.entries(aliases)) {
    if (getCollege(id) && !nameIndex.has(alias)) nameIndex.set(alias, id);
  }
  return nameIndex;
}

/** Resolve a college id from a free-text college name (NBA pack style). */
export function resolveCollegeIdFromName(college: string | null | undefined): string | null {
  if (!college) return null;
  const raw = college.trim();
  if (!raw) return null;
  if (SKIP_COLLEGE_NAMES.has(raw.toLowerCase())) return null;
  if (getCollege(raw)) return raw;
  const norm = normalizeCollegeKey(raw);
  if (!norm || SKIP_COLLEGE_NAMES.has(norm)) return null;
  return collegeNameIndex().get(norm) ?? null;
}

export function resolveCollegeIdFromPlayer(
  player: Pick<LeaguePlayer, 'college' | 'collegeId'>,
): string | null {
  if (player.collegeId && getCollege(player.collegeId)) return player.collegeId;
  return resolveCollegeIdFromName(player.college);
}

/** Relative luminance 0–1 (sRGB). */
export function hexLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length < 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const l1 = hexLuminance(a);
  const l2 = hexLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Jersey face from IRL team colors. Prefer primary body + secondary number.
 * Only swaps number to white/black when contrast is pathological (~same luminance).
 */
export function jerseyFaceColors(
  colors: readonly (string | undefined)[],
): { bg: string; fg: string } {
  const bg = colors[0] ?? '#333333';
  let fg = colors[1] ?? '#FFFFFF';
  if (contrastRatio(bg, fg) >= 1.8) return { bg, fg };
  const tertiary = colors[2];
  if (tertiary && contrastRatio(bg, tertiary) >= 1.8) return { bg, fg: tertiary };
  fg = hexLuminance(bg) > 0.45 ? '#111111' : '#FFFFFF';
  return { bg, fg };
}
