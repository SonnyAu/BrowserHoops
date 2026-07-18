import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getCollege } from '../data/colleges';
import { getProTeam } from '../data/nbaTeams';
import { nbaPlayers } from '../data/nbaPlayers';
import {
  archetype,
  formatDelta,
  overall,
  scoutedPotential,
  underdogBreakoutNote,
} from '../domain/derived';
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
import {
  ensureConferenceInStandings,
  initialCollegeStandings,
  initialProStandings,
  listCollegeConferences,
  listProConferences,
} from '../simulation/schedule';
import { BracketPage } from './BracketPage';
import { DraftNight } from './DraftNight';
import { PlayerLink, TeamLink, teamIdFromTid } from './EntityLinks';
import { PlayerPage } from './PlayerPage';
import { ScheduleView } from './ScheduleView';
import { TeamPage } from './TeamPage';
import { SimTarget, simTargetsForCareer, useSimController } from './useSimController';

const NAV_SECTIONS: { label: string; items: { to: string; label: string }[] }[] = [
  {
    label: 'This season',
    items: [
      { to: 'home', label: 'Home' },
      { to: 'schedule', label: 'Schedule' },
      { to: 'bracket', label: 'Postseason' },
      { to: 'training', label: 'Training' },
      { to: 'decisions', label: 'Decisions' },
    ],
  },
  {
    label: 'The story',
    items: [
      { to: 'history', label: 'Career history' },
      { to: 'leaderboards', label: 'Leaderboards' },
      { to: 'review', label: 'Season review' },
      { to: 'legacy', label: 'Legacy' },
    ],
  },
  {
    label: 'Special',
    items: [
      { to: 'draft', label: 'Draft night' },
      { to: 'godmode', label: 'God Mode' },
    ],
  },
];

const PHASE_LABEL: Record<string, string> = {
  recruiting: 'Recruiting',
  college: 'College',
  seasonReview: 'Season review',
  draft: 'Draft',
  professional: 'Pro',
  retired: 'Retired',
};

const SIM_LABELS: Record<SimTarget, string> = {
  'one game': '1 Game',
  week: 'Week',
  month: 'Month',
  'all-star break': 'All-Star',
  'trade deadline': 'Deadline',
  playoffs: 'Playoffs',
  tournament: 'Tournament',
  season: 'Season',
};

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
  const simTargets = simTargetsForCareer(career);
  const simBlocked =
    career.retired ||
    career.phase === 'seasonReview' ||
    career.phase === 'draft' ||
    career.pendingDecisions.some((d) => d.interrupt);

  return (
    <div className="career-shell" style={{ ['--team-accent' as string]: teamAccent }}>
      <aside className="sidebar">
        <div className="player-chip">
          <strong>
            <PlayerLink saveId={career.id} playerId="user">
              {career.player.name}
            </PlayerLink>
          </strong>
          <span>
            #{career.player.jerseyNumber} ·{' '}
            {(career.proTeamId || career.collegeId) ? (
              <TeamLink
                saveId={career.id}
                teamId={(career.proTeamId || career.collegeId)!}
              >
                {teamName}
              </TeamLink>
            ) : (
              teamName
            )}
          </span>
          <span>
            {PHASE_LABEL[career.phase] ?? career.phase} · Season {career.season}
          </span>
          <span>
            {overall(career.player)} OVR · {career.role}
          </span>
        </div>
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((item) => {
            if (item.to === 'godmode' && !career.settings.godMode) return false;
            if (item.to === 'draft' && career.phase !== 'draft' && !career.draftBoard) return false;
            if (item.to === 'legacy' && !career.retired) return false;
            if (
              item.to === 'review' &&
              career.seasonReviews.length === 0 &&
              career.phase !== 'seasonReview'
            ) {
              return false;
            }
            return true;
          });
          if (!items.length) return null;
          return (
            <div key={section.label} className="nav-group">
              <div className="nav-section">{section.label}</div>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={`/career/${career.id}/${item.to}`}
                  label={item.label}
                  badge={
                    item.to === 'decisions' && career.pendingDecisions.length
                      ? career.pendingDecisions.length
                      : undefined
                  }
                />
              ))}
            </div>
          );
        })}
        <div className="sidebar-foot">
          <Link className="nav-btn" to="/">← Save dashboard</Link>
        </div>
      </aside>

      <div className="career-main">
        <div className="simbar">
          <span className="label">Sim to</span>
          {simTargets.map((t) => (
            <button key={t} disabled={isSim || simBlocked} onClick={() => sim(t)}>
              {SIM_LABELS[t] ?? t}
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
                  ? ` · Next: ${nextGame.round ? `${nextGame.round} vs ` : ''}${nextGame.opponentName}${
                      career.seasonStage && career.seasonStage !== 'regular'
                        ? ` (${career.seasonStage})`
                        : ''
                    }`
                  : career.seasonStage && career.seasonStage !== 'regular'
                    ? ` · ${career.seasonStage}${career.bracket?.championName ? ` · ${career.bracket.championName}` : ''}`
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
                <HomeView
                  career={career}
                  role={role}
                  teamName={teamName}
                  logs={logs}
                  nextGame={nextGame}
                  onChange={persist}
                />
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
            <Route path="schedule" element={<ScheduleView career={career} />} />
            <Route path="bracket" element={<BracketPage career={career} />} />
            <Route path="team/:teamId" element={<TeamPage career={career} />} />
            <Route path="player/:playerId" element={<PlayerPage career={career} />} />
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

function NavLink({ to, label, badge }: { to: string; label: string; badge?: number }) {
  const { pathname } = useLocation();
  const active = pathname.endsWith('/' + to.split('/').pop());
  return (
    <Link className={`nav-btn ${active ? 'active' : ''}`} to={to}>
      {label}
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </Link>
  );
}

function HomeView({
  career,
  role,
  teamName,
  logs,
  nextGame,
  onChange,
}: {
  career: CareerSave;
  role: ReturnType<typeof assignRole>;
  teamName: string;
  logs: GameLog[];
  nextGame?: CareerSave['schedule'][0];
  onChange: (c: CareerSave) => Promise<void>;
}) {
  const eff = getEffectiveRatings(career.player);
  const ovr = overall(career.player);
  const pot = scoutedPotential(career.player, career.hidden);
  const ovrDelta = ovr - career.ovrAtSeasonStart;
  const potDelta = pot - career.potAtSeasonStart;
  const isPro = career.phase === 'professional' || Boolean(career.proTeamId);
  const homeConference = useMemo(() => {
    if (isPro && career.proTeamId) return getProTeam(career.proTeamId)?.conference ?? 'East';
    return getCollege(career.collegeId ?? '')?.conference ?? 'ACC';
  }, [isPro, career.proTeamId, career.collegeId]);
  const [viewConference, setViewConference] = useState(homeConference);
  useEffect(() => {
    setViewConference(homeConference);
  }, [homeConference, career.season]);

  const conferenceOptions = isPro ? listProConferences() : listCollegeConferences();
  const selfId = career.collegeId ?? career.proTeamId ?? '';
  const gamesPlayed = career.wins + career.losses;

  const standingsBase = useMemo(() => {
    const rows = career.standings ?? [];
    if (rows.length && rows.every((r) => r.conference)) return rows;
    if (isPro && career.proTeamId) return initialProStandings(career.proTeamId);
    if (career.collegeId) return initialCollegeStandings(career.collegeId);
    return rows.map((r) => ({ ...r, conference: r.conference ?? homeConference }));
  }, [career.standings, career.collegeId, career.proTeamId, isPro, homeConference]);

  const standingsForView = useMemo(() => {
    const ensured = ensureConferenceInStandings(
      standingsBase,
      viewConference,
      career.phase,
      career.settings.seed,
      gamesPlayed,
    );
    return [...ensured.filter((r) => r.conference === viewConference)].sort((a, b) => {
      const pa = a.wins + a.losses ? a.wins / (a.wins + a.losses) : 0;
      const pb = b.wins + b.losses ? b.wins / (b.wins + b.losses) : 0;
      if (pb !== pa) return pb - pa;
      return b.wins - a.wins;
    });
  }, [standingsBase, viewConference, career.phase, career.settings.seed, gamesPlayed]);

  const leader = standingsForView[0];
  const events = career.seasonEvents ?? [];
  const recent = logs.filter((l) => l.opponent !== 'Season Complete').slice(0, 10);
  const recentPpg = (() => {
    const played = logs.filter((l) => l.minutes > 0).slice(0, 8);
    if (!played.length) return 0;
    return played.reduce((s, l) => s + l.points, 0) / played.length;
  })();
  const breakout = underdogBreakoutNote({
    stars: career.recruiting.stars,
    minutes: role.minutes,
    recentPpg,
    trainingFocus: career.trainingFocus,
  });

  async function onConferenceChange(nextConf: string) {
    setViewConference(nextConf);
    const ensured = ensureConferenceInStandings(
      standingsBase,
      nextConf,
      career.phase,
      career.settings.seed,
      gamesPlayed,
    );
    if (ensured.length !== (career.standings?.length ?? 0)) {
      await onChange({ ...career, standings: ensured, updatedAt: new Date().toISOString() });
    }
  }

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
        <div className="stat"><b>{career.wins}-{career.losses}</b><span>Team record</span></div>
        <div className="stat"><b>{role.minutes}</b><span>Minutes</span></div>
        <div className="stat"><b>{Math.round(career.seasonXp ?? 0)}</b><span>Season XP</span></div>
        <div className="stat"><b>{Math.round(career.draftStock)}</b><span>Draft stock</span></div>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Ratings stay flat in-season. Season XP for you, teammates, and the league converts in the offseason.
      </p>

      {breakout ? (
        <p className="tag good" style={{ margin: 0 }}>
          {breakout}
        </p>
      ) : null}

      <div className="workspace-h cols-2">
        <section className="panel panel-pad">
          <h2 className="card-title">Season events</h2>
          {events.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              League notes and big nights will show up here as you sim.
            </p>
          ) : (
            <ul className="events-log">
              {events.slice(0, 24).map((e) => (
                <li key={e.id}>
                  <span className="tag">{e.kind.replace('_', ' ')}</span>
                  <strong>{e.headline}</strong>
                  {e.detail ? <span className="muted"> · {e.detail}</span> : null}
                  <span className="muted" style={{ marginLeft: 6 }}>G{e.gameNumber}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel panel-pad">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 className="card-title" style={{ margin: 0 }}>Standings</h2>
            <label className="field" style={{ margin: 0, minWidth: 140 }}>
              Conference
              <select value={viewConference} onChange={(e) => onConferenceChange(e.target.value)}>
                {conferenceOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-wrap standings-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>W</th>
                  <th>L</th>
                  <th>GB</th>
                </tr>
              </thead>
              <tbody>
                {standingsForView.map((row, i) => {
                  const gb =
                    !leader || row.teamId === leader.teamId
                      ? '—'
                      : (
                          ((leader.wins - row.wins) + (row.losses - leader.losses)) /
                          2
                        ).toFixed(1);
                  return (
                    <tr
                      key={row.teamId}
                      className={row.teamId === selfId ? 'standings-self' : undefined}
                    >
                      <td>{i + 1}</td>
                      <td>
                        <TeamLink saveId={career.id} teamId={row.teamId}>
                          {row.teamName}
                        </TeamLink>
                      </td>
                      <td>{row.wins}</td>
                      <td>{row.losses}</td>
                      <td>{gb}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="workspace-h home-3">
        <section className="panel panel-pad">
          <h2 className="card-title">Home</h2>
          <p style={{ margin: '0 0 8px' }}>
            <strong>
              <PlayerLink saveId={career.id} playerId="user">
                {career.player.name}
              </PlayerLink>
            </strong>{' '}
            · {archetype(career.player)} · {career.role}
          </p>
          <div className="meta-row">
            <span>
              <strong>
                {(career.proTeamId || career.collegeId) ? (
                  <TeamLink
                    saveId={career.id}
                    teamId={(career.proTeamId || career.collegeId)!}
                  >
                    {teamName}
                  </TeamLink>
                ) : (
                  teamName
                )}
              </strong>
            </span>
            <span>Age {career.age}</span>
            <span>{career.rosterStatus}</span>
            {career.injury.gamesRemaining > 0 ? (
              <span>{career.injury.type} ({career.injury.gamesRemaining}g)</span>
            ) : null}
          </div>
          <div className="meta-row">
            <span>Coach {career.coachTrust}</span>
            <span>Morale {career.morale.overall}</span>
            <span>Training {career.trainingFocus}</span>
          </div>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
            Next:{' '}
            {nextGame ? (
              <>
                {nextGame.round ? `${nextGame.round} · ` : ''}
                {nextGame.home ? 'vs' : '@'}{' '}
                <TeamLink saveId={career.id} teamId={nextGame.opponentId}>
                  {nextGame.opponentName}
                </TeamLink>
              </>
            ) : (
              'No games scheduled'
            )}
          </p>
          {career.collegeRoster.length > 0 ? (
            <p style={{ fontSize: 13, margin: '0 0 6px' }}>
              Teammates:{' '}
              {career.collegeRoster.slice(0, 4).map((m, i) => (
                <span key={m.id}>
                  {i > 0 ? ', ' : ''}
                  <PlayerLink saveId={career.id} playerId={m.id}>
                    {m.name}
                  </PlayerLink>{' '}
                  ({m.overall})
                </span>
              ))}
            </p>
          ) : null}
          {career.player.traitIds.length > 0 ? (
            <p style={{ fontSize: 13, margin: '0 0 6px' }}>
              Traits: {career.player.traitIds.map((id) => getTrait(id)?.name ?? id).join(', ')}
            </p>
          ) : null}
          {career.contract ? (
            <p className="muted" style={{ margin: '0 0 4px', fontSize: 13 }}>
              Contract ${career.contract.amount}k through {career.contract.exp} ({career.contract.type})
            </p>
          ) : null}
          {career.draft ? (
            <p className="muted" style={{ margin: '0 0 4px', fontSize: 13 }}>
              Draft: {career.draft.undrafted ? 'Undrafted' : `R${career.draft.round} P${career.draft.pick}`} ({career.draft.year})
            </p>
          ) : null}
          {career.customized ? <span className="tag warn">Save customized via God Mode</span> : null}
        </section>
        <section className="panel panel-pad pane-scroll">
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
        <section className="panel panel-pad">
          <h2 className="card-title">Recent games</h2>
          {recent.length === 0 ? (
            <p className="muted">No games yet. Use the sim bar to advance.</p>
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
                  {recent.map((l) => (
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
      </div>
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
        Training banks Season XP (now {Math.round(career.seasonXp ?? 0)}). Attribute overalls update in the
        offseason from XP, age, and performance — not game-to-game. Intense work raises fatigue and XP gain.
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
  const seasons = useMemo(() => {
    const set = new Set(logs.map((l) => l.season));
    set.add(career.season);
    return [...set].sort((a, b) => b - a);
  }, [logs, career.season]);
  const [season, setSeason] = useState<number | 'all'>('all');
  const filtered = season === 'all' ? logs : logs.filter((l) => l.season === season);

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
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 className="card-title" style={{ margin: 0 }}>
            Game log
          </h2>
          <label className="field" style={{ margin: 0, minWidth: 120 }}>
            Season
            <select
              value={season}
              onChange={(e) =>
                setSeason(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
            >
              <option value="all">All</option>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  S{s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          League-wide boxes: open Schedule. Retention: {career.settings.boxScoreRetentionYears ?? 3}{' '}
          years.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>S</th><th>G</th><th>Opp</th><th>Result</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>MIN</th><th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td>{l.season}</td>
                  <td>{l.gameNumber}{l.playoffs ? ' P' : ''}</td>
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
  const pool = career.leagueRoster?.length ? career.leagueRoster : nbaPlayers;
  const leagueLeaders = [...pool]
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
            {leagueLeaders.map((p, i) => {
              const tid = teamIdFromTid(p.tid);
              return (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td>
                    <PlayerLink saveId={career.id} playerId={p.id}>
                      {p.name}
                    </PlayerLink>
                  </td>
                  <td>{p.position}</td>
                  <td>{p.overall}</td>
                  <td>
                    {tid ? (
                      <TeamLink saveId={career.id} teamId={tid} abbrev />
                    ) : (
                      'FA'
                    )}
                  </td>
                </tr>
              );
            })}
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
  const history = career.seasonReviews.slice().reverse();

  if (!latest) {
    return (
      <section className="panel panel-pad">
        <h2 className="card-title">End of season</h2>
        <p className="muted">Finish a season to unlock a review.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <div className="workspace-h cols-2">
        <section className={`panel panel-pad pane-scroll${needsAck ? ' is-callout' : ''}`}>
          <h2 className="card-title">Season {latest.season}</h2>
          <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>
            {latest.teamName} · {latest.record}
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
          {(() => {
            const myDev = (career.developmentLog ?? []).filter((line) =>
              line.includes(career.player.name),
            );
            if (!myDev.length) return null;
            return (
              <div style={{ marginTop: 12 }}>
                <h3 className="card-title">Offseason development</h3>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {myDev.slice(0, 8).map((line, i) => (
                    <li key={`${line}-${i}`}>{line}</li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </section>
        <section className="panel panel-pad pane-scroll">
          <h2 className="card-title">Season history</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Team</th>
                  <th>Record</th>
                  <th>OVR</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={`${r.season}-${r.phase}`}>
                    <td>{r.season}</td>
                    <td>{r.teamName}</td>
                    <td>{r.record}</td>
                    <td>{r.ovr}</td>
                    <td>{formatDelta(r.ovrDelta) || '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {needsAck ? (
        <div className="flow-actions" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
          <button className="btn primary" onClick={onContinue}>
            Continue
          </button>
        </div>
      ) : null}
    </div>
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
  const [attrTab, setAttrTab] = useState(ATTR_GROUPS[0].id);
  const activeGroup = ATTR_GROUPS.find((g) => g.id === attrTab) ?? ATTR_GROUPS[0];
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
    <div className="stack">
      <div className="workspace-h cols-2">
        <section className="panel panel-pad pane-scroll">
          <h2 className="card-title">Restricted God Mode</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Edit base attributes and traits only. Overall / potential are derived.
          </p>
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
          <div className="grid-2">
            {activeGroup.keys.map((key) => (
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
        </section>

        <div className="sticky-rail">
          <section className="panel panel-pad">
            <h2 className="card-title">Traits</h2>
            <div className="chip-grid">
              {TRAITS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`btn ${traitIds.includes(t.id) ? 'primary' : ''}`}
                  onClick={() => toggleTrait(t.id)}
                >
                  <strong>{t.name}</strong>
                </button>
              ))}
            </div>
            {preview.ok ? (
              <p className="tag" style={{ marginTop: 12 }}>
                Preview OVR {preview.derived?.overall} · {preview.derived?.archetype}
              </p>
            ) : (
              <p className="tag bad" style={{ marginTop: 12 }}>{preview.error}</p>
            )}
            <div className="stack" style={{ marginTop: 12 }}>
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
              <label className="field">
                Morale ({morale})
                <input
                  type="range"
                  min={20}
                  max={99}
                  value={morale}
                  onChange={(e) => setMorale(Number(e.target.value))}
                />
              </label>
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
                Set morale
              </button>
              <button className="btn" onClick={onUndo}>Undo session</button>
            </div>
          </section>
          <section className="panel panel-pad">
            <h2 className="card-title">Edit log</h2>
            <div className="log-scroll">
              {career.godModeLog.length === 0 ? (
                <p className="muted">No edits yet.</p>
              ) : (
                career.godModeLog
                  .slice()
                  .reverse()
                  .map((e) => (
                    <p key={e.id} className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>
                      {new Date(e.at).toLocaleString()} — {e.commandType}: {e.summary}
                    </p>
                  ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
