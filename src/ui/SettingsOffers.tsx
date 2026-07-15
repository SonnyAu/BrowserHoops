import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCollege } from '../data/colleges';
import { createCareer } from '../domain/createCareer';
import { LOCKED_AFTER_CREATE, MUTABLE_AFTER_CREATE } from '../domain/models';
import { saveCareer } from '../persistence/db';
import { generateOffers, generateRecruitingProfile } from '../simulation/recruiting';
import { useNewCareer } from './NewCareerContext';

export function SettingsOffers() {
  const nav = useNavigate();
  const { player, settings, setSettings } = useNewCareer();
  const [starting, setStarting] = useState(false);

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
      <div className="grid-2">
        <section className="panel panel-pad stack">
          <h2 className="card-title">Settings</h2>
          <label className="field">Career name
            <input
              value={settings.careerName}
              onChange={(e) => setSettings({ ...settings, careerName: e.target.value })}
            />
          </label>
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
          <div className="grid-2">
            {(
              [
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
              ] as const
            ).map(([key, label]) => (
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
          </div>
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
          <div className="stack">
            {(
              [
                ['playIn', 'Play-in tournament'],
                ['salaryCap', 'Salary cap rules'],
                ['interruptOnInjury', 'Interrupt on injury'],
                ['interruptOnRoleChange', 'Interrupt on role change'],
                ['interruptOnDecisions', 'Interrupt on decisions'],
                ['godMode', 'Enable God Mode'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(settings[key])}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Locked after creation: {LOCKED_AFTER_CREATE.join(', ')}. Mutable later: {MUTABLE_AFTER_CREATE.join(', ')}.
          </p>
          {settings.godMode ? (
            <p className="tag warn">
              God Mode allows editing ratings, position, college, draft info, injury, goals, morale, and active contract only.
            </p>
          ) : null}
        </section>

        <section className="panel panel-pad">
          <h2 className="card-title">High school recruiting profile</h2>
          <p>{recruiting.summary}</p>
          <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)', margin: '12px 0' }}>
            <div className="stat"><b>#{recruiting.nationalRank}</b><span>National</span></div>
            <div className="stat"><b>#{recruiting.positionalRank}</b><span>Position</span></div>
            <div className="stat"><b>#{recruiting.stateRank}</b><span>State</span></div>
            <div className="stat">
              <b>{recruiting.stars}★</b>
              <span>Stars</span>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            HS line: {recruiting.highSchoolStats.ppg} / {recruiting.highSchoolStats.rpg} / {recruiting.highSchoolStats.apg}
            {' · '}Scout confidence {recruiting.scoutConfidence}%
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            Accolades: {recruiting.accolades.join(' · ') || '—'}
          </p>
          <p style={{ fontSize: 13 }}>
            Strengths: {recruiting.strengths.join(', ')} · Weaknesses: {recruiting.weaknesses.join(', ')}
          </p>
        </section>
      </div>

      <section className="panel panel-pad" style={{ marginTop: 12 }}>
        <h2 className="card-title">Choose one of four offers</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Elite / ranked / mid / build-around tradeoffs based on your recruiting profile and real D1 programs.
        </p>
        <div className="offer-grid">
          {offers.map((o) => {
            const c = getCollege(o.collegeId)!;
            return (
              <button
                key={o.collegeId}
                className="offer-card"
                style={{ ['--team-accent' as string]: c.colors[0] }}
                disabled={starting}
                onClick={() => commit(o.collegeId)}
              >
                <h3>{c.name}</h3>
                <div className="tag">{o.tradeoff}</div>
                <div className="meta" style={{ marginTop: 8 }}>
                  <span>{c.conference} · {c.city}, {c.state}</span>
                  <span>Prestige {c.prestige} · Preseason {c.preseasonRank ?? 'NR'}</span>
                  <span>Coach {c.coaching} · Dev {c.development}</span>
                  <span>{o.expectedRole} · {o.expectedMinutes} min</span>
                  <span>Scrutiny {o.scrutiny} · Exposure {o.nationalExposure}</span>
                  <span>Scheme fit {o.schemeFit} · Draft vis {o.draftVisibility}</span>
                  <span>{o.pitch}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
      </div>
    </div>
  );
}
