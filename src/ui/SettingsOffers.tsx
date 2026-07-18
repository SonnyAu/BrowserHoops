import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCollege } from '../data/colleges';
import { createCareer } from '../domain/createCareer';
import { LOCKED_AFTER_CREATE, MUTABLE_AFTER_CREATE } from '../domain/models';
import { saveCareer } from '../persistence/db';
import { generateOffers, generateRecruitingProfile } from '../simulation/recruiting';
import { useNewCareer } from './NewCareerContext';

type SettingsTab = 'core' | 'rates' | 'rules';

const RATE_FIELDS = [
  ['progressionRate', 'Progression'],
  ['regressionRate', 'Regression'],
  ['injuryFrequency', 'Injury frequency'],
  ['injurySeverity', 'Injury severity'],
  ['fatigueImpact', 'Fatigue impact'],
  ['trainingEffectiveness', 'Training'],
  ['tradeFrequency', 'Trade frequency'],
  ['tradeRequestDifficulty', 'Trade request difficulty'],
  ['contractDifficulty', 'Contract difficulty'],
  ['eventFrequency', 'Event frequency'],
  ['newsFrequency', 'News frequency'],
] as const;

const RULE_FIELDS = [
  ['playIn', 'Play-in tournament'],
  ['salaryCap', 'Salary cap rules'],
  ['interruptOnInjury', 'Interrupt on injury'],
  ['interruptOnRoleChange', 'Interrupt on role change'],
  ['interruptOnDecisions', 'Interrupt on decisions'],
  ['godMode', 'Enable God Mode'],
] as const;

export function SettingsOffers() {
  const nav = useNavigate();
  const { player, settings, setSettings } = useNewCareer();
  const [starting, setStarting] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('core');
  const [pickedCollege, setPickedCollege] = useState<string | null>(null);

  const recruiting = useMemo(
    () => generateRecruitingProfile(player, settings.seed),
    [player, settings.seed],
  );
  const offers = useMemo(
    () => generateOffers(player, recruiting, settings.seed),
    [player, recruiting, settings.seed],
  );

  async function commit(collegeId: string) {
    setStarting(true);
    const career = createCareer(player, settings, collegeId);
    await saveCareer(career);
    nav(`/career/${career.id}/home`);
  }

  return (
    <div className="flow-page">
      <div className="flow-top">
        <Link className="btn" to="/new/create">← Character</Link>
        <span className="step-pill">Step 2 · Settings & recruiting</span>
        <h1>Career settings</h1>
      </div>

      <div className="flow-body">
        <div className="workspace-h cols-2">
          <section className="panel panel-pad pane-scroll settings-panel">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 className="card-title" style={{ margin: 0 }}>Settings</h2>
              <div className="settings-tabs" style={{ margin: 0 }}>
                {(
                  [
                    ['core', 'Core'],
                    ['rates', 'Rates'],
                    ['rules', 'Rules'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`btn ${settingsTab === id ? 'primary' : ''}`}
                    onClick={() => setSettingsTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {settingsTab === 'core' ? (
              <div className="stack">
                <label className="field">Career name
                  <input
                    value={settings.careerName}
                    onChange={(e) => setSettings({ ...settings, careerName: e.target.value })}
                  />
                </label>
                <div className="grid-2">
                  <label className="field">Difficulty
                    <select
                      value={settings.difficulty}
                      onChange={(e) => setSettings({ ...settings, difficulty: e.target.value as typeof settings.difficulty })}
                    >
                      <option value="forgiving">Forgiving</option>
                      <option value="balanced">Balanced</option>
                      <option value="harsh">Harsh</option>
                    </select>
                  </label>
                  <label className="field">Simulation realism
                    <select
                      value={settings.simulationRealism}
                      onChange={(e) =>
                        setSettings({ ...settings, simulationRealism: e.target.value as typeof settings.simulationRealism })
                      }
                    >
                      <option value="arcade">Arcade</option>
                      <option value="balanced">Balanced</option>
                      <option value="sim">Sim</option>
                    </select>
                  </label>
                  <label className="field">College season length
                    <input
                      type="number"
                      min={20}
                      max={40}
                      value={settings.collegeSeasonLength}
                      onChange={(e) => setSettings({ ...settings, collegeSeasonLength: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field">Pro season length
                    <input
                      type="number"
                      min={50}
                      max={82}
                      value={settings.proSeasonLength}
                      onChange={(e) => setSettings({ ...settings, proSeasonLength: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field">Box score retention (years)
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={settings.boxScoreRetentionYears ?? 3}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          boxScoreRetentionYears: Math.max(1, Math.min(10, Number(e.target.value) || 3)),
                        })
                      }
                    />
                  </label>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  League-wide box scores are kept for this many seasons. Locked after you start the career.
                </p>
                <label className="field">Autosave
                  <select
                    value={settings.autosaveFrequency}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        autosaveFrequency: e.target.value as typeof settings.autosaveFrequency,
                      })
                    }
                  >
                    <option value="afterEveryGame">After every game</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  Locked after creation: {LOCKED_AFTER_CREATE.join(', ')}. Mutable later: {MUTABLE_AFTER_CREATE.join(', ')}.
                </p>
              </div>
            ) : null}

            {settingsTab === 'rates' ? (
              <div className="grid-2">
                {RATE_FIELDS.map(([key, label]) => (
                  <label className="field" key={key}>
                    {label}
                    <input
                      type="number"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={settings[key]}
                      onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })}
                    />
                  </label>
                ))}
              </div>
            ) : null}

            {settingsTab === 'rules' ? (
              <div className="stack">
                <div className="check-list">
                  {RULE_FIELDS.map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={Boolean(settings[key])}
                        onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                {settings.godMode ? (
                  <p className="tag warn" style={{ margin: 0 }}>
                    God Mode allows editing ratings, position, college, draft info, injury, goals, morale, and active contract only.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <div className="stack pane-scroll">
            <section className="panel panel-pad">
              <h2 className="card-title">High school recruiting profile</h2>
              <p style={{ marginTop: 0 }}>{recruiting.summary}</p>
              <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)', margin: '12px 0' }}>
                <div className="stat"><b>#{recruiting.nationalRank}</b><span>National</span></div>
                <div className="stat"><b>#{recruiting.positionalRank}</b><span>Position</span></div>
                <div className="stat"><b>#{recruiting.stateRank}</b><span>State</span></div>
                <div className="stat">
                  <b>{recruiting.stars}★</b>
                  <span>Stars</span>
                </div>
              </div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
                HS: {recruiting.highSchoolStats.ppg} / {recruiting.highSchoolStats.rpg} / {recruiting.highSchoolStats.apg}
                {' · '}Scout {recruiting.scoutConfidence}%
                {' · '}{recruiting.accolades.join(' · ') || '—'}
              </p>
            </section>

            <section className="panel panel-pad">
              <h2 className="card-title">Choose one of four offers</h2>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                Always the same four paths for your star tier (elite / ranked / mid / build-around).
                Seed only changes which schools appear — not whether you get a playable offer.
                {player.intendedStars <= 2
                  ? ' Underdog tip: build-around schools start with real minutes.'
                  : player.intendedStars >= 4
                    ? ' High-star tip: you always get a true high-prestige elite option.'
                    : ''}
              </p>
              <div className="offer-grid compact">
                {offers.map((o) => {
                  const c = getCollege(o.collegeId)!;
                  const selected = pickedCollege === o.collegeId;
                  return (
                    <button
                      key={o.collegeId}
                      className="offer-card"
                      style={{
                        ['--team-accent' as string]: c.colors[0],
                        outline: selected ? '2px solid var(--accent)' : undefined,
                      }}
                      disabled={starting}
                      onClick={() => setPickedCollege(o.collegeId)}
                    >
                      <h3>{c.name}</h3>
                      <div className="tag">{o.tradeoff}</div>
                      <div className="meta" style={{ marginTop: 8 }}>
                        <span>{c.conference} · {c.city}, {c.state}</span>
                        <span>Prestige {c.prestige} · Preseason {c.preseasonRank ?? 'NR'}</span>
                        <span>{o.expectedRole} · {o.expectedMinutes} min</span>
                        <span>{o.pitch}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="flow-actions">
        <span className="muted" style={{ marginRight: 'auto', fontSize: 13 }}>
          {pickedCollege
            ? `Selected: ${getCollege(pickedCollege)?.name ?? pickedCollege}`
            : 'Select a school offer, then commit'}
        </span>
        <button
          className="btn primary"
          disabled={starting || !pickedCollege}
          onClick={() => pickedCollege && commit(pickedCollege)}
        >
          {starting ? 'Starting…' : 'Commit & start career'}
        </button>
      </div>
    </div>
  );
}
