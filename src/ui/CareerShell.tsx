import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getCollege } from '../data/colleges';
import { getProTeam, getProTeamByTid } from '../data/nbaTeams';
import { nbaPlayers } from '../data/nbaPlayers';
import { archetype, formatDelta, overall, scoutedPotential } from '../domain/derived';
import {
  applyGodModeCommand,
  GodModeEditCommand,
  previewGodMode,
  undoGodModeSession,
} from '../domain/godMode';
import {
  ATTR_GROUPS,
  ATTR_LABELS,
  AttrKey,
  CareerSave,
  GameLog,
  TrainingFocus,
  spendableAttrKeys,
} from '../domain/models';
import { TRAITS, getEffectiveRatings, getTrait } from '../domain/traits';
import { loadCareer, loadGameLogs, saveCareer } from '../persistence/db';
import { acknowledgeSeasonReview, assignRole, resolveDecision } from '../simulation/game';
import { DraftNight } from './DraftNight';
import { SimTarget, useSimController } from './useSimController';

const NAV = [
  { to: 'home', label: 'Home' },
  { to: 'training', label: 'Training' },
  { to: 'decisions', label: 'Decisions' },
  { to: 'history', label: 'Career history' },
  { to: 'leaderboards', label: 'Leaderboards' },
  { to: 'review', label: 'Season review' },
  { to: 'draft', label: 'Draft night' },
  { to: 'godmode', label: 'God Mode' },
  { to: 'legacy', label: 'Legacy' },
] as const;

const SIM_TARGETS: SimTarget[] = [
  'one game',
  'week',
  'month',
  'all-star break',
  'trade deadline',
  'playoffs',
  'season',
];

export function CareerShell() {
  const { saveId } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const [career, setCareer] = useState<CareerSave>();
  const [logs, setLogs] = useState<GameLog[]>([]);
  const { isSim, sim, pause } = useSimController(career, setCareer, setLogs);

  useEffect(() => {
    if (!saveId) return;
    (async () => {
      const c = await loadCareer(saveId);
      if (!c) {
        nav('/');
        return;
      }
      setCareer(c);
      setLogs(await loadGameLogs(saveId));
    })();
  }, [saveId, nav]);

  useEffect(() => {
    if (!career) return;
    const base = `/career/${career.id}`;
    if (career.phase === 'seasonReview' && !location.pathname.endsWith('/review')) {
      nav(`${base}/review`, { replace: true });
    } else if (career.phase === 'draft' && !location.pathname.endsWith('/draft')) {
      nav(`${base}/draft`, { replace: true });
    }
  }, [career?.phase, career?.id, location.pathname, nav]);

  const teamAccent = useMemo(() => {
    if (!career) return '#1f6feb';
    if ((career.phase === 'professional' || career.phase === 'draft') && career.proTeamId) {
      return getProTeam(career.proTeamId)?.colors[0] ?? '#1f6feb';
    }
    if (career.phase === 'draft') return '#0b1a2e';
    return getCollege(career.collegeId ?? '')?.colors[0] ?? '#1f6feb';
  }, [career]);

  const teamName = useMemo(() => {
    if (!career) return '';
    if (career.phase === 'professional' && career.proTeamId) {
      const t = getProTeam(career.proTeamId);
      return t ? `${t.region} ${t.name}` : 'NBA';
    }
    return getCollege(career.collegeId ?? '')?.name ?? 'College';
  }, [career]);

  const persist = useCallback(async (next: CareerSave) => {
    await saveCareer(next);
    setCareer(next);
  }, []);

  if (!career) return <div className="dashboard">Loading career…</div>;

  const role = assignRole(career);
  const nextGame = career.schedule.find((g) => !g.completed);
  const simBlocked =
    career.retired ||
    career.phase === 'seasonReview' ||
    career.phase === 'draft' ||
    career.pendingDecisions.some((d) => d.interrupt);

  return (
    <div className="career-shell" style={{ ['--team-accent' as string]: teamAccent }}>
      <aside className="sidebar">
        <div className="player-chip">
          <strong>{career.player.name}</strong>
          <span>
            {teamName} · {career.phase} · S{career.season}
          </span>
          <span>
            {overall(career.player)} OVR · {career.role}
          </span>
        </div>
        {NAV.map((item) => {
          if (item.to === 'godmode' && !career.settings.godMode) return null;
          if (item.to === 'draft' && career.phase !== 'draft' && !career.draftBoard) return null;
          return (
            <NavLink key={item.to} to={`/career/${career.id}/${item.to}`} label={item.label} />
          );
        })}
        <div className="sidebar-foot">
          <Link className="nav-btn" to="/">← Save dashboard</Link>
        </div>
      </aside>

      <div className="career-main">
        <div className="simbar">
          <span className="label">Sim</span>
          {SIM_TARGETS.map((t) => (
            <button key={t} disabled={isSim || simBlocked} onClick={() => sim(t)}>
              {t}
            </button>
          ))}
          <button className="pause" disabled={!isSim} onClick={pause}>
            Pause
          </button>
          <span className="sim-status">
            {career.wins}-{career.losses}
            {career.phase === 'seasonReview'
              ? ' · Season review'
              : career.phase === 'draft'
                ? ' · Draft night'
                : nextGame
                  ? ` · Next: ${nextGame.opponentName}`
                  : ' · Season break'}
            {isSim ? ' · Simulating…' : ''}
          </span>
        </div>

        <div className="workspace">
          {career.phase !== 'seasonReview' &&
            career.phase !== 'draft' &&
            career.pendingDecisions
              .filter((d) => d.interrupt)
              .slice(0, 1)
              .map((d) => (
                <div className="decision-banner" key={d.id}>
                  <strong>{d.title}</strong>
                  <p style={{ margin: '6px 0' }}>{d.body}</p>
                  <div className="row">
                    {d.choices.map((c) => (
                      <button
                        key={c.id}
                        className="btn primary"
                        onClick={async () => {
                          const next = resolveDecision(career, d.id, c.id);
                          await persist(next);
                        }}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

          <Routes>
            <Route index element={<Navigate to="home" replace />} />
            <Route
              path="home"
              element={
                <HomeView career={career} role={role} teamName={teamName} logs={logs} nextGame={nextGame} />
              }
            />
            <Route
              path="training"
              element={<TrainingView career={career} onChange={persist} />}
            />
            <Route
              path="decisions"
              element={
                <DecisionsView
                  career={career}
                  onChoose={async (id, choice) => persist(resolveDecision(career, id, choice))}
                />
              }
            />
            <Route path="history" element={<HistoryView career={career} logs={logs} />} />
            <Route path="leaderboards" element={<LeaderboardsView career={career} logs={logs} />} />
            <Route
              path="review"
              element={
                <ReviewView
                  career={career}
                  onContinue={async () => {
                    const next = acknowledgeSeasonReview(career);
                    await persist(next);
                    nav(`/career/${career.id}/decisions`);
                  }}
                />
              }
            />
            <Route path="draft" element={<DraftNight career={career} onUpdate={persist} />} />
            <Route
              path="godmode"
              element={
                career.settings.godMode ? (
                  <GodModeView
                    career={career}
                    onApply={async (cmd) => {
                      const result = applyGodModeCommand(career, cmd);
                      if (!result.ok) {
                        alert(result.error);
                        return;
                      }
                      await persist(result.save);
                    }}
                    onUndo={async () => {
                      const restored = undoGodModeSession(career);
                      if (!restored) {
                        alert('No God Mode session to undo.');
                        return;
                      }
                      await persist(restored);
                    }}
                  />
                ) : (
                  <Navigate to="home" replace />
                )
              }
            />
            <Route path="legacy" element={<LegacyView career={career} />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function NavLink({ to, label }: { to: string; label: string }) {
  const { pathname } = useLocation();
  const active = pathname.endsWith('/' + to.split('/').pop());
  return (
    <Link className={`nav-btn ${active ? 'active' : ''}`} to={to}>
      {label}
    </Link>
  );
}

function HomeView({
  career,
  role,
  teamName,
  logs,
  nextGame,
}: {
  career: CareerSave;
  role: ReturnType<typeof assignRole>;
  teamName: string;
  logs: GameLog[];
  nextGame?: CareerSave['schedule'][0];
}) {
  const eff = getEffectiveRatings(career.player);
  const ovr = overall(career.player);
  const pot = scoutedPotential(career.player, career.hidden);
  const ovrDelta = ovr - career.ovrAtSeasonStart;
  const potDelta = pot - career.potAtSeasonStart;

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <b>
            {ovr}
            {formatDelta(ovrDelta) ? ` (${formatDelta(ovrDelta)})` : ''}
          </b>
          <span>OVR</span>
        </div>
        <div className="stat">
          <b>
            {pot}
            {formatDelta(potDelta) ? ` (${formatDelta(potDelta)})` : ''}
          </b>
          <span>POT</span>
        </div>
        <div className="stat"><b>{career.wins}-{career.losses}</b><span>Record</span></div>
        <div className="stat"><b>{role.minutes}</b><span>Minutes</span></div>
        <div className="stat"><b>{career.rosterStatus}</b><span>Status</span></div>
        <div className="stat"><b>{Math.round(career.draftStock)}</b><span>Draft stock</span></div>
      </div>
      <div className="grid-2">
        <section className="panel panel-pad">
          <h2 className="card-title">Home dashboard</h2>
          <p>
            <strong>{career.player.name}</strong> · {archetype(career.player)} · {career.role}
          </p>
          <p className="muted">
            {teamName} · Age {career.age} · Status {career.rosterStatus}
            {career.injury.gamesRemaining > 0 ? ` · ${career.injury.type} (${career.injury.gamesRemaining}g)` : ''}
          </p>
          <p className="muted">
            Coach trust {career.coachTrust} · Morale {career.morale.overall} · Training {career.trainingFocus}
          </p>
          <p className="muted">
            Next: {nextGame ? `${nextGame.home ? 'vs' : '@'} ${nextGame.opponentName}` : 'No games scheduled'}
          </p>
          {career.collegeRoster.length > 0 ? (
            <p style={{ fontSize: 13 }}>
              Teammates:{' '}
              {career.collegeRoster
                .slice(0, 4)
                .map((m) => `${m.name} (${m.overall})`)
                .join(', ')}
            </p>
          ) : null}
          {career.player.traitIds.length > 0 ? (
            <p style={{ fontSize: 13 }}>
              Traits: {career.player.traitIds.map((id) => getTrait(id)?.name ?? id).join(', ')}
            </p>
          ) : null}
          {career.contract ? (
            <p className="muted">
              Contract ${career.contract.amount}k through {career.contract.exp} ({career.contract.type})
            </p>
          ) : null}
          {career.draft ? (
            <p className="muted">
              Draft: {career.draft.undrafted ? 'Undrafted' : `R${career.draft.round} P${career.draft.pick}`} ({career.draft.year})
            </p>
          ) : null}
          {career.customized ? <span className="tag warn">Save customized via God Mode</span> : null}
        </section>
        <section className="panel panel-pad">
          <h2 className="card-title">Attributes</h2>
          <div className="attr-sheet">
            {ATTR_GROUPS.map((group) => (
              <div key={group.id}>
                <h3 style={{ fontSize: 11, margin: '0 0 4px', color: 'var(--muted)' }}>{group.label}</h3>
                {group.keys.map((key) => {
                  const base = career.player.ratings[key];
                  const effective = eff[key];
                  const seasonDelta = base - (career.ratingsAtSeasonStart[key] ?? base);
                  const traitBonus = effective - base;
                  return (
                    <div className="rating-row" key={key}>
                      <span>{ATTR_LABELS[key]}</span>
                      <strong className="mono">
                        {effective}
                        {traitBonus > 0 ? ` (+${traitBonus})` : ''}
                        {seasonDelta !== 0 ? ` ${formatDelta(seasonDelta)}` : ''}
                      </strong>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="panel panel-pad">
        <h2 className="card-title">Recent games</h2>
        {logs.filter((l) => l.opponent !== 'Season Complete').slice(0, 8).length === 0 ? (
          <p className="muted">No games yet. Use the sim bar to advance one game at a time.</p>
        ) : (
          <div className="table-wrap recent-games-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>G</th>
                  <th>Opp</th>
                  <th>Res</th>
                  <th>PTS</th>
                  <th>REB</th>
                  <th>AST</th>
                  <th>MIN</th>
                </tr>
              </thead>
              <tbody>
                {logs
                  .filter((l) => l.opponent !== 'Season Complete')
                  .slice(0, 10)
                  .map((l) => (
                    <tr key={l.id}>
                      <td>{l.gameNumber}</td>
                      <td>{l.opponent}</td>
                      <td>{l.result} {l.teamScore}-{l.opponentScore}</td>
                      <td>{l.points}</td>
                      <td>{l.rebounds}</td>
                      <td>{l.assists}</td>
                      <td>{l.minutes}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function TrainingView({
  career,
  onChange,
}: {
  career: CareerSave;
  onChange: (c: CareerSave) => Promise<void>;
}) {
  const focuses: TrainingFocus[] = [
    'shooting',
    'finishing',
    'playmaking',
    'defense',
    'rebounding',
    'athleticism',
    'iq',
    'conditioning',
    'recovery',
    'balanced',
  ];
  return (
    <section className="panel panel-pad">
      <h2 className="card-title">Training focus</h2>
      <p className="muted">
        Progress is gradual and uncertain. Intense work raises fatigue and injury risk.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        {focuses.map((f) => (
          <button
            key={f}
            className={`btn ${career.trainingFocus === f ? 'primary' : ''}`}
            onClick={() => onChange({ ...career, trainingFocus: f, updatedAt: new Date().toISOString() })}
          >
            {f}
          </button>
        ))}
      </div>
      <label className="field" style={{ maxWidth: 240 }}>
        Intensity
        <select
          value={career.trainingIntensity}
          onChange={(e) =>
            onChange({
              ...career,
              trainingIntensity: e.target.value as CareerSave['trainingIntensity'],
              updatedAt: new Date().toISOString(),
            })
          }
        >
          <option value="light">Light</option>
          <option value="normal">Normal</option>
          <option value="intense">Intense</option>
        </select>
      </label>
    </section>
  );
}

function DecisionsView({
  career,
  onChoose,
}: {
  career: CareerSave;
  onChoose: (id: string, choice: string) => Promise<void>;
}) {
  if (career.phase === 'seasonReview') {
    return (
      <section className="panel panel-pad">
        <h2 className="card-title">Career decisions</h2>
        <p className="muted">Finish the season review first, then declare or return.</p>
        <Link className="btn primary" to={`/career/${career.id}/review`}>Open season review</Link>
      </section>
    );
  }
  return (
    <section className="panel panel-pad">
      <h2 className="card-title">Career decisions</h2>
      {career.pendingDecisions.length === 0 ? (
        <p className="muted">No open decisions. Keep simulating — events interrupt when relevant.</p>
      ) : (
        career.pendingDecisions.map((d) => (
          <div key={d.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <strong>{d.title}</strong>
            <p>{d.body}</p>
            <div className="row">
              {d.choices.map((c) => (
                <button key={c.id} className="btn primary" onClick={() => onChoose(d.id, c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
      <h3 className="card-title">Goals</h3>
      <ul>
        {career.goals.map((g) => (
          <li key={g.id} className={g.completed ? 'muted' : ''}>
            {g.completed ? '✓' : '○'} {g.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function HistoryView({ career, logs }: { career: CareerSave; logs: GameLog[] }) {
  return (
    <div className="stack">
      <section className="panel panel-pad">
        <h2 className="card-title">Career timeline</h2>
        {career.history.slice().reverse().slice(0, 40).map((h, i) => (
          <p key={i} className="muted" style={{ margin: '4px 0', fontSize: 13 }}>{h}</p>
        ))}
      </section>
      <section className="panel panel-pad">
        <h2 className="card-title">Transactions & awards</h2>
        {career.transactions.map((t, i) => (
          <p key={i} style={{ fontSize: 13 }}>S{t.season}: {t.type} — {t.detail}</p>
        ))}
        {career.awards.length === 0 ? <p className="muted">No awards yet.</p> : null}
        {career.awards.map((a, i) => (
          <p key={i}>S{a.season}: {a.type}</p>
        ))}
      </section>
      <section className="panel panel-pad">
        <h2 className="card-title">Game log</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>S</th><th>G</th><th>Opp</th><th>Result</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>MIN</th><th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{l.season}</td>
                  <td>{l.gameNumber}</td>
                  <td>{l.opponent}</td>
                  <td>{l.result} {l.teamScore}-{l.opponentScore}</td>
                  <td>{l.points}</td>
                  <td>{l.rebounds}</td>
                  <td>{l.assists}</td>
                  <td>{l.steals}</td>
                  <td>{l.blocks}</td>
                  <td>{l.minutes}</td>
                  <td>{l.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function LeaderboardsView({ career, logs }: { career: CareerSave; logs: GameLog[] }) {
  const careerPts = logs.reduce((s, l) => s + l.points, 0);
  const leagueLeaders = [...nbaPlayers]
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 15);

  return (
    <div className="grid-2">
      <section className="panel panel-pad">
        <h2 className="card-title">Your career totals</h2>
        <p>Points: {careerPts}</p>
        <p>Games logged: {logs.filter((l) => l.minutes > 0).length}</p>
        <p>Wins: {career.wins} · Seasons reviewed: {career.seasonReviews.length}</p>
      </section>
      <section className="panel panel-pad">
        <h2 className="card-title">NBA overall leaders (league pack)</h2>
        <table className="data">
          <thead><tr><th>#</th><th>Player</th><th>Pos</th><th>OVR</th><th>Team</th></tr></thead>
          <tbody>
            {leagueLeaders.map((p, i) => (
              <tr key={p.id}>
                <td>{i + 1}</td>
                <td>{p.name}</td>
                <td>{p.position}</td>
                <td>{p.overall}</td>
                <td>{typeof p.tid === 'number' ? getProTeamByTid(p.tid)?.abbrev ?? p.tid : 'FA'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ReviewView({
  career,
  onContinue,
}: {
  career: CareerSave;
  onContinue: () => Promise<void>;
}) {
  const latest = career.seasonReviews[career.seasonReviews.length - 1];
  const needsAck = career.phase === 'seasonReview' && latest && !latest.acknowledged;

  return (
    <section className="panel panel-pad">
      <h2 className="card-title">End of season</h2>
      {career.seasonReviews.length === 0 ? (
        <p className="muted">Finish a season to unlock a review.</p>
      ) : (
        <>
          {latest ? (
            <article
              style={{
                marginBottom: 20,
                padding: 16,
                border: needsAck ? '2px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 6,
                background: needsAck ? '#f0f6ff' : undefined,
              }}
            >
              <h3 style={{ margin: '0 0 6px' }}>
                Season {latest.season} · {latest.teamName} · {latest.record}
              </h3>
              <p style={{ fontSize: 18, fontWeight: 650, margin: '8px 0' }}>
                Overall: {latest.ovr} ({formatDelta(latest.ovrDelta) || '0'}) · Potential: {latest.pot}{' '}
                ({formatDelta(latest.potDelta) || '0'})
              </p>
              <p>
                {latest.ppg.toFixed(1)} PPG · {latest.rpg.toFixed(1)} RPG · {latest.apg.toFixed(1)} APG ·{' '}
                {latest.gp} GP
              </p>
              <p>{latest.narrative}</p>
              <p className="muted">{latest.statsLine}</p>
              <p className="muted">Role: {latest.roleChange}</p>
              {latest.awards.length ? <p>Awards: {latest.awards.join(', ')}</p> : null}
              {needsAck ? (
                <button className="btn primary" style={{ marginTop: 12 }} onClick={onContinue}>
                  Continue
                </button>
              ) : null}
            </article>
          ) : null}
          {career.seasonReviews.length > 1 ? (
            <>
              <h3 className="card-title">Prior seasons</h3>
              {career.seasonReviews
                .slice(0, -1)
                .reverse()
                .map((r) => (
                  <article
                    key={`${r.season}-${r.phase}`}
                    style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}
                  >
                    <h3 style={{ margin: '0 0 6px' }}>
                      Season {r.season} · {r.teamName} · {r.record}
                    </h3>
                    <p className="muted">{r.statsLine}</p>
                    <p className="muted">{r.ratingChange}</p>
                  </article>
                ))}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

function LegacyView({ career }: { career: CareerSave }) {
  if (!career.retired) {
    return (
      <section className="panel panel-pad">
        <h2 className="card-title">Legacy</h2>
        <p className="muted">Retire to unlock the full legacy review.</p>
      </section>
    );
  }
  return (
    <section className="panel panel-pad">
      <h2 className="card-title">Retirement & legacy</h2>
      <p style={{ fontSize: 18 }}>{career.legacySummary}</p>
      <p>Legacy score: <strong>{career.legacyScore}</strong></p>
      <p className="muted">Awards: {career.awards.length} · Transactions: {career.transactions.length}</p>
    </section>
  );
}

function GodModeView({
  career,
  onApply,
  onUndo,
}: {
  career: CareerSave;
  onApply: (cmd: GodModeEditCommand) => Promise<void>;
  onUndo: () => Promise<void>;
}) {
  const [ratings, setRatings] = useState({ ...career.player.ratings });
  const [traitIds, setTraitIds] = useState<string[]>([...career.player.traitIds]);
  const [morale, setMorale] = useState(career.morale.overall);
  const preview = previewGodMode(career, {
    type: 'UPDATE_PLAYER_RATINGS',
    playerId: 'user',
    ratings,
  });

  function toggleTrait(id: string) {
    setTraitIds((prev) => {
      if (prev.includes(id)) return prev.filter((t) => t !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }

  return (
    <section className="panel panel-pad stack">
      <h2 className="card-title">Restricted God Mode</h2>
      <p className="muted">
        Edit base attributes and traits only. Overall / potential are derived.
      </p>
      {ATTR_GROUPS.map((group) => (
        <div key={group.id}>
          <h3 className="card-title">{group.label}</h3>
          <div className="grid-2">
            {group.keys.map((key) => (
              <label className="field" key={key}>
                {ATTR_LABELS[key]}
                <input
                  type="number"
                  min={0}
                  max={99}
                  disabled={key === 'hgt'}
                  value={ratings[key]}
                  onChange={(e) =>
                    setRatings({ ...ratings, [key]: Number(e.target.value) as number })
                  }
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <h3 className="card-title">Traits</h3>
      <div className="stack">
        {TRAITS.map((t) => (
          <label key={t.id} className="row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={traitIds.includes(t.id)}
              onChange={() => toggleTrait(t.id)}
            />
            <span>{t.name}</span>
          </label>
        ))}
      </div>
      {preview.ok ? (
        <p className="tag">Preview OVR {preview.derived?.overall} · {preview.derived?.archetype}</p>
      ) : (
        <p className="tag bad">{preview.error}</p>
      )}
      <div className="row">
        <button
          className="btn primary"
          onClick={() =>
            onApply({
              type: 'UPDATE_PLAYER_RATINGS',
              playerId: 'user',
              ratings: Object.fromEntries(
                spendableAttrKeys.map((k) => [k, ratings[k as AttrKey]]),
              ) as Partial<typeof ratings>,
            })
          }
        >
          Apply attributes
        </button>
        <button
          className="btn primary"
          onClick={() => onApply({ type: 'UPDATE_PLAYER_TRAITS', playerId: 'user', traitIds })}
        >
          Apply traits
        </button>
        <button
          className="btn"
          onClick={() =>
            onApply({
              type: 'UPDATE_PLAYER_MORALE',
              playerId: 'user',
              morale: { ...career.morale, overall: morale },
            })
          }
        >
          Set morale ({morale})
        </button>
        <input
          type="range"
          min={20}
          max={99}
          value={morale}
          onChange={(e) => setMorale(Number(e.target.value))}
        />
        <button className="btn" onClick={onUndo}>Undo session</button>
      </div>
      <h3 className="card-title">Edit log</h3>
      {career.godModeLog.length === 0 ? (
        <p className="muted">No edits yet.</p>
      ) : (
        career.godModeLog
          .slice()
          .reverse()
          .map((e) => (
            <p key={e.id} className="muted" style={{ fontSize: 12 }}>
              {new Date(e.at).toLocaleString()} — {e.commandType}: {e.summary}
            </p>
          ))
      )}
    </section>
  );
}
