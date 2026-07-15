import { colleges } from '../data/colleges';
import { archetype, overall } from './derived';
import {
  CareerGoal,
  CareerSave,
  CareerSaveSnapshot,
  DraftInformation,
  PlayerContract,
  PlayerInjury,
  PlayerMorale,
  Position,
  Ratings,
} from './models';

export type GodModeEditCommand =
  | { type: 'UPDATE_PLAYER_RATINGS'; playerId: string; ratings: Partial<Ratings> }
  | { type: 'UPDATE_PLAYER_TRAITS'; playerId: string; traitIds: string[] }
  | {
      type: 'CHANGE_PLAYER_POSITION';
      playerId: string;
      primaryPosition: Position;
      secondaryPosition?: Position;
    }
  | { type: 'CHANGE_PLAYER_COLLEGE'; playerId: string; collegeId: string | null }
  | { type: 'CORRECT_DRAFT_INFORMATION'; playerId: string; draft: DraftInformation }
  | { type: 'UPDATE_PLAYER_INJURY'; playerId: string; injury: PlayerInjury }
  | { type: 'UPDATE_CAREER_GOALS'; playerId: string; goals: CareerGoal[] }
  | { type: 'UPDATE_PLAYER_MORALE'; playerId: string; morale: PlayerMorale }
  | { type: 'REPLACE_ACTIVE_CONTRACT'; playerId: string; contract: PlayerContract | null };

const ALLOWED = new Set<GodModeEditCommand['type']>([
  'UPDATE_PLAYER_RATINGS',
  'UPDATE_PLAYER_TRAITS',
  'CHANGE_PLAYER_POSITION',
  'CHANGE_PLAYER_COLLEGE',
  'CORRECT_DRAFT_INFORMATION',
  'UPDATE_PLAYER_INJURY',
  'UPDATE_CAREER_GOALS',
  'UPDATE_PLAYER_MORALE',
  'REPLACE_ACTIVE_CONTRACT',
]);

export function isAllowedGodModeCommand(type: string): boolean {
  return ALLOWED.has(type as GodModeEditCommand['type']);
}

export function snapshotForBackup(save: CareerSave): CareerSaveSnapshot {
  const { godModeBackup: _, ...rest } = save;
  return structuredClone(rest);
}

export function previewGodMode(save: CareerSave, command: GodModeEditCommand): {
  ok: boolean;
  error?: string;
  derived?: { overall: number; archetype: string };
  summary: string;
} {
  if (!save.settings.godMode) return { ok: false, error: 'God Mode is disabled for this save.', summary: '' };
  if (!isAllowedGodModeCommand(command.type)) {
    return { ok: false, error: `Command ${command.type} is not allowed.`, summary: '' };
  }
  if (command.playerId !== 'user' && command.playerId !== save.id) {
    // Only user-controlled player edits in this solo career build
    return { ok: false, error: 'Only the user-controlled player can be edited in this build.', summary: '' };
  }

  const nextPlayer = { ...save.player };
  let summary = '';

  switch (command.type) {
    case 'UPDATE_PLAYER_RATINGS':
      nextPlayer.ratings = { ...nextPlayer.ratings, ...command.ratings };
      summary = `Update ratings: ${Object.keys(command.ratings).join(', ')}`;
      break;
    case 'UPDATE_PLAYER_TRAITS':
      nextPlayer.traitIds = command.traitIds.slice(0, 2);
      summary = `Traits → ${nextPlayer.traitIds.join(', ') || 'none'}`;
      break;
    case 'CHANGE_PLAYER_POSITION':
      nextPlayer.position = command.primaryPosition;
      nextPlayer.secondaryPosition = command.secondaryPosition;
      summary = `Position → ${command.primaryPosition}`;
      break;
    case 'CHANGE_PLAYER_COLLEGE':
      if (command.collegeId && !colleges.some((c) => c.id === command.collegeId)) {
        return { ok: false, error: 'Unknown college id.', summary: '' };
      }
      summary = `College → ${command.collegeId ?? 'none'}`;
      break;
    case 'CORRECT_DRAFT_INFORMATION':
      summary = `Draft info corrected`;
      break;
    case 'UPDATE_PLAYER_INJURY':
      summary = `Injury → ${command.injury.type} (${command.injury.gamesRemaining}g)`;
      break;
    case 'UPDATE_CAREER_GOALS':
      summary = `Goals updated (${command.goals.length})`;
      break;
    case 'UPDATE_PLAYER_MORALE':
      summary = `Morale → ${command.morale.overall}`;
      break;
    case 'REPLACE_ACTIVE_CONTRACT':
      summary = command.contract
        ? `Contract → $${command.contract.amount}k thru ${command.contract.exp}`
        : 'Contract cleared';
      break;
  }

  return {
    ok: true,
    summary,
    derived: { overall: overall(nextPlayer), archetype: archetype(nextPlayer) },
  };
}

export function applyGodModeCommand(
  save: CareerSave,
  command: GodModeEditCommand,
): { ok: true; save: CareerSave } | { ok: false; error: string } {
  const preview = previewGodMode(save, command);
  if (!preview.ok) return { ok: false, error: preview.error ?? 'Rejected' };

  const backup = save.godModeBackup ?? snapshotForBackup(save);
  let next: CareerSave = {
    ...save,
    godModeBackup: backup,
    customized: true,
    updatedAt: new Date().toISOString(),
  };

  switch (command.type) {
    case 'UPDATE_PLAYER_RATINGS':
      next = {
        ...next,
        player: { ...next.player, ratings: { ...next.player.ratings, ...command.ratings } },
      };
      break;
    case 'UPDATE_PLAYER_TRAITS':
      next = {
        ...next,
        player: { ...next.player, traitIds: command.traitIds.slice(0, 2) },
      };
      break;
    case 'CHANGE_PLAYER_POSITION':
      next = {
        ...next,
        player: {
          ...next.player,
          position: command.primaryPosition,
          secondaryPosition: command.secondaryPosition,
        },
      };
      break;
    case 'CHANGE_PLAYER_COLLEGE':
      next = { ...next, collegeId: command.collegeId };
      break;
    case 'CORRECT_DRAFT_INFORMATION':
      next = { ...next, draft: command.draft };
      break;
    case 'UPDATE_PLAYER_INJURY':
      next = { ...next, injury: command.injury };
      break;
    case 'UPDATE_CAREER_GOALS':
      next = { ...next, goals: command.goals };
      break;
    case 'UPDATE_PLAYER_MORALE':
      next = { ...next, morale: command.morale };
      break;
    case 'REPLACE_ACTIVE_CONTRACT':
      next = { ...next, contract: command.contract };
      break;
  }

  next = {
    ...next,
    godModeLog: [
      ...next.godModeLog,
      {
        id: crypto.randomUUID(),
        at: next.updatedAt,
        commandType: command.type,
        summary: preview.summary,
        playerId: command.playerId,
      },
    ],
    history: [...next.history, `God Mode: ${preview.summary}`],
  };

  return { ok: true, save: next };
}

export function undoGodModeSession(save: CareerSave): CareerSave | null {
  if (!save.godModeBackup) return null;
  const restored = structuredClone(save.godModeBackup) as CareerSave;
  restored.godModeBackup = null;
  restored.customized = true;
  restored.godModeLog = [
    ...save.godModeLog,
    {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      commandType: 'UNDO_SESSION',
      summary: 'Undid latest God Mode session',
      playerId: 'user',
    },
  ];
  restored.updatedAt = new Date().toISOString();
  return restored;
}
