import { z } from 'zod';

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type RatingKey = 'shooting' | 'finishing' | 'playmaking' | 'defense' | 'rebounding' | 'athleticism';
export const ratingKeys: RatingKey[] = ['shooting','finishing','playmaking','defense','rebounding','athleticism'];
export type Ratings = Record<RatingKey, number>;
export interface PlayerBuild { name: string; position: Position; heightInches: number; weightPounds: number; hometown: string; playStyle: string; personality: 'Leader'|'Grinder'|'Showman'|'Technician'; ratings: Ratings; }
export interface CareerSettings { seed: string; autosaveFrequency: 'afterEveryGame'|'weekly'; difficulty: 'balanced'|'forgiving'|'harsh'; }
export interface College { id: string; name: string; region: string; conference: string; prestige: number; pace: number; development: number; style: string; }
export interface RecruitingProfile { rank: number; stars: 1|2|3|4|5; projectedRole: string; scoutConfidence: number; strengths: string[]; weaknesses: string[]; summary: string; }
export interface CollegeOffer { collegeId: string; scholarship: boolean; promisedRole: string; fitScore: number; minutes: number; pitch: string; }
export interface GameLog { id: string; saveId: string; season: number; gameNumber: number; opponent: string; result: 'W'|'L'; teamScore: number; opponentScore: number; points: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number; minutes: number; createdAt: string; }
export interface CareerSave { id: string; name: string; player: PlayerBuild; settings: CareerSettings; collegeId: string; recruiting: RecruitingProfile; offers: CollegeOffer[]; season: number; nextGame: number; createdAt: string; updatedAt: string; history: string[]; }
export interface CharacterTemplate { id: string; name: string; player: PlayerBuild; createdAt: string; }

export const ratingSchema = z.number().int().min(25).max(99);
export const playerBuildSchema = z.object({ name:z.string().min(1), position:z.enum(['PG','SG','SF','PF','C']), heightInches:z.number().int().min(66).max(88), weightPounds:z.number().int().min(150).max(320), hometown:z.string().min(1), playStyle:z.string().min(1), personality:z.enum(['Leader','Grinder','Showman','Technician']), ratings:z.object({ shooting:ratingSchema, finishing:ratingSchema, playmaking:ratingSchema, defense:ratingSchema, rebounding:ratingSchema, athleticism:ratingSchema }) });
export const settingsSchema = z.object({ seed:z.string().min(1), autosaveFrequency:z.enum(['afterEveryGame','weekly']), difficulty:z.enum(['balanced','forgiving','harsh']) });
