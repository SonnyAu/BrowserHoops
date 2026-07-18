import { describe, expect, it } from 'vitest';
import { createCareer } from '../domain/createCareer';
import { defaultPlayer, defaultSettings } from '../domain/defaults';
import { DraftPoolProspect, DraftPositionCounts, Position } from '../domain/models';
import { Rng } from '../domain/rng';
import {
  advanceDraftPick,
  beginDraft,
  needScore,
  selectProspect,
  skipDraftToEnd,
} from './draft';

function counts(partial: Partial<DraftPositionCounts>): DraftPositionCounts {
  return { PG: 0, SG: 0, SF: 0, PF: 0, C: 0, ...partial };
}

function prospect(
  id: string,
  position: Position,
  overall: number,
  potential = overall + 5,
): DraftPoolProspect {
  return {
    id,
    name: id,
    position,
    overall,
    potential,
    value: overall * 0.65 + potential * 0.35,
    isUser: false,
  };
}

describe('dynamic BPA + need draft', () => {
  it('same seed produces the same pick sequence', () => {
    const mk = () => {
      let save = createCareer(
        defaultPlayer(),
        { ...defaultSettings(), seed: 'draft-det' },
        'duke',
      );
      save.id = 'draft-det-id';
      save = beginDraft(save);
      save = skipDraftToEnd(save);
      return save.draftBoard!.picks.map((p) => `${p.teamId}:${p.prospectId}`);
    };
    expect(mk()).toEqual(mk());
  });

  it('team with no PGs prefers a slightly worse PG over a better SF', () => {
    const pool = [
      prospect('sf-star', 'SF', 82),
      prospect('pg-need', 'PG', 79),
      prospect('c-ok', 'C', 78),
    ];
    const remaining = pool.map((p) => p.id);
    const teamNeeds = { 'team-a': counts({ PG: 0, SG: 2, SF: 3, PF: 2, C: 2 }) };
    const rng = new Rng('need-pg');
    const pick = selectProspect('team-a', remaining, pool, teamNeeds, rng, 5);
    expect(pick.id).toBe('pg-need');
  });

  it('after filling PG depth, need score drops for another PG', () => {
    expect(needScore('PG', counts({ PG: 0 }))).toBeGreaterThan(needScore('PG', counts({ PG: 3 })));
    expect(needScore('PG', counts({ PG: 1 }))).toBeGreaterThan(needScore('PG', counts({ PG: 4 })));
  });

  it('selecting a PG reduces that team hunger on the next pick', () => {
    const pool = [
      prospect('pg1', 'PG', 80),
      prospect('pg2', 'PG', 79),
      prospect('sf1', 'SF', 78),
    ];
    let remaining = pool.map((p) => p.id);
    const teamNeeds = { 'team-a': counts({ PG: 0, SG: 2, SF: 2, PF: 2, C: 2 }) };
    const first = selectProspect('team-a', remaining, pool, teamNeeds, new Rng('n1'), 1);
    expect(first.position).toBe('PG');
    remaining = remaining.filter((id) => id !== first.id);
    teamNeeds['team-a'].PG += 1;
    // With PG filled to 1 and another strong PG vs SF — still may take PG once, but at 3 PGs SF wins
    teamNeeds['team-a'].PG = 3;
    const second = selectProspect('team-a', remaining, pool, teamNeeds, new Rng('n2'), 31);
    expect(second.id).toBe('sf1');
  });

  it('live board assigns prospects only when advancing', () => {
    let save = createCareer(
      defaultPlayer(),
      { ...defaultSettings(), seed: 'live-assign' },
      'duke',
    );
    save.id = 'live-assign';
    save = beginDraft(save);
    expect(save.draftBoard!.picks[0].prospectName).toBe('TBD');
    expect(save.draftBoard!.remainingIds).toContain('user');
    save = advanceDraftPick(save);
    expect(save.draftBoard!.picks[0].revealed).toBe(true);
    expect(save.draftBoard!.picks[0].prospectId).toBeTruthy();
    expect(save.draftBoard!.picks[0].prospectName).not.toBe('TBD');
    expect(save.draftBoard!.remainingIds).not.toContain(save.draftBoard!.picks[0].prospectId);
  });

  it('user can be selected mid-board via BPA + need (not a pre-locked slot)', () => {
    let save = createCareer(
      { ...defaultPlayer(), intendedStars: 5 },
      { ...defaultSettings(), seed: 'user-dynamic' },
      'duke',
    );
    save.id = 'user-dynamic';
    save = {
      ...save,
      draftStock: 92,
      player: {
        ...save.player,
        ratings: Object.fromEntries(
          (
            [
              'hgt',
              'stre',
              'spd',
              'jmp',
              'endu',
              'ins',
              'dnk',
              'ft',
              'fg',
              'tp',
              'oiq',
              'diq',
              'drb',
              'pss',
              'reb',
            ] as const
          ).map((k) => [k, 88]),
        ) as typeof save.player.ratings,
      },
    };
    save = beginDraft(save);
    expect(save.draftBoard!.userPick).toBeNull();
    save = skipDraftToEnd(save);
    const userSlot = save.draftBoard!.picks.find((p) => p.isUser);
    // Elite user should usually be drafted
    expect(userSlot || save.draft?.undrafted === false || save.draft?.pick != null).toBeTruthy();
    if (userSlot) {
      expect(userSlot.pick).toBeGreaterThanOrEqual(1);
      expect(userSlot.pick).toBeLessThanOrEqual(60);
    }
  });
});
