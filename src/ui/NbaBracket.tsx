import { useState } from 'react';
import { BracketMatchup, BracketState, NbaSeriesState } from '../domain/models';

export function NbaBracket({
  bracket,
  userTeamId,
}: {
  bracket: BracketState;
  userTeamId?: string | null;
}) {
  const [conf, setConf] = useState<'East' | 'West' | 'Finals'>('East');
  const playIn = (bracket.playIn ?? []).filter((m) =>
    conf === 'Finals' ? false : m.slotA.conference === conf || m.id.includes(`-${conf}-`),
  );
  const series = (bracket.series ?? []).filter((s) =>
    conf === 'Finals' ? s.round === 'Finals' || s.conference === 'Finals' : s.conference === conf,
  );

  const liveSeries = (bracket.series ?? []).find((s) => !s.completed);
  const livePlayIn = (bracket.playIn ?? []).find(
    (m) => !m.completed && m.slotA.teamId && m.slotB.teamId,
  );

  return (
    <div className="nba-bracket-stage">
      <header className="nba-bracket-header">
        <div>
          <p className="nba-bracket-kicker">
            {bracket.status === 'projected' ? 'Projected bracket' : 'NBA Playoffs'} · Season{' '}
            {bracket.season}
          </p>
          <h1>Playoff Picture</h1>
          {bracket.championName ? (
            <p className="nba-champ">Champion: {bracket.championName}</p>
          ) : (
            <p className="muted" style={{ color: '#b8c0cc' }}>
              Best-of-seven · Play-In when enabled
            </p>
          )}
        </div>
      </header>

      {livePlayIn ? (
        <div className="nba-callout">
          <p className="nba-callout-label">Play-In</p>
          <h2>
            ({livePlayIn.slotA.seed}) {livePlayIn.slotA.teamName} vs ({livePlayIn.slotB.seed}){' '}
            {livePlayIn.slotB.teamName}
          </h2>
        </div>
      ) : liveSeries ? (
        <div className="nba-callout">
          <p className="nba-callout-label">{liveSeries.round}</p>
          <h2>
            ({liveSeries.teamASeed}) {liveSeries.teamAName} {liveSeries.winsA} – {liveSeries.winsB}{' '}
            ({liveSeries.teamBSeed}) {liveSeries.teamBName}
          </h2>
        </div>
      ) : null}

      <div className="nba-bracket-tabs">
        {(['East', 'West', 'Finals'] as const).map((c) => (
          <button
            key={c}
            type="button"
            className={`btn ${conf === c ? 'primary' : ''}`}
            onClick={() => setConf(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {playIn.length > 0 ? (
        <section className="nba-playin">
          <h3>Play-In Tournament</h3>
          <div className="nba-series-grid">
            {playIn.map((m) => (
              <PlayInCard key={m.id} m={m} userTeamId={userTeamId} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="nba-series-grid pane-scroll">
        {series.length === 0 ? (
          <p className="muted">Series appear after the Play-In (or when the field locks).</p>
        ) : (
          series.map((s) => <SeriesCard key={s.id} s={s} userTeamId={userTeamId} />)
        )}
      </div>
    </div>
  );
}

function PlayInCard({ m, userTeamId }: { m: BracketMatchup; userTeamId?: string | null }) {
  const userIn =
    userTeamId && (m.slotA.teamId === userTeamId || m.slotB.teamId === userTeamId);
  return (
    <article className={`nba-series-card ${userIn ? 'is-user' : ''} ${m.completed ? 'done' : ''}`}>
      <p className="nba-round-label">Play-In</p>
      <div className={`nba-team ${m.winnerId === m.slotA.teamId ? 'winner' : ''}`}>
        <span className="seed">{m.slotA.seed}</span>
        <span>{m.slotA.teamName}</span>
        <span>{m.completed ? m.homeScore : ''}</span>
      </div>
      <div className={`nba-team ${m.winnerId === m.slotB.teamId ? 'winner' : ''}`}>
        <span className="seed">{m.slotB.seed}</span>
        <span>{m.slotB.teamName}</span>
        <span>{m.completed ? m.awayScore : ''}</span>
      </div>
    </article>
  );
}

function SeriesCard({ s, userTeamId }: { s: NbaSeriesState; userTeamId?: string | null }) {
  const userIn = userTeamId && (s.teamAId === userTeamId || s.teamBId === userTeamId);
  return (
    <article className={`nba-series-card ${userIn ? 'is-user' : ''} ${s.completed ? 'done' : ''}`}>
      <p className="nba-round-label">
        {s.round} · {s.winsA}–{s.winsB}
      </p>
      <div className={`nba-team ${s.winnerId === s.teamAId ? 'winner' : ''}`}>
        <span className="seed">{s.teamASeed}</span>
        <span>{s.teamAName}</span>
        <span>{s.winsA}</span>
      </div>
      <div className={`nba-team ${s.winnerId === s.teamBId ? 'winner' : ''}`}>
        <span className="seed">{s.teamBSeed}</span>
        <span>{s.teamBName}</span>
        <span>{s.winsB}</span>
      </div>
      {s.games.length > 0 ? (
        <p className="muted" style={{ fontSize: 11, margin: '6px 0 0', color: '#8a93a0' }}>
          G{s.games.length}
          {s.completed ? ' final' : ' played'}
        </p>
      ) : null}
    </article>
  );
}
