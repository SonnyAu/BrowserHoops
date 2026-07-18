import { describe, expect, it } from 'vitest';
import { colleges, getCollege } from '../data/colleges';
import {
  contrastRatio,
  jerseyFaceColors,
  resolveCollegeIdFromName,
  resolveCollegeIdFromPlayer,
} from './collegeLookup';

describe('collegeLookup', () => {
  it('resolves common pack college names', () => {
    expect(resolveCollegeIdFromName('Duke')).toBe('duke');
    expect(resolveCollegeIdFromName('UNC')).toBe('north-carolina');
    expect(resolveCollegeIdFromName('Michigan')).toBe('michigan');
    expect(resolveCollegeIdFromName('UConn')).toBe('connecticut');
    expect(resolveCollegeIdFromName('G League Ignite')).toBeNull();
    expect(resolveCollegeIdFromName('')).toBeNull();
  });

  it('prefers collegeId on league players', () => {
    expect(
      resolveCollegeIdFromPlayer({ college: 'Wrong', collegeId: 'duke' }),
    ).toBe('duke');
    expect(
      resolveCollegeIdFromPlayer({ college: 'Kansas', collegeId: null }),
    ).toBe('kansas');
  });

  it('keeps IRL Duke and Michigan face colors', () => {
    const duke = getCollege('duke')!;
    const mich = getCollege('michigan')!;
    expect(duke.colors[0].toUpperCase()).toBe('#003087');
    expect(duke.colors[1].toUpperCase()).toBe('#FFFFFF');
    expect(mich.colors[0].toUpperCase()).toBe('#00274C');
    expect(mich.colors[1].toUpperCase()).toBe('#FFCB05');
    const dukeFace = jerseyFaceColors(duke.colors);
    const michFace = jerseyFaceColors(mich.colors);
    expect(dukeFace.bg.toUpperCase()).toBe('#003087');
    expect(dukeFace.fg.toUpperCase()).toBe('#FFFFFF');
    expect(michFace.bg.toUpperCase()).toBe('#00274C');
    expect(michFace.fg.toUpperCase()).toBe('#FFCB05');
  });

  it('only rescues pathological contrast without rewriting brand secondaries', () => {
    const ok = jerseyFaceColors(['#00274C', '#FFCB05']);
    expect(ok.fg.toUpperCase()).toBe('#FFCB05');
    const bad = jerseyFaceColors(['#73000A', '#000000']);
    expect(contrastRatio(bad.bg, bad.fg)).toBeGreaterThanOrEqual(1.8);
  });

  it('prestige schools use readable IRL primary/secondary pairs', () => {
    const top = colleges.filter((c) => c.prestige >= 80);
    const weak = top
      .filter((c) => contrastRatio(c.colors[0], c.colors[1]) < 1.8)
      .map((c) => `${c.id}:${c.colors[0]}/${c.colors[1]}`)
      .sort();
    expect(weak, weak.join('\n')).toEqual([]);
  });
});
