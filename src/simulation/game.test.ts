import { describe, expect, it } from 'vitest';
import { createCareer } from '../domain/createCareer';
import { PlayerBuild } from '../domain/models';
import { generateOffers } from './recruiting';
import { simulateCollegeGame } from './game';
const player: PlayerBuild={name:'Test Guard',position:'PG',heightInches:74,weightPounds:190,hometown:'Test',playStyle:'Creator',personality:'Leader',ratings:{shooting:80,finishing:72,playmaking:82,defense:70,rebounding:50,athleticism:75}};
describe('vertical slice simulation',()=>{
 it('generates exactly four college offers',()=>{ const save=createCareer(player,{seed:'same',autosaveFrequency:'afterEveryGame',difficulty:'balanced'}); expect(save.offers).toHaveLength(4); });
 it('replays the same game deterministically from same seed and state',()=>{ const save=createCareer(player,{seed:'same',autosaveFrequency:'afterEveryGame',difficulty:'balanced'},'north-coast'); save.id='stable'; const a=simulateCollegeGame(save).log; const b=simulateCollegeGame(save).log; expect({...a,createdAt:''}).toEqual({...b,createdAt:''}); });
});
