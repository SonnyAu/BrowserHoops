import Dexie, { Table } from 'dexie';
import { CareerSave, CharacterTemplate, GameLog } from '../domain/models';
export interface SaveMeta { id: string; name: string; updatedAt: string; }
export class HoopsDb extends Dexie { metadata!: Table<SaveMeta,string>; snapshots!: Table<CareerSave,string>; autosaves!: Table<CareerSave,string>; templates!: Table<CharacterTemplate,string>; gameLogs!: Table<GameLog,string>; constructor(){ super('browser-hoops'); this.version(1).stores({ metadata:'id, updatedAt', snapshots:'id, updatedAt', autosaves:'id, updatedAt', templates:'id, createdAt', gameLogs:'id, saveId, gameNumber' }); } }
export const db = new HoopsDb();
export async function saveCareer(save: CareerSave) { await db.transaction('rw', db.metadata, db.snapshots, async()=>{ await db.snapshots.put(save); await db.metadata.put({id:save.id,name:save.name,updatedAt:save.updatedAt}); }); }
export async function persistSimulationStep(save: CareerSave, log: GameLog) { await db.transaction('rw', db.metadata, db.snapshots, db.autosaves, db.gameLogs, async()=>{ await db.gameLogs.put(log); await db.snapshots.put(save); await db.autosaves.put(save); await db.metadata.put({id:save.id,name:save.name,updatedAt:save.updatedAt}); }); }
