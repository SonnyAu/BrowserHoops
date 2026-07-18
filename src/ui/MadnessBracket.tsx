import { useMemo, useState } from 'react';
import { BracketMatchup, BracketState, MadnessRegion } from '../domain/models';
import { REGIONS } from '../simulation/marchMadness';

export function MadnessBracket({
  bracket,
  userTeamId,
}: {
  bracket: BracketState;
  userTeamId?: string | null;
}) {
  const [region, setRegion] = useState<MadnessRegion | 'FinalFour'>('East');
  const [roundTab, setRoundTab] = useState<string>('Round of 64');

  const roundsInRegion = useMemo(() => {
    if (region === 'FinalFour') {
      return (bracket.rounds ?? []).filter(
        (m) => m.round === 'Final Four' || m.round === 'Championship',
      );
    }
    return (bracket.rounds ?? []).filter((m) => m.region === region);
  }, [bracket.rounds, region]);

  const roundNames = useMemo(() => {
    const names = [...new Set(roundsInRegion.map((m) => m.round))];
    return names;
  }, [roundsInRegion]);

  const shown = roundsInRegion.filter((m) => m.round === roundTab);
  const firstFour = bracket.firstFour ?? [];
  const live =
    [...firstFour, ...(bracket.rounds ?? [])].find(
      (m) =>
        !m.completed &&
        m.slotA.teamId &&
        m.slotB.teamId &&
        !String(m.slotA.teamId).startsWith('ff-winner'),
    ) ?? null;

  return (
    <div className="madness-stage">
      <header className="madness-header">
        <div>
          <p className="madness-kicker">
            {bracket.status === 'projected' ? 'Projected field' : 'NCAA Tournament'} · Season{' '}
            {bracket.season}
          </p>
          <h1>March Madness</h1>
          {bracket.championName ? (
            <p className="madness-champ">Champion: {bracket.championName}</p>
          ) : (
            <p className="muted" style={{ color: '#c5d4e8' }}>
              68 teams · First Four · Road to the Final Four
            </p>
          )}
        </div>
      </header>

      {live ? (
        <div className="madness-callout">
          <p className="madness-callout-label">Up next</p>
          <h2>
            ({live.slotA.seed}) {live.slotA.teamName} vs ({live.slotB.seed}) {live.slotB.teamName}
          </h2>
          <p>{live.round}</p>
        </div>
      ) : null}

      {firstFour.length > 0 ? (
        <section className="madness-first-four">
          <h3>First Four</h3>
          <div className="madness-matchup-grid">
            {firstFour.map((m) => (
              <MatchupCard key={m.id} m={m} userTeamId={userTeamId} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="madness-tabs">
        {[...REGIONS, 'FinalFour' as const].map((r) => (
          <button
            key={r}
            type="button"
            className={`btn ${region === r ? 'primary' : ''}`}
            onClick={() => {
              setRegion(r);
              setRoundTab(r === 'FinalFour' ? 'Final Four' : 'Round of 64');
            }}
          >
            {r === 'FinalFour' ? 'Final Four' : r}
          </button>
        ))}
      </div>

      <div className="madness-tabs round-tabs">
        {roundNames.map((r) => (
          <button
            key={r}
            type="button"
            className={`btn ${roundTab === r ? 'primary' : ''}`}
            onClick={() => setRoundTab(r)}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="madness-matchup-grid pane-scroll">
        {(shown.length ? shown : roundsInRegion).map((m) => (
          <MatchupCard key={m.id} m={m} userTeamId={userTeamId} />
        ))}
      </div>
    </div>
  );
}

function MatchupCard({
  m,
  userTeamId,
}: {
  m: BracketMatchup;
  userTeamId?: string | null;
}) {
  const userIn =
    userTeamId && (m.slotA.teamId === userTeamId || m.slotB.teamId === userTeamId);
  return (
    <article
      className={`madness-matchup ${m.completed ? 'done' : ''} ${userIn ? 'is-user' : ''}`}
    >
      <p className="madness-round-label">{m.round}</p>
      <SlotRow
        seed={m.slotA.seed}
        name={m.slotA.teamName}
        score={m.completed ? m.homeScore : undefined}
        winner={m.winnerId === m.slotA.teamId}
        user={m.slotA.teamId === userTeamId}
      />
      <SlotRow
        seed={m.slotB.seed}
        name={m.slotB.teamName}
        score={m.completed ? m.awayScore : undefined}
        winner={m.winnerId === m.slotB.teamId}
        user={m.slotB.teamId === userTeamId}
      />
    </article>
  );
}

function SlotRow({
  seed,
  name,
  score,
  winner,
  user,
}: {
  seed: number | null;
  name: string;
  score?: number;
  winner?: boolean;
  user?: boolean;
}) {
  return (
    <div className={`madness-slot ${winner ? 'winner' : ''} ${user ? 'user' : ''}`}>
      <span className="seed">{seed ?? '—'}</span>
      <span className="name">{name}</span>
      <span className="score">{score != null ? score : ''}</span>
    </div>
  );
}
