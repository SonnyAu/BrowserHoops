/**
 * Import BBGM roster into durable src/data packs.
 * Prefers src/data/raw/league-2025-26.json; falls back to root 2025-26.NBA.Roster.json once.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'src/data');
const rawDir = path.join(outDir, 'raw');
const rawPath = path.join(rawDir, 'league-2025-26.json');
const rootJsonPath = path.join(root, '2025-26.NBA.Roster.json');

const DIVISIONS = {
  0: 'Atlantic',
  1: 'Central',
  2: 'Southeast',
  3: 'Northwest',
  4: 'Pacific',
  5: 'Southwest',
};

function hgtFromInches(inches) {
  return Math.max(0, Math.min(99, Math.round((inches - 66) * (72 / 22) + 20)));
}

function clamp(n, lo = 0, hi = 99) {
  return Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
}

function mapPos(pos) {
  const p = String(pos || 'SF').toUpperCase();
  if (['PG', 'SG', 'SF', 'PF', 'C'].includes(p)) return p;
  if (p === 'G' || p === 'CG') return 'SG';
  if (p === 'F' || p === 'GF' || p === 'FC') return p === 'FC' ? 'PF' : 'SF';
  return 'SF';
}

function ovr(r) {
  const raw =
    (r.hgt * 0.7 +
      r.stre * 0.85 +
      r.spd * 1.05 +
      r.jmp * 0.9 +
      r.endu * 0.75 +
      r.ins * 1.05 +
      r.dnk +
      r.ft * 0.7 +
      r.fg * 1.1 +
      r.tp * 1.2 +
      r.oiq * 1.15 +
      r.diq * 1.15 +
      r.drb * 0.95 +
      r.pss * 1.05 +
      r.reb * 0.95) /
    14.55;
  return Math.round(Math.min(99, Math.max(35, 20 + (raw - 20) * 1.35)));
}

function inferTraits(r, h) {
  const ids = [];
  if (h >= 83 && r.spd >= 70 && r.drb >= 65) ids.push('unicorn-mobility');
  if (r.stre >= 85 && r.spd >= 80 && r.jmp >= 80) ids.push('physical-freak');
  if (r.tp >= 88 && r.fg >= 80) ids.push('shooting-sauce');
  if (r.pss >= 88 && r.oiq >= 85) ids.push('floor-general');
  if (r.diq >= 88 && h >= 80) ids.push('rim-protector');
  if (r.dnk >= 88 && r.spd >= 82) ids.push('slasher');
  return ids.slice(0, 2);
}

function pickRatings(ratingsArr, startingSeason) {
  if (!Array.isArray(ratingsArr) || ratingsArr.length === 0) return {};
  const preferred =
    ratingsArr.find((r) => r.season === startingSeason) ||
    ratingsArr.find((r) => r.season === startingSeason - 1) ||
    ratingsArr[ratingsArr.length - 1];
  return preferred || {};
}

function mapRatings(raw, heightInches) {
  return {
    hgt: clamp(raw.hgt ?? hgtFromInches(heightInches)),
    stre: clamp(raw.stre, 25, 99),
    spd: clamp(raw.spd, 25, 99),
    jmp: clamp(raw.jmp, 25, 99),
    endu: clamp(raw.endu, 25, 99),
    ins: clamp(raw.ins, 25, 99),
    dnk: clamp(raw.dnk, 25, 99),
    ft: clamp(raw.ft, 25, 99),
    fg: clamp(raw.fg, 25, 99),
    tp: clamp(raw.tp, 25, 99),
    oiq: clamp(raw.oiq, 25, 99),
    diq: clamp(raw.diq, 25, 99),
    drb: clamp(raw.drb, 25, 99),
    pss: clamp(raw.pss, 25, 99),
    reb: clamp(raw.reb, 25, 99),
  };
}

function hashBias(id) {
  let h = 2166136261;
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 17) - 8; // -8..+8
}

function truePot(overall, ratings, age, isProspect) {
  const upside = Math.floor((ratings.spd + ratings.oiq + ratings.jmp + ratings.tp) / 40);
  const ageRoom = isProspect ? 14 : age <= 23 ? 12 : age <= 27 ? 6 : age <= 31 ? 2 : 0;
  return Math.min(99, Math.max(overall, overall + upside + Math.floor(ageRoom / 2)));
}

function playerName(p) {
  if (p.name) return String(p.name);
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Unknown';
}

function loadSource() {
  if (fs.existsSync(rawPath)) {
    return { data: JSON.parse(fs.readFileSync(rawPath, 'utf8')), from: 'raw' };
  }
  if (fs.existsSync(rootJsonPath)) {
    return { data: JSON.parse(fs.readFileSync(rootJsonPath, 'utf8')), from: 'root' };
  }
  throw new Error('No league JSON found at src/data/raw/league-2025-26.json or 2025-26.NBA.Roster.json');
}

function trimForRaw(data) {
  const startingSeason = data.startingSeason ?? 2026;
  const teams = (data.teams || [])
    .filter((t) => typeof t.tid === 'number' && t.tid >= 0 && t.tid < 30)
    .map((t) => ({
      tid: t.tid,
      cid: t.cid,
      did: t.did,
      region: t.region,
      name: t.name,
      abbrev: t.abbrev,
      colors: t.colors,
      pop: t.pop,
      strategy: t.strategy,
    }));

  const players = (data.players || [])
    .filter((p) => {
      const tid = p.tid;
      if (typeof tid === 'number' && tid >= 0 && tid < 30) return true;
      if (tid === -2) {
        const y = p.draft?.year;
        return y >= 2026 && y <= 2028;
      }
      return false;
    })
    .map((p) => {
      const ratings = Array.isArray(p.ratings)
        ? p.ratings.map((r) => ({
            season: r.season,
            hgt: r.hgt,
            stre: r.stre,
            spd: r.spd,
            jmp: r.jmp,
            endu: r.endu,
            ins: r.ins,
            dnk: r.dnk,
            ft: r.ft,
            fg: r.fg,
            tp: r.tp,
            diq: r.diq,
            oiq: r.oiq,
            drb: r.drb,
            pss: r.pss,
            reb: r.reb,
          }))
        : [];
      return {
        tid: p.tid,
        name: playerName(p),
        firstName: p.firstName,
        lastName: p.lastName,
        pos: p.pos,
        hgt: p.hgt,
        weight: p.weight,
        srID: p.srID,
        born: p.born,
        college: p.college,
        contract: p.contract,
        draft: p.draft,
        jerseyNumber: p.jerseyNumber,
        ratings,
      };
    });

  return { startingSeason, version: data.version ?? 67, teams, players };
}

function slug(abbrev) {
  return String(abbrev || 'unk').toLowerCase();
}

/** @param {Array<{id:string,name:string,abbrev:string}>} collegeList */
export function importLeagueRoster(collegeList = []) {
  const { data, from } = loadSource();
  const trimmed = from === 'raw' ? data : trimForRaw(data);
  fs.mkdirSync(rawDir, { recursive: true });
  if (from === 'root' || !fs.existsSync(rawPath)) {
    fs.writeFileSync(rawPath, JSON.stringify(trimmed));
    console.log('Wrote durable snapshot', rawPath);
  }

  const startingSeason = trimmed.startingSeason ?? 2026;
  const nameToCollegeId = new Map();
  for (const c of collegeList) {
    nameToCollegeId.set(c.name.toLowerCase(), c.id);
    nameToCollegeId.set(c.abbrev.toLowerCase(), c.id);
  }
  // Common aliases from BBGM prospect college strings
  const aliases = {
    connecticut: 'connecticut',
    uconn: 'connecticut',
    'brigham young': 'byu',
    byu: 'byu',
    'north carolina': 'north-carolina',
    unc: 'north-carolina',
    'nc state': 'nc-state',
    'n.c. state': 'nc-state',
    'st. johns': 'st-johns',
    "st. john's": 'st-johns',
    'saint marys': 'st-marys',
    "saint mary's": 'st-marys',
    'san diego state': 'san-diego-state',
    'texas a&m': 'texas-am',
    'texas tech': 'texas-tech',
    'iowa state': 'iowa-state',
    'michigan state': 'michigan-state',
    'ohio state': 'ohio-state',
    'penn state': 'penn-state',
    'florida state': 'florida-state',
    'virginia tech': 'virginia-tech',
    'wake forest': 'wake-forest',
    'boston college': 'boston-college',
    'georgia tech': 'georgia-tech',
    'kansas state': 'kansas-state',
    'oklahoma state': 'oklahoma-state',
    'west virginia': 'west-virginia',
    'arizona state': 'arizona-state',
    'colorado state': 'colorado-state',
    'boise state': 'boise-state',
    'new mexico': 'new-mexico',
    'utah state': 'utah-state',
    'florida atlantic': 'florida-atlantic',
    'south florida': 'south-florida',
    'wichita state': 'wichita-state',
    'saint louis': 'saint-louis',
    'loyola chicago': 'loyola-chicago',
    'george mason': 'george-mason',
    'indiana state': 'indiana-state',
    'murray state': 'murray-state',
    'grand canyon': 'grand-canyon',
    'james madison': 'james-madison',
    'ole miss': 'ole-miss',
    'mississippi state': 'mississippi-state',
    'south carolina': 'south-carolina',
  };
  for (const [alias, id] of Object.entries(aliases)) {
    if (!nameToCollegeId.has(alias) && collegeList.some((c) => c.id === id)) {
      nameToCollegeId.set(alias, id);
    }
  }

  function resolveCollegeId(collegeName) {
    if (!collegeName) return null;
    const key = String(collegeName).toLowerCase().trim();
    if (nameToCollegeId.has(key)) return nameToCollegeId.get(key);
    // fuzzy: contains
    for (const c of collegeList) {
      if (key.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(key)) return c.id;
    }
    return null;
  }

  const nbaTeams = (trimmed.teams || [])
    .filter((t) => t.tid >= 0 && t.tid < 30)
    .sort((a, b) => a.tid - b.tid)
    .map((t) => ({
      id: slug(t.abbrev),
      tid: t.tid,
      region: t.region,
      name: t.name,
      abbrev: t.abbrev,
      colors: t.colors?.length >= 2 ? [t.colors[0], t.colors[1], t.colors[2] || '#111111'] : ['#333', '#fff', '#111'],
      conference: t.cid === 0 ? 'East' : 'West',
      division: DIVISIONS[t.did] || 'Unknown',
    }));

  const nbaPlayers = [];
  const draftProspects = [];
  let pid = 1;

  for (const p of trimmed.players || []) {
    const heightInches = Number(p.hgt || 78);
    const rawR = pickRatings(p.ratings, startingSeason);
    const ratings = mapRatings(rawR, heightInches);
    const overall = ovr(ratings);
    const bornYear = Number(p.born?.year || 2000);
    const age = startingSeason - bornYear;
    const isProspect = p.tid === -2;
    const tp = truePot(overall, ratings, age, isProspect);
    const bias = hashBias(p.srID || playerName(p));
    const scouted = Math.min(99, Math.max(overall, tp + bias));
    const college = String(p.college || '');
    const collegeId = resolveCollegeId(college);
    const draft = p.draft || {};
    const contract = p.contract || {};
    const base = {
      id: isProspect ? `dp-${draft.year || 2026}-${pid}` : `p${pid}`,
      name: playerName(p),
      tid: isProspect ? 'FA' : p.tid,
      position: mapPos(p.pos),
      heightInches,
      weightPounds: Number(p.weight || 210),
      wingspanInches: heightInches + 3,
      bornYear,
      birthplace: String(p.born?.loc || ''),
      college: college || 'N/A',
      collegeId,
      ratings,
      traitIds: inferTraits(ratings, heightInches),
      overall,
      potential: scouted,
      potentialBias: bias,
      truePotential: tp,
      contractAmount: Number(contract.amount || 1000),
      contractExp: Number(contract.exp || startingSeason + 1),
      draftYear: Number(draft.year || 0),
      draftRound: Number(draft.round || 0),
      draftPick: Number(draft.pick || 0),
      draftTid: Number(draft.tid ?? -1),
    };
    pid++;
    if (isProspect) {
      draftProspects.push(base);
    } else if (typeof p.tid === 'number' && p.tid >= 0 && p.tid < 30) {
      nbaPlayers.push({ ...base, tid: p.tid });
    }
  }

  draftProspects.sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
  nbaPlayers.sort((a, b) => a.tid - b.tid || b.overall - a.overall);

  fs.writeFileSync(
    path.join(outDir, 'nbaTeams.ts'),
    `import { ProTeam } from '../domain/models';\nexport const nbaTeams: ProTeam[] = ${JSON.stringify(nbaTeams, null, 2)} as ProTeam[];\nexport function getProTeam(id: string) {\n  return nbaTeams.find((t) => t.id === id || t.abbrev === id.toUpperCase());\n}\nexport function getProTeamByTid(tid: number) {\n  return nbaTeams.find((t) => t.tid === tid);\n}\n`,
  );

  fs.writeFileSync(
    path.join(outDir, 'nbaPlayers.ts'),
    `import { LeaguePlayer } from '../domain/models';\nexport const nbaPlayers: LeaguePlayer[] = ${JSON.stringify(nbaPlayers, null, 2)} as LeaguePlayer[];\nexport function getLeaguePlayer(id: string) {\n  return nbaPlayers.find((p) => p.id === id);\n}\n`,
  );

  fs.writeFileSync(
    path.join(outDir, 'draftProspects.ts'),
    `import { DraftProspect } from '../domain/models';\nexport const draftProspects: DraftProspect[] = ${JSON.stringify(draftProspects, null, 2)} as DraftProspect[];\nexport function getDraftClass(year: number): DraftProspect[] {\n  return draftProspects.filter((p) => p.draftYear === year);\n}\nexport function prospectsAtCollege(collegeIdOrName: string): DraftProspect[] {\n  const key = collegeIdOrName.toLowerCase();\n  return draftProspects.filter(\n    (p) =>\n      (p.collegeId && p.collegeId === collegeIdOrName) ||\n      p.college.toLowerCase() === key ||\n      p.college.toLowerCase().includes(key),\n  );\n}\nexport function activeCollegeProspects(draftYear: number): DraftProspect[] {\n  return draftProspects.filter((p) => p.draftYear >= draftYear);\n}\n`,
  );

  const simRefs = nbaPlayers
    .filter((p) => p.overall >= 72)
    .slice(0, 120)
    .map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      offensive: [p.ratings.ins, p.ratings.dnk, p.ratings.fg, p.ratings.tp, p.ratings.pss, p.ratings.oiq],
      defensive: [p.ratings.diq, p.ratings.reb, p.ratings.spd, p.ratings.jmp],
      physical: [p.heightInches, p.wingspanInches - p.heightInches, p.ratings.spd, p.ratings.stre],
    }));

  fs.writeFileSync(
    path.join(outDir, 'similarityRefs.ts'),
    `import { SimilarityRef } from '../domain/models';\nexport const similarityRefs: SimilarityRef[] = ${JSON.stringify(simRefs, null, 2)} as SimilarityRef[];\n`,
  );

  console.log(
    `League import (${from}): ${nbaTeams.length} teams, ${nbaPlayers.length} NBA players, ${draftProspects.length} prospects, ${simRefs.length} sim refs`,
  );
  return { nbaTeams, nbaPlayers, draftProspects };
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Load college names from generated colleges if present
  let colleges = [];
  const collegesPath = path.join(outDir, 'colleges.ts');
  if (fs.existsSync(collegesPath)) {
    const text = fs.readFileSync(collegesPath, 'utf8');
    const m = text.match(/export const colleges[^=]*=\s*(\[[\s\S]*?\])\s*as/);
    if (m) {
      try {
        colleges = JSON.parse(m[1]);
      } catch {
        colleges = [];
      }
    }
  }
  importLeagueRoster(colleges);
}
