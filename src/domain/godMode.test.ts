import { describe, expect, it } from 'vitest';
import { createCareer } from './createCareer';
import { defaultPlayer, defaultSettings } from './defaults';
import { applyGodModeCommand, undoGodModeSession } from './godMode';

describe('God Mode restrictions', () => {
  it('rejects edits when God Mode is off', () => {
    const save = createCareer(defaultPlayer(), defaultSettings(), 'duke');
    const result = applyGodModeCommand(save, {
      type: 'UPDATE_PLAYER_MORALE',
      playerId: 'user',
      morale: { overall: 99, roleSatisfaction: 99, coachRelationship: 99, teammateChemistry: 99 },
    });
    expect(result.ok).toBe(false);
  });

  it('backs up and undoes a session', () => {
    const save = createCareer(defaultPlayer(), { ...defaultSettings(), godMode: true }, 'duke');
    const edited = applyGodModeCommand(save, {
      type: 'CHANGE_PLAYER_POSITION',
      playerId: 'user',
      primaryPosition: 'PG',
      secondaryPosition: 'SG',
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.save.player.position).toBe('PG');
    const undone = undoGodModeSession(edited.save);
    expect(undone?.player.position).toBe(save.player.position);
  });

  it('can replace active contract only', () => {
    const save = createCareer(defaultPlayer(), { ...defaultSettings(), godMode: true }, 'duke');
    const result = applyGodModeCommand(save, {
      type: 'REPLACE_ACTIVE_CONTRACT',
      playerId: 'user',
      contract: { amount: 5000, exp: 2029, type: 'rookie', option: 'team' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.save.contract?.amount).toBe(5000);
  });
});
