import { describe, expect, it } from 'vitest';
import { createCareer } from '../domain/createCareer';
import { defaultPlayer, defaultSettings } from '../domain/defaults';
import { nbaTeams } from '../data/nbaTeams';
import {
  bracketForDisplay,
  projectBracketFromStandings,
  seedPreviewNba,
} from './bracketProjection';
import { initialProStandings } from './schedule';

describe('bracketProjection', () => {
  it('projects March Madness 1-vs-16 style slots from college standings', () => {
    const save = createCareer(
      defaultPlayer(),
      { ...defaultSettings(), seed: 'proj-mm' },
      'duke',
    );
    const bracket = projectBracketFromStandings(save)!;
    expect(bracket.kind).toBe('marchMadness');
    expect(bracket.status).toBe('projected');
    const r64 = bracket.rounds!.filter((m) => m.round === 'Round of 64');
    const oneV16 = r64.find(
      (m) =>
        (m.slotA.seed === 1 && m.slotB.seed === 16) ||
        (m.slotA.seed === 16 && m.slotB.seed === 1),
    );
    expect(oneV16).toBeTruthy();
  });

  it('projects NBA 1-vs-8 when professional', () => {
    let save = createCareer(
      defaultPlayer(),
      { ...defaultSettings(), seed: 'proj-nba', playIn: false },
      'duke',
    );
    save = {
      ...save,
      phase: 'professional',
      proTeamId: nbaTeams[0].id,
      collegeId: null,
      standings: initialProStandings(),
      seasonStage: 'regular',
      bracket: null,
    };
    const bracket = projectBracketFromStandings(save)!;
    expect(bracket.kind).toBe('nbaPlayoffs');
    const r1 = bracket.series!.find((s) => s.teamASeed === 1 && s.teamBSeed === 8);
    expect(r1).toBeTruthy();
    const seeds = seedPreviewNba(save.standings, 'East');
    expect(seeds[0].seed).toBe(1);
    expect(bracketForDisplay(save)?.status).toBe('projected');
  });
});
