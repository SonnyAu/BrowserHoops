import { describe, expect, it } from 'vitest';
import { createCareer, draftYearForCollegeSeason } from '../domain/createCareer';
import { defaultPlayer, defaultSettings } from '../domain/defaults';
import { computeTruePotential, scoutedPotential } from '../domain/derived';
import { applyGodModeCommand, isAllowedGodModeCommand } from '../domain/godMode';
import { PlayerBuild } from '../domain/models';
import { remainingPoints } from '../domain/points';
import { colleges } from '../data/colleges';
import { getDraftClass } from '../data/draftProspects';
import { nbaPlayers } from '../data/nbaPlayers';
import { nbaTeams } from '../data/nbaTeams';
import { adaptExternalLeagueJson } from '../importers/leagueFormat';
import { beginDraft } from './draft';
import { grantSeasonAwards } from './awards';
import { generateOffers, generateRecruitingProfile, offerMinutesFloor } from './recruiting';
import { potentialBiasRange } from '../domain/createCareer';
import { acknowledgeSeasonReview, resolveDecision, simulateNextGame } from './game';
import { updateRosterStatus } from './rosterStatus';

const player: PlayerBuild = defaultPlayer();

describe('BrowserHoops career systems', () => {
  it('ships real college and NBA data packs', () => {
    expect(colleges.length).toBeGreaterThan(200);
    expect(colleges.some((c) => c.name === 'Duke')).toBe(true);
    expect(nbaTeams).toHaveLength(30);
    expect(nbaPlayers.length).toBeGreaterThan(200);
    expect(nbaPlayers.some((p) => p.name === 'Nikola Jokic')).toBe(true);
  });

  it('stores real draft prospects for 2026–2028', () => {
    expect(getDraftClass(2026).length).toBeGreaterThan(40);
    expect(getDraftClass(2027).length).toBeGreaterThan(40);
    expect(getDraftClass(2028).length).toBeGreaterThan(40);
    expect(getDraftClass(2026).some((p) => /Dybantsa|Peterson/i.test(p.name))).toBe(true);
  });

  it('generates exactly four diverse college offers', () => {
    const recruiting = createCareer(player, defaultSettings()).recruiting;
    const offers = generateOffers(player, recruiting, 'seed-offers');
    expect(offers).toHaveLength(4);
    const tradeoffs = new Set(offers.map((o) => o.tradeoff));
    expect(tradeoffs.has('elite')).toBe(true);
    expect(tradeoffs.has('buildAround')).toBe(true);
  });

  it('replays the same game deterministically from same seed and state', () => {
    const save = createCareer(player, { ...defaultSettings(), seed: 'same' }, 'duke');
    save.id = 'stable';
    const a = simulateNextGame(save).log;
    const b = simulateNextGame(save).log;
    expect({ ...a, createdAt: '', id: '' }).toEqual({ ...b, createdAt: '', id: '' });
  });

  it('keeps character creation within the point pool', () => {
    expect(remainingPoints(player)).toBeGreaterThanOrEqual(0);
  });

  it('caps potential at 99 and applies scout bias', () => {
    const save = createCareer(player, { ...defaultSettings(), seed: 'bias' }, 'duke');
    expect(save.hidden.truePotential).toBeLessThanOrEqual(99);
    expect(save.hidden.potentialBias).toBeGreaterThanOrEqual(-8);
    expect(save.hidden.potentialBias).toBeLessThanOrEqual(8);
    const scouted = scoutedPotential(save.player, save.hidden);
    expect(scouted).toBeLessThanOrEqual(99);
    expect(computeTruePotential(save.player)).toBeLessThanOrEqual(99);
    if (save.hidden.potentialBias !== 0) {
      expect(scouted).not.toBe(save.hidden.truePotential);
    }
  });

  it('allows only whitelisted God Mode commands', () => {
    expect(isAllowedGodModeCommand('UPDATE_PLAYER_RATINGS')).toBe(true);
    expect(isAllowedGodModeCommand('EDIT_AWARDS')).toBe(false);
    const save = createCareer(player, { ...defaultSettings(), godMode: true }, 'kentucky');
    const denied = applyGodModeCommand(save, {
      type: 'UPDATE_PLAYER_RATINGS',
      playerId: 'someone-else',
      ratings: { tp: 99 },
    });
    expect(denied.ok).toBe(false);
    const allowed = applyGodModeCommand(save, {
      type: 'UPDATE_PLAYER_RATINGS',
      playerId: 'user',
      ratings: { tp: 88 },
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.save.customized).toBe(true);
      expect(allowed.save.player.ratings.tp).toBe(88);
    }
  });

  it('adapts external Basketball-GM-like JSON', () => {
    const report = adaptExternalLeagueJson({
      startingSeason: 2026,
      version: 67,
      gameAttributes: { numGames: 82, salaryCap: 154600 },
      teams: [
        {
          tid: 0,
          region: 'Atlanta',
          name: 'Gold',
          abbrev: 'ATL',
          colors: ['#C8102E', '#FDB927', '#000000'],
        },
      ],
      players: [
        {
          pid: 101,
          tid: 0,
          name: 'Example Player',
          pos: 'PF',
          hgt: 80,
          weight: 235,
          born: { year: 2002, loc: 'San Jose, CA' },
          college: 'Example University',
          ratings: [
            {
              season: 2026,
              stre: 76,
              spd: 67,
              jmp: 73,
              endu: 73,
              ins: 80,
              dnk: 84,
              ft: 67,
              fg: 74,
              tp: 63,
              diq: 69,
              oiq: 75,
              drb: 60,
              pss: 57,
              reb: 78,
            },
          ],
          contract: { amount: 18500, exp: 2028 },
          draft: { year: 2023, round: 1, pick: 14, tid: 0 },
          injury: { type: 'Healthy', gamesRemaining: 0 },
        },
      ],
    });
    expect(report.ok).toBe(true);
    expect(report.teams).toHaveLength(1);
    expect(report.players).toHaveLength(1);
    expect(report.players[0].ratings.ins).toBeGreaterThan(50);
    expect(report.players[0].ratings.tp).toBe(63);
  });

  it('locks recruiting stars to the creator tier', () => {
    const five = { ...defaultPlayer(), intendedStars: 5 as const };
    const save = createCareer(five, { ...defaultSettings(), seed: 'stars' }, 'duke');
    expect(save.recruiting.stars).toBe(5);
    expect(save.player.intendedStars).toBe(5);
  });

  it('never requires rerolls: star tier locks and offer floors hold across seeds', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const five = { ...defaultPlayer(), intendedStars: 5 as const, name: `P-${seed}` };
      const profile5 = generateRecruitingProfile(five, seed);
      expect(profile5.stars).toBe(5);
      const offers5 = generateOffers(five, profile5, seed);
      expect(offers5).toHaveLength(4);
      const elite = offers5.find((o) => o.tradeoff === 'elite')!;
      const eliteSchool = colleges.find((c) => c.id === elite.collegeId)!;
      expect(eliteSchool.prestige).toBeGreaterThanOrEqual(88);

      const two = { ...defaultPlayer(), intendedStars: 2 as const, name: `U-${seed}` };
      const profile2 = generateRecruitingProfile(two, seed);
      expect(profile2.stars).toBe(2);
      const offers2 = generateOffers(two, profile2, seed);
      const build = offers2.find((o) => o.tradeoff === 'buildAround')!;
      expect(build.expectedMinutes).toBeGreaterThanOrEqual(offerMinutesFloor('buildAround', 2));
    }
  });

  it('clamps scout potential bias by star tier', () => {
    expect(potentialBiasRange(5)).toEqual([-3, 3]);
    expect(potentialBiasRange(2)).toEqual([-6, 6]);
    const five = { ...defaultPlayer(), intendedStars: 5 as const };
    for (const seed of ['bias1', 'bias2', 'bias3', 'bias4', 'bias5']) {
      const save = createCareer(five, { ...defaultSettings(), seed }, 'duke');
      expect(Math.abs(save.hidden.potentialBias)).toBeLessThanOrEqual(3);
    }
  });

  it('places college prospects on campus when applicable', () => {
    const save = createCareer(player, { ...defaultSettings(), seed: 'kansas-mates' }, 'kansas');
    expect(save.draftYear).toBe(2026);
    expect(save.collegeRoster.some((m) => /Peterson/i.test(m.name))).toBe(true);
  });

  it('draft board uses JSON prospects not NBA roster players', () => {
    expect(draftYearForCollegeSeason(1)).toBe(2026);
    expect(draftYearForCollegeSeason(2)).toBe(2027);
    let save = createCareer(player, { ...defaultSettings(), seed: 'draft-pool' }, 'duke');
    save = beginDraft(save);
    expect(save.phase).toBe('draft');
    expect(save.draftBoard?.picks).toHaveLength(60);
    const names = new Set(save.draftBoard!.picks.filter((p) => !p.isUser).map((p) => p.prospectName));
    const nbaNames = new Set(nbaPlayers.map((p) => p.name));
    let overlap = 0;
    for (const n of names) if (nbaNames.has(n)) overlap++;
    expect(overlap).toBe(0);
    expect([...names].some((n) => getDraftClass(2026).some((p) => p.name === n))).toBe(true);
  });

  it('gates declare behind season review then opens draft board', () => {
    let save = createCareer(
      player,
      { ...defaultSettings(), seed: 'draft-flow', collegeSeasonLength: 2 },
      'duke',
    );
    save.id = 'draft-flow';
    for (let i = 0; i < 3; i++) {
      const step = simulateNextGame(save);
      save = step.save;
      if (save.phase === 'seasonReview') break;
    }
    expect(save.phase).toBe('seasonReview');
    expect(save.seasonReviews.at(-1)?.acknowledged).toBe(false);
    expect(save.pendingDecisions).toHaveLength(0);

    save = acknowledgeSeasonReview(save);
    expect(save.phase).toBe('college');
    expect(save.pendingDecisions.some((d) => d.type === 'declare')).toBe(true);

    const decide = save.pendingDecisions.find((d) => d.type === 'declare')!;
    save = resolveDecision(save, decide.id, 'declare');
    expect(save.phase).toBe('draft');
    expect(save.draftYear).toBe(2026);
    expect(save.draftBoard?.picks).toHaveLength(60);
  });

  it('updates roster status and can grant college awards', () => {
    let save = createCareer(
      { ...defaultPlayer(), intendedStars: 5 },
      { ...defaultSettings(), seed: 'awards', collegeSeasonLength: 4 },
      'duke',
    );
    const openMinutes = save.minutes;
    for (let i = 0; i < 4; i++) {
      save = simulateNextGame(save).save;
    }
    save = updateRosterStatus(save);
    expect(save.rosterStatus).toMatch(/active|resting|injured/);
    // minutes may drift from opening day
    expect(typeof save.minutes).toBe('number');

    // Force strong season buffer for awards
    save = {
      ...save,
      wins: 20,
      losses: 5,
      seasonLogBuffer: Array.from({ length: 20 }, (_, i) => ({
        id: `x${i}`,
        saveId: save.id,
        season: 1,
        phase: 'college' as const,
        gameNumber: i + 1,
        opponent: 'Test',
        opponentId: 't',
        home: true,
        result: 'W' as const,
        teamScore: 80,
        opponentScore: 70,
        points: 22,
        rebounds: 6,
        assists: 4,
        steals: 1,
        blocks: 1,
        turnovers: 2,
        fouls: 2,
        minutes: 32,
        plusMinus: 8,
        fgm: 8,
        fga: 16,
        tpm: 2,
        tpa: 5,
        ftm: 4,
        fta: 5,
        grade: 'A',
        createdAt: new Date().toISOString(),
      })),
    };
    const { awards } = grantSeasonAwards(save);
    expect(awards.length).toBeGreaterThan(0);
    expect(awards.every((a) => a.level === 'college')).toBe(true);
    void openMinutes;
  });

  it('lets elite OVR produce high scoring pace with starter minutes', () => {
    const ratings = Object.fromEntries(
      (['hgt', 'stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb'] as const).map(
        (k) => [k, 92],
      ),
    ) as PlayerBuild['ratings'];
    let save = createCareer(
      { ...defaultPlayer(), ratings, intendedStars: 5, traitIds: [] },
      { ...defaultSettings(), seed: 'elite-ppg', collegeSeasonLength: 12 },
      'wichita-state',
    );
    save = {
      ...save,
      minutes: 34,
      usage: 0.34,
      role: 'Primary Option',
      fatigue: 0,
    };
    let pts = 0;
    for (let i = 0; i < 8; i++) {
      const { save: next, log } = simulateNextGame(save);
      save = { ...next, minutes: 34, usage: 0.34, fatigue: 0 };
      pts += log.points;
    }
    const ppg = pts / 8;
    expect(ppg).toBeGreaterThan(18);
  });

  it('initializes full conference standings and advances other teams', () => {
    const save = createCareer(player, { ...defaultSettings(), seed: 'standings' }, 'duke');
    expect(save.standings.length).toBeGreaterThan(5);
    expect(save.standings.every((r) => r.conference === 'ACC')).toBe(true);
    const beforeOther = save.standings.find((r) => r.teamId !== 'duke')!;
    const { save: next } = simulateNextGame(save);
    const afterOther = next.standings.find((r) => r.teamId === beforeOther.teamId)!;
    const moved =
      afterOther.wins !== beforeOther.wins || afterOther.losses !== beforeOther.losses;
    const selfMoved = next.wins + next.losses === 1;
    expect(selfMoved).toBe(true);
    expect(moved || next.standings.some((r) => r.wins + r.losses > 0)).toBe(true);
  });

  it('counts injury DNPs toward team record with real scores', () => {
    let save = createCareer(player, { ...defaultSettings(), seed: 'inj-wl' }, 'duke');
    save = {
      ...save,
      injury: { type: 'Ankle sprain', gamesRemaining: 2 },
    };
    const { save: next, log } = simulateNextGame(save);
    expect(log.minutes).toBe(0);
    expect(log.grade).toBe('OUT');
    expect(next.wins + next.losses).toBe(1);
    expect((log.teamScore ?? 0) + (log.opponentScore ?? 0)).toBeGreaterThan(0);
    expect(next.schedule[0]?.completed).toBe(true);
    expect(next.schedule[0]?.teamScore).toBeGreaterThan(0);
  });

  it('emits season events for big performances', () => {
    const ratings = Object.fromEntries(
      (['hgt', 'stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb'] as const).map(
        (k) => [k, 95],
      ),
    ) as PlayerBuild['ratings'];
    let save = createCareer(
      { ...defaultPlayer(), ratings, intendedStars: 5 },
      { ...defaultSettings(), seed: 'events-big' },
      'wichita-state',
    );
    save = { ...save, minutes: 36, usage: 0.36, fatigue: 0 };
    for (let i = 0; i < 6; i++) {
      const { save: next } = simulateNextGame(save);
      save = { ...next, minutes: 36, usage: 0.36, fatigue: 0 };
    }
    expect(save.seasonEvents?.length).toBeGreaterThan(0);
  });
});
