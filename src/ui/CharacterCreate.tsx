import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  archetype,
  computeTruePotential,
  estimatedPotentialRange,
  formatDelta,
  overall,
  playerSimilarities,
  scoutedPotential,
  strengthsWeaknesses,
} from '../domain/derived';
import { defaultPlayer } from '../domain/defaults';
import {
  ATTR_GROUPS,
  ATTR_LABELS,
  AttrKey,
  CharacterTemplate,
  Personality,
  Position,
  ProspectPathId,
} from '../domain/models';
import { adjustRating, canIncrease, pointPool, remainingPoints } from '../domain/points';
import {
  PROSPECT_PATH_IDS,
  getProspectPath,
  pathFromStars,
  resolvePlayerPath,
} from '../domain/prospectPaths';
import { applyProspectPath } from '../domain/starPresets';
import { TRAITS, canSelectTrait, getEffectiveRatings, getTrait, syncHeightRating } from '../domain/traits';
import {
  deleteTemplate,
  downloadText,
  duplicateTemplate,
  exportTemplateJson,
  importTemplateJson,
  listTemplates,
  renameTemplate,
  saveTemplate,
} from '../persistence/db';
import { useNewCareer } from './NewCareerContext';

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const PERSONALITIES: Personality[] = ['Leader', 'Grinder', 'Showman', 'Technician', 'Competitor'];
const STYLES = [
  'Three-level scorer',
  'Floor general',
  'Two-way wing',
  'Rim runner',
  'Stretch big',
  'Lockdown defender',
  'Slashing athlete',
];

export function CharacterCreate() {
  const nav = useNavigate();
  const { player, setPlayer } = useNewCareer();
  const [templates, setTemplates] = useState<CharacterTemplate[]>([]);
  const [attrTab, setAttrTab] = useState(ATTR_GROUPS[0].id);
  const eff = getEffectiveRatings(player);
  const ovr = overall(player);
  const path = resolvePlayerPath(player);
  const truePot = computeTruePotential(player, {
    age: 18,
    stars: player.intendedStars,
    potBonus: path.potBonus,
  });
  const pot = scoutedPotential(player, { truePotential: truePot, potentialBias: 0 });
  const potRange = estimatedPotentialRange(player);
  const arch = archetype(player);
  const sw = strengthsWeaknesses(player);
  const sims = playerSimilarities(player);
  const left = remainingPoints(player);
  const pool = pointPool(player);
  const pathId = player.prospectPath ?? pathFromStars(player.intendedStars);
  const { position, heightInches } = player;
  const baseline = useMemo(
    () =>
      applyProspectPath(
        { ...defaultPlayer(), position, heightInches, traitIds: [] },
        pathId,
      ).ratings,
    [pathId, position, heightInches],
  );
  const baselineOvr = overall({ ...player, ratings: baseline, traitIds: [] });
  const activeGroup = ATTR_GROUPS.find((g) => g.id === attrTab) ?? ATTR_GROUPS[0];

  async function refresh() {
    setTemplates(await listTemplates());
  }
  useEffect(() => {
    refresh();
  }, []);

  function setProspectPath(id: ProspectPathId) {
    setPlayer(applyProspectPath(player, id));
  }

  function toggleTrait(id: string) {
    if (player.traitIds.includes(id)) {
      setPlayer({ ...player, traitIds: player.traitIds.filter((t) => t !== id) });
      return;
    }
    if (!canSelectTrait(player.intendedStars, id, player.traitIds)) return;
    const next = { ...player, traitIds: [...player.traitIds, id] };
    if (remainingPoints(next) < 0) return;
    setPlayer(next);
  }

  async function saveAsTemplate() {
    const name = prompt('Template name', `${player.name} ${player.intendedStars}★`) ?? player.name;
    await saveTemplate({
      id: crypto.randomUUID(),
      name,
      player,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await refresh();
  }

  return (
    <div className="flow-page">
      <div className="flow-top">
        <Link className="btn" to="/">← Saves</Link>
        <span className="step-pill">Step 1 · Character</span>
        <h1>Create your player</h1>
      </div>

      <div className="flow-body">
        <div className="workspace-h cols-3">
          <div className="stack pane-scroll">
            <section className="panel panel-pad">
              <h2 className="card-title">Prospect path</h2>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                Your origin story. The path sets your starting ability and how
                scouts project your ceiling — stars drive recruiting interest.
              </p>
              <div className="prospect-path-list">
                {PROSPECT_PATH_IDS.map((id) => {
                  const def = getProspectPath(id);
                  const selected = pathId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`prospect-path-row ${selected ? 'is-selected' : ''}`}
                      onClick={() => setProspectPath(id)}
                      title={def.pitch}
                    >
                      <span className="prospect-path-stars">{def.stars}★</span>
                      <span className="prospect-path-body">
                        <strong>{def.label}</strong>
                        <span className="muted">{def.examples}</span>
                      </span>
                      <span className="prospect-path-ovr">~{def.targetOvr} OVR</span>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const [lo, hi] = path.earlyMinutes;
                return (
                  <>
                    <p style={{ fontSize: 14, margin: '10px 0 4px' }}>
                      <strong>
                        {path.stars}★ · {path.label}
                      </strong>
                      <span className="muted">
                        {' '}
                        · target ~{path.targetOvr} · live {ovr} · early minutes ~{lo}–{hi}
                      </span>
                    </p>
                    <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
                      {path.pitch} Budget {pool} pts · {left} left. Attributes auto-set; fine-tune if you want.
                    </p>
                  </>
                );
              })()}
            </section>

            <section className="panel panel-pad">
              <h2 className="card-title">Identity</h2>
              <div className="grid-2">
                <label className="field">Name
                  <input value={player.name} onChange={(e) => setPlayer({ ...player, name: e.target.value })} />
                </label>
                <label className="field">Birthplace
                  <input value={player.birthplace} onChange={(e) => setPlayer({ ...player, birthplace: e.target.value })} />
                </label>
                <label className="field">Home region
                  <select value={player.homeRegion} onChange={(e) => setPlayer({ ...player, homeRegion: e.target.value })}>
                    {['East', 'Midwest', 'South', 'West', 'Plains', 'Mountain'].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label className="field">High school
                  <input value={player.highSchool} onChange={(e) => setPlayer({ ...player, highSchool: e.target.value })} />
                </label>
                <label className="field">Primary
                  <select
                    value={player.position}
                    onChange={(e) =>
                      setPlayer(
                        applyProspectPath(
                          { ...player, position: e.target.value as Position },
                          pathId,
                        ),
                      )
                    }
                  >
                    {POSITIONS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
                <label className="field">Secondary
                  <select
                    value={player.secondaryPosition ?? ''}
                    onChange={(e) =>
                      setPlayer({
                        ...player,
                        secondaryPosition: (e.target.value || undefined) as Position | undefined,
                      })
                    }
                  >
                    <option value="">None</option>
                    {POSITIONS.filter((p) => p !== player.position).map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label className="field">Height (in)
                  <input
                    type="number"
                    min={66}
                    max={88}
                    value={player.heightInches}
                    onChange={(e) => {
                      const nextHeight = Number(e.target.value);
                      setPlayer({
                        ...player,
                        heightInches: nextHeight,
                        ratings: syncHeightRating(player.ratings, nextHeight),
                      });
                    }}
                  />
                </label>
                <label className="field">Weight (lb)
                  <input
                    type="number"
                    min={150}
                    max={320}
                    value={player.weightPounds}
                    onChange={(e) => setPlayer({ ...player, weightPounds: Number(e.target.value) })}
                  />
                </label>
                <label className="field">Wingspan (in)
                  <input
                    type="number"
                    min={66}
                    max={95}
                    value={player.wingspanInches}
                    onChange={(e) => setPlayer({ ...player, wingspanInches: Number(e.target.value) })}
                  />
                </label>
                <label className="field">Hand
                  <select
                    value={player.dominantHand}
                    onChange={(e) => setPlayer({ ...player, dominantHand: e.target.value as 'Left' | 'Right' })}
                  >
                    <option>Right</option>
                    <option>Left</option>
                  </select>
                </label>
                <label className="field">Jersey #
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={player.jerseyNumber}
                    onChange={(e) => setPlayer({ ...player, jerseyNumber: Number(e.target.value) })}
                  />
                </label>
                <label className="field">Play style
                  <select value={player.playStyle} onChange={(e) => setPlayer({ ...player, playStyle: e.target.value })}>
                    {STYLES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label className="field">Personality
                  <select
                    value={player.personality}
                    onChange={(e) => setPlayer({ ...player, personality: e.target.value as Personality })}
                  >
                    {PERSONALITIES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <section className="panel panel-pad">
              <h2 className="card-title">Special traits (0–2)</h2>
              <div className="chip-grid">
                {TRAITS.map((t) => {
                  const selected = player.traitIds.includes(t.id);
                  const eligible = canSelectTrait(player.intendedStars, t.id, player.traitIds);
                  return (
                    <button
                      key={t.id}
                      className={`btn ${selected ? 'primary' : ''}`}
                      style={{ opacity: eligible || selected ? 1 : 0.45 }}
                      disabled={!eligible && !selected}
                      onClick={() => toggleTrait(t.id)}
                      title={`${t.summary} · ${t.pointCost} pts · ${t.minStars}★`}
                    >
                      <strong>{t.name}</strong>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {t.pointCost} pts · {t.minStars}★
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <section className="panel panel-pad pane-scroll">
            <h2 className="card-title">Attributes</h2>
            <div className="attr-tabs">
              {ATTR_GROUPS.map((group) => (
                <button
                  key={group.id}
                  className={`btn ${attrTab === group.id ? 'primary' : ''}`}
                  onClick={() => setAttrTab(group.id)}
                >
                  {group.label}
                </button>
              ))}
            </div>
            <div className="attr-edit-list">
              {activeGroup.keys.map((key) => {
                const base = player.ratings[key];
                const effective = eff[key];
                const delta = base - (baseline[key] ?? base);
                const traitBonus = effective - base;
                return (
                  <div className="rating-row" key={key}>
                    <span>{ATTR_LABELS[key]}</span>
                    <div className="meter">
                      <div className="meter-fill" style={{ width: `${effective}%` }} />
                    </div>
                    <strong className="mono">
                      {effective}
                      {traitBonus > 0 ? <span className="tag good" style={{ marginLeft: 4 }}>+{traitBonus}</span> : null}
                      {delta !== 0 && key !== 'hgt' ? (
                        <span className="muted" style={{ marginLeft: 4, fontSize: 11 }}>({formatDelta(delta)})</span>
                      ) : null}
                    </strong>
                    {key === 'hgt' ? (
                      <span className="muted" style={{ fontSize: 11 }}>height</span>
                    ) : (
                      <div className="row">
                        <button className="btn" onClick={() => setPlayer(adjustRating(player, key, -1))}>−</button>
                        <button
                          className="btn"
                          disabled={!canIncrease(player, key as AttrKey)}
                          onClick={() => setPlayer(adjustRating(player, key as AttrKey, 1))}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="sticky-rail">
            <section className="panel panel-pad">
              <h2 className="card-title">Build summary</h2>
              <p style={{ fontSize: 22, margin: '0 0 8px', fontWeight: 700 }}>
                Overall: {ovr}{' '}
                <span className="muted" style={{ fontSize: 16 }}>
                  ({formatDelta(ovr - baselineOvr) || '0'})
                </span>
              </p>
              <p style={{ fontSize: 18, margin: '0 0 12px', fontWeight: 600 }}>
                Potential: {pot}{' '}
                <span className="muted" style={{ fontSize: 14 }}>
                  (range {potRange[0]}–{potRange[1]})
                </span>
              </p>
              <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat"><b>{player.intendedStars}★</b><span>{path.label}</span></div>
                <div className="stat"><b>{left}</b><span>Pts left</span></div>
                <div className="stat"><b>{player.traitIds.length}/2</b><span>Traits</span></div>
              </div>
              <p><strong>{arch}</strong></p>
              <p className="muted" style={{ fontSize: 13 }}>
                Strengths: {sw.strengths.join(', ')} · Weaknesses: {sw.weaknesses.join(', ')}
              </p>
              {player.traitIds.length > 0 ? (
                <p style={{ fontSize: 13 }}>
                  Traits: {player.traitIds.map((id) => getTrait(id)?.name).join(', ')}
                </p>
              ) : null}
              <h3 style={{ fontSize: 13, marginBottom: 6 }}>Style similarities</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                <li>Offensive ≈ {sims.offensive}</li>
                <li>Defensive ≈ {sims.defensive}</li>
                <li>Physical ≈ {sims.physical}</li>
              </ul>
            </section>

            <section className="panel panel-pad">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 className="card-title" style={{ margin: 0 }}>Templates</h2>
                <label className="btn">
                  Import
                  <input
                    hidden
                    type="file"
                    accept="application/json"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      await importTemplateJson(await f.text());
                      await refresh();
                    }}
                  />
                </label>
              </div>
              {templates.length === 0 ? (
                <p className="muted">No templates saved.</p>
              ) : (
                templates.map((t) => (
                  <div key={t.id} className="row" style={{ marginBottom: 8, justifyContent: 'space-between' }}>
                    <button
                      className="btn ghost"
                      onClick={() => {
                        const migrated = t.player.prospectPath
                          ? t.player
                          : {
                              ...t.player,
                              prospectPath: pathFromStars(t.player.intendedStars),
                            };
                        setPlayer(migrated);
                      }}
                    >
                      <strong>{t.name}</strong>
                      <span className="muted" style={{ marginLeft: 8 }}>{overall(t.player)} OVR</span>
                    </button>
                    <div className="row">
                      <button className="btn" onClick={() => downloadText(`${t.name}.json`, exportTemplateJson(t))}>Export</button>
                      <button className="btn" onClick={async () => { const n = prompt('Rename', t.name); if (n) { await renameTemplate(t.id, n); await refresh(); } }}>Rename</button>
                      <button className="btn" onClick={async () => { await duplicateTemplate(t.id); await refresh(); }}>Dup</button>
                      <button className="btn danger" onClick={async () => { await deleteTemplate(t.id); await refresh(); }}>Del</button>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>
      </div>

      <div className="flow-actions">
        <button className="btn" onClick={saveAsTemplate}>Save template</button>
        <button className="btn primary" disabled={left < 0} onClick={() => nav('/new/settings')}>
          Continue to settings
        </button>
      </div>
    </div>
  );
}
