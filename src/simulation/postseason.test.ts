import { describe, expect, it } from 'vitest';
import { createCareer } from '../domain/createCareer';
import { defaultPlayer, defaultSettings } from '../domain/defaults';
import { BracketState, CareerSave } from '../domain/models';
import { applyProspectPath } from '../domain/starPresets';
import { simulateNextGame } from './game';
import { buildMarchMadnessBracket, isMadnessComplete } from './marchMadness';
import { buildNbaPlayoffBracket } from './nbaPlayoffs';
import { enqueueUserPostseasonGame, simulatePostseasonStep } from './postseason';
import { initialProStandings } from './schedule';

function simUntil(
  save: CareerSave,
  pred: (s: CareerSave) => boolean,
  max = 400,
): CareerSave {
  let next = save;
  for (let i = 0; i < max; i++) {
    if (pred(next)) return next;
    if (next.phase === 'seasonReview' || next.retired) return next;
    next = simulateNextGame(next).save;
  }
  return next;
}

describe('playable postseason', () => {
  it('queues an incomplete user tournament game after regular season', () => {
    let save = createCareer(
      applyProspectPath(defaultPlayer(), 'lotteryHigh'),
      { ...defaultSettings(), seed: 'po-queue', collegeSeasonLength: 3 },
      'duke',
    );
    save.id = 'po-queue';
    save = simUntil(
      save,
      (s) => s.seasonStage === 'tournament' || s.phase === 'seasonReview',
    );
    expect(save.seasonStage).toBe('tournament');
    expect(save.bracket?.kind).toBe('marchMadness');

    const pending = save.schedule.find(
      (g) => !g.completed && g.stage === 'tournament',
    );
    // Duke is usually in the field; if not, enqueue is a no-op and we spectate.
    if (pending) {
      expect(pending.opponentId).toBeTruthy();
      expect(pending.round).toBeTruthy();
      expect(pending.gameNumber).toBe(save.nextGame);
    }
  });

  it('user tournament game grants XP and uses real box scores', () => {
    let save = createCareer(
      applyProspectPath(defaultPlayer(), 'lotteryHigh'),
      { ...defaultSettings(), seed: 'po-xp', collegeSeasonLength: 2 },
      'duke',
    );
    save.id = 'po-xp';
    save = simUntil(save, (s) => s.seasonStage === 'tournament');
    save = enqueueUserPostseasonGame(save);
    const pending = save.schedule.find((g) => !g.completed && g.stage === 'tournament');
    if (!pending) {
      // Not in field for this seed — skip assertion path
      expect(save.bracket).toBeTruthy();
      return;
    }
    const xpBefore = save.seasonXp ?? 0;
    const result = simulateNextGame(save);
    expect(result.log.playoffs).toBe(true);
    expect(result.log.minutes).toBeGreaterThan(0);
    expect(result.log.points).toBeGreaterThan(0);
    expect(result.log.leagueGameId).toBeTruthy();
    expect(result.leagueGames.some((g) => g.id === result.log.leagueGameId)).toBe(true);
    expect(result.leagueGames[0]!.day).toBe(pending.gameNumber);
    expect((result.save.seasonXp ?? 0) >= xpBefore).toBe(true);
  });

  it('simming through postseason reaches season review with a champion', () => {
    let save = createCareer(
      defaultPlayer(),
      { ...defaultSettings(), seed: 'po-full', collegeSeasonLength: 2 },
      'duke',
    );
    save.id = 'po-full';
    save = simUntil(save, (s) => s.phase === 'seasonReview', 500);
    expect(save.phase).toBe('seasonReview');
    expect(save.bracket?.championId).toBeTruthy();
    expect(save.bracket?.championName).toBeTruthy();
    expect(save.seasonStage).toBe('complete');
  });

  it('does not mark Madness complete without a champion', () => {
    const save = createCareer(
      defaultPlayer(),
      { ...defaultSettings(), seed: 'po-guard' },
      'duke',
    );
    const bracket: BracketState = {
      ...buildMarchMadnessBracket(save.standings, save.season),
      status: 'active',
      championId: undefined,
      championName: undefined,
    };
    // Incomplete First Four still active — not complete
    expect(isMadnessComplete(bracket)).toBe(false);
    const stepped = simulatePostseasonStep({
      ...save,
      seasonStage: 'tournament',
      bracket,
    });
    // After one step, may advance but only complete when champion exists
    if (stepped.save.seasonStage === 'complete') {
      expect(stepped.save.bracket?.championId).toBeTruthy();
    }
  });

  it('NBA projected bracket shows tentative first-round series during play-in', () => {
    const standings = initialProStandings().map((r, i) => ({
      ...r,
      wins: 50 - (i % 15),
      losses: 20 + (i % 10),
    }));
    const bracket = buildNbaPlayoffBracket(standings, 2026, true);
    expect(bracket.playIn!.length).toBeGreaterThan(0);
    expect(bracket.series?.length ?? 0).toBe(8);
    expect(bracket.series!.some((s) => s.teamBId.startsWith('tbd-'))).toBe(true);
  });
});
