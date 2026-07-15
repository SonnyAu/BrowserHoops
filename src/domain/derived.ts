import { PlayerBuild, ratingKeys } from './models';
export function overall(p: PlayerBuild) { return Math.round(ratingKeys.reduce((s,k)=>s+p.ratings[k],0)/ratingKeys.length); }
export function archetype(p: PlayerBuild) { const r=p.ratings; if(r.shooting>=r.finishing&&r.shooting>=r.defense) return 'Shot Creator'; if(r.defense+r.rebounding>r.shooting+r.playmaking) return 'Defensive Anchor'; if(r.playmaking>=75) return 'Floor General'; return 'Two-Way Prospect'; }
export function similarities(p: PlayerBuild) { const o=overall(p); return o>82?['program changer','lottery hopeful']:o>72?['high-major starter','all-conference upside']:['developmental rotation piece','late bloomer']; }
