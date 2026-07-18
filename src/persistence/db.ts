import Dexie, { Table } from 'dexie';
import {
  CareerSave,
  CharacterTemplate,
  GameLog,
  LeagueGameRecord,
  LeagueTransaction,
  PlayerSeasonLine,
  TeamSeasonRecord,
} from '../domain/models';

export interface SaveMeta {
  id: string;
  name: string;
  updatedAt: string;
  phase?: string;
  customized?: boolean;
}

export class HoopsDb extends Dexie {
  metadata!: Table<SaveMeta, string>;
  snapshots!: Table<CareerSave, string>;
  autosaves!: Table<CareerSave, string>;
  templates!: Table<CharacterTemplate, string>;
  gameLogs!: Table<GameLog, string>;
  leagueGames!: Table<LeagueGameRecord, string>;
  recovery!: Table<CareerSave, string>;
  playerSeasonStats!: Table<PlayerSeasonLine, string>;
  leagueTransactions!: Table<LeagueTransaction, string>;
  teamSeasonRecords!: Table<TeamSeasonRecord, string>;

  constructor() {
    super('browser-hoops-v2');
    this.version(1).stores({
      metadata: 'id, updatedAt',
      snapshots: 'id, updatedAt',
      autosaves: 'id, updatedAt',
      templates: 'id, createdAt',
      gameLogs: 'id, saveId, gameNumber',
      recovery: 'id, updatedAt',
    });
    this.version(2).stores({
      metadata: 'id, updatedAt',
      snapshots: 'id, updatedAt',
      autosaves: 'id, updatedAt',
      templates: 'id, createdAt',
      gameLogs: 'id, saveId, gameNumber',
      leagueGames: 'id, saveId, season, day, [saveId+season], [saveId+day]',
      recovery: 'id, updatedAt',
    });
    this.version(3).stores({
      metadata: 'id, updatedAt',
      snapshots: 'id, updatedAt',
      autosaves: 'id, updatedAt',
      templates: 'id, createdAt',
      gameLogs: 'id, saveId, gameNumber',
      leagueGames: 'id, saveId, season, day, [saveId+season], [saveId+day]',
      recovery: 'id, updatedAt',
      playerSeasonStats: 'id, saveId, playerId, season, [saveId+playerId], [saveId+season]',
      leagueTransactions: 'id, saveId, season, [saveId+season]',
      teamSeasonRecords: 'id, saveId, teamId, [saveId+teamId]',
    });
  }
}

export const db = new HoopsDb();

function metaFrom(save: CareerSave): SaveMeta {
  return {
    id: save.id,
    name: save.name,
    updatedAt: save.updatedAt,
    phase: save.phase,
    customized: save.customized,
  };
}

export async function saveCareer(save: CareerSave) {
  await db.transaction('rw', db.metadata, db.snapshots, async () => {
    await db.snapshots.put(save);
    await db.metadata.put(metaFrom(save));
  });
}

export async function persistSimulationStep(
  save: CareerSave,
  log: GameLog,
  leagueGames: LeagueGameRecord[] = [],
) {
  await db.transaction(
    'rw',
    [db.metadata, db.snapshots, db.autosaves, db.gameLogs, db.leagueGames, db.recovery],
    async () => {
      await db.gameLogs.put(log);
      if (leagueGames.length) {
        await db.leagueGames.bulkPut(leagueGames);
      }
      await db.snapshots.put(save);
      await db.autosaves.put(save);
      await db.recovery.put(save);
      await db.metadata.put(metaFrom(save));
    },
  );
}

export async function listSaves() {
  return db.metadata.orderBy('updatedAt').reverse().toArray();
}

export async function loadCareer(id: string) {
  return db.snapshots.get(id);
}

export async function deleteCareer(id: string) {
  await db.transaction(
    'rw',
    [
      db.metadata,
      db.snapshots,
      db.autosaves,
      db.gameLogs,
      db.leagueGames,
      db.recovery,
      db.playerSeasonStats,
      db.leagueTransactions,
      db.teamSeasonRecords,
    ],
    async () => {
      await db.metadata.delete(id);
      await db.snapshots.delete(id);
      await db.autosaves.delete(id);
      await db.recovery.delete(id);
      await db.gameLogs.where('saveId').equals(id).delete();
      await db.leagueGames.where('saveId').equals(id).delete();
      await db.playerSeasonStats.where('saveId').equals(id).delete();
      await db.leagueTransactions.where('saveId').equals(id).delete();
      await db.teamSeasonRecords.where('saveId').equals(id).delete();
    },
  );
}

export async function renameCareer(id: string, name: string) {
  const save = await db.snapshots.get(id);
  if (!save) return;
  const updated = {
    ...save,
    name,
    settings: { ...save.settings, careerName: name },
    updatedAt: new Date().toISOString(),
  };
  await saveCareer(updated);
}

export async function duplicateCareer(id: string) {
  const save = await db.snapshots.get(id);
  if (!save) return null;
  const copy: CareerSave = {
    ...structuredClone(save),
    id: crypto.randomUUID(),
    name: `${save.name} (Copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveCareer(copy);
  const logs = await loadGameLogs(id);
  for (const log of logs) {
    await db.gameLogs.put({ ...log, id: crypto.randomUUID(), saveId: copy.id });
  }
  const league = await loadLeagueGames(id);
  for (const g of league) {
    await db.leagueGames.put({ ...g, id: crypto.randomUUID(), saveId: copy.id });
  }
  const seasonLines = await loadPlayerSeasonLines(id);
  for (const row of seasonLines) {
    await db.playerSeasonStats.put({
      ...row,
      id: crypto.randomUUID(),
      saveId: copy.id,
    });
  }
  const txs = await loadLeagueTransactions(id);
  for (const t of txs) {
    await db.leagueTransactions.put({ ...t, id: crypto.randomUUID(), saveId: copy.id });
  }
  const teamRecs = await db.teamSeasonRecords.where('saveId').equals(id).toArray();
  for (const r of teamRecs) {
    await db.teamSeasonRecords.put({ ...r, id: crypto.randomUUID(), saveId: copy.id });
  }
  return copy;
}

export async function loadGameLogs(saveId: string) {
  return db.gameLogs.where('saveId').equals(saveId).reverse().sortBy('gameNumber');
}

export async function loadLeagueGames(saveId: string) {
  return db.leagueGames.where('saveId').equals(saveId).toArray();
}

export async function loadLeagueGamesForDay(saveId: string, day: number) {
  return db.leagueGames.where('[saveId+day]').equals([saveId, day]).toArray();
}

export async function loadLeagueGame(id: string) {
  return db.leagueGames.get(id);
}

export async function loadLeagueGamesForSeason(saveId: string, season: number) {
  return db.leagueGames.where('[saveId+season]').equals([saveId, season]).toArray();
}

/** Keep seasons >= currentSeason - retentionYears + 1 */
export async function pruneLeagueGames(
  saveId: string,
  currentSeason: number,
  retentionYears: number,
) {
  const keepFrom = Math.max(1, currentSeason - Math.max(1, retentionYears) + 1);
  const all = await db.leagueGames.where('saveId').equals(saveId).toArray();
  const stale = all.filter((g) => g.season < keepFrom).map((g) => g.id);
  if (stale.length) await db.leagueGames.bulkDelete(stale);
  return stale.length;
}

export async function bulkPutPlayerSeasonLines(rows: PlayerSeasonLine[]) {
  if (!rows.length) return;
  await db.playerSeasonStats.bulkPut(rows);
}

export async function loadPlayerSeasonLines(saveId: string, playerId?: string) {
  if (playerId) {
    return db.playerSeasonStats.where('[saveId+playerId]').equals([saveId, playerId]).toArray();
  }
  return db.playerSeasonStats.where('saveId').equals(saveId).toArray();
}

export async function bulkPutLeagueTransactions(rows: LeagueTransaction[]) {
  if (!rows.length) return;
  await db.leagueTransactions.bulkPut(rows);
}

export async function loadLeagueTransactions(saveId: string, season?: number) {
  if (season != null) {
    return db.leagueTransactions.where('[saveId+season]').equals([saveId, season]).toArray();
  }
  return db.leagueTransactions.where('saveId').equals(saveId).toArray();
}

export async function loadTeamTransactions(saveId: string, teamId: string) {
  const all = await loadLeagueTransactions(saveId);
  return all
    .filter((t) => t.teamIds.includes(teamId))
    .sort((a, b) => b.season - a.season || b.dateKey.localeCompare(a.dateKey));
}

export async function loadPlayerTransactions(saveId: string, playerId: string) {
  const all = await loadLeagueTransactions(saveId);
  return all
    .filter((t) => t.playerIds.includes(playerId))
    .sort((a, b) => b.season - a.season || b.dateKey.localeCompare(a.dateKey));
}

export async function bulkPutTeamSeasonRecords(rows: TeamSeasonRecord[]) {
  if (!rows.length) return;
  await db.teamSeasonRecords.bulkPut(rows);
}

export async function loadTeamSeasonRecords(saveId: string, teamId: string) {
  return db.teamSeasonRecords.where('[saveId+teamId]').equals([saveId, teamId]).toArray();
}

export async function listTemplates() {
  return db.templates.orderBy('createdAt').reverse().toArray();
}

export async function saveTemplate(template: CharacterTemplate) {
  await db.templates.put(template);
}

export async function deleteTemplate(id: string) {
  await db.templates.delete(id);
}

export async function renameTemplate(id: string, name: string) {
  const t = await db.templates.get(id);
  if (!t) return;
  await db.templates.put({ ...t, name, updatedAt: new Date().toISOString() });
}

export async function duplicateTemplate(id: string) {
  const t = await db.templates.get(id);
  if (!t) return null;
  const copy: CharacterTemplate = {
    ...structuredClone(t),
    id: crypto.randomUUID(),
    name: `${t.name} (Copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.templates.put(copy);
  return copy;
}

export function exportSaveJson(
  save: CareerSave,
  logs: GameLog[],
  leagueGames: LeagueGameRecord[] = [],
) {
  return JSON.stringify(
    {
      format: 'BrowserHoopsSave',
      version: 3,
      save,
      logs,
      leagueGames,
    },
    null,
    2,
  );
}

export function exportTemplateJson(template: CharacterTemplate) {
  return JSON.stringify(
    {
      format: 'BrowserHoopsTemplate',
      version: 1,
      template: {
        name: template.name,
        player: template.player,
      },
    },
    null,
    2,
  );
}

export async function importSaveJson(raw: string) {
  const data = JSON.parse(raw);
  if (data.format !== 'BrowserHoopsSave') throw new Error('Not a BrowserHoops save file');
  const save: CareerSave = {
    ...data.save,
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  await saveCareer(save);
  if (Array.isArray(data.logs)) {
    for (const log of data.logs) {
      await db.gameLogs.put({ ...log, id: crypto.randomUUID(), saveId: save.id });
    }
  }
  if (Array.isArray(data.leagueGames)) {
    for (const g of data.leagueGames) {
      await db.leagueGames.put({ ...g, id: crypto.randomUUID(), saveId: save.id });
    }
  }
  return save;
}

export async function importTemplateJson(raw: string) {
  const data = JSON.parse(raw);
  if (data.format !== 'BrowserHoopsTemplate') throw new Error('Not a BrowserHoops template');
  const template: CharacterTemplate = {
    id: crypto.randomUUID(),
    name: data.template.name,
    player: data.template.player,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveTemplate(template);
  return template;
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
