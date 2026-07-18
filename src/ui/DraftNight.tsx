import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CareerSave } from '../domain/models';
import { advanceDraftPick, skipDraftToEnd, skipDraftToUser } from '../simulation/draft';

export function DraftNight({
  career,
  onUpdate,
}: {
  career: CareerSave;
  onUpdate: (next: CareerSave) => Promise<void>;
}) {
  const board = career.draftBoard;
  const [paused, setPaused] = useState(false);
  const [holdOnUser, setHoldOnUser] = useState(false);
  const [roundTab, setRoundTab] = useState<1 | 2>(1);
  const careerRef = useRef(career);
  const advancing = useRef(false);
  careerRef.current = career;

  useEffect(() => {
    if (!board || board.finished || paused || holdOnUser) return;
    const id = window.setInterval(async () => {
      if (advancing.current) return;
      const current = careerRef.current;
      if (!current.draftBoard || current.draftBoard.finished) return;
      advancing.current = true;
      try {
        const before = current.draftBoard.currentIndex;
        const next = advanceDraftPick(current);
        const justRevealed = next.draftBoard?.picks[before];
        await onUpdate(next);
        if (justRevealed?.isUser) {
          setHoldOnUser(true);
          setPaused(true);
        }
      } finally {
        advancing.current = false;
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [board?.finished, board?.currentIndex, paused, holdOnUser, onUpdate]);

  if (!board) {
    return (
      <section className="panel panel-pad">
        <p className="muted">No draft board. Declare for the draft to enter draft night.</p>
        <Link className="btn" to={`/career/${career.id}/home`}>Back home</Link>
      </section>
    );
  }

  if (board.finished || career.phase === 'professional') {
    return (
      <section className="draft-stage">
        <h1>Draft complete</h1>
        <p>
          {career.draft?.undrafted
            ? `${career.player.name} went undrafted and signed as a free agent.`
            : `${career.player.name} was selected Round ${career.draft?.round} Pick ${career.draft?.pick}.`}
        </p>
        <Link className="btn primary" to={`/career/${career.id}/home`}>
          Enter pro season
        </Link>
      </section>
    );
  }

  const current = board.picks[board.currentIndex];
  const lastRevealed = board.picks.slice(0, board.currentIndex).at(-1);
  const userPick = board.picks.find((p) => p.isUser && p.revealed);
  const userStillAvailable = (board.remainingIds ?? []).includes('user') && board.userPick == null;
  const userHold = holdOnUser && !!lastRevealed?.isUser;

  return (
    <div className="draft-stage">
      <header className="draft-header">
        <div>
          <p className="draft-kicker">NBA Draft · Live board</p>
          <h1>Draft Night</h1>
          <p className="muted">
            {userPick
              ? `${career.player.name} selected at pick ${userPick.pick}`
              : userStillAvailable
                ? `${career.player.name} still on the board — teams draft BPA + roster need`
                : board.undrafted
                  ? `${career.player.name} went undrafted`
                  : 'Live board — teams drafting BPA + roster need'}
          </p>
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              setPaused((p) => !p);
              if (holdOnUser) setHoldOnUser(false);
            }}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            className="btn"
            disabled={!userStillAvailable}
            onClick={async () => {
              setPaused(true);
              const next = skipDraftToUser(careerRef.current);
              await onUpdate(next);
              setHoldOnUser(true);
            }}
          >
            Skip to my pick
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              setPaused(true);
              await onUpdate(skipDraftToEnd(careerRef.current));
            }}
          >
            Skip to end
          </button>
        </div>
      </header>

      <div className={`draft-callout${userHold ? '' : ' compact'}`}>
        {userHold && lastRevealed ? (
          <>
            <p className="draft-callout-label">The selection is in</p>
            <h2>
              With the {lastRevealed.pick}
              {ordinal(lastRevealed.pick)} pick, the {lastRevealed.teamName} select…
            </h2>
            <p className="draft-name user">{lastRevealed.prospectName}</p>
            <p className="muted">
              {lastRevealed.position} · {lastRevealed.teamAbbrev}
            </p>
            <button
              className="btn primary"
              style={{ marginTop: 12 }}
              onClick={() => {
                setHoldOnUser(false);
                setPaused(false);
              }}
            >
              Continue draft
            </button>
          </>
        ) : (
          <>
            <p className="draft-callout-label">
              On the clock · Pick {current?.pick ?? '—'} · Round {current?.round ?? '—'}
            </p>
            <h2 style={{ color: current?.teamColors[0] }}>{current?.teamName}</h2>
            {lastRevealed ? (
              <p className="muted" style={{ margin: 0 }}>
                Last: {lastRevealed.teamAbbrev} — {lastRevealed.prospectName}
                {lastRevealed.isUser ? ' ★' : ''}
              </p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>Commissioner opens the draft…</p>
            )}
          </>
        )}
      </div>

      <div className="round-tabs">
        <button
          className={`btn ${roundTab === 1 ? 'primary' : ''}`}
          onClick={() => setRoundTab(1)}
        >
          Round 1
        </button>
        <button
          className={`btn ${roundTab === 2 ? 'primary' : ''}`}
          onClick={() => setRoundTab(2)}
        >
          Round 2
        </button>
      </div>

      <div className="draft-boards round-tabbed">
        {([1, 2] as const).map((round) => (
          <section
            key={round}
            className={`draft-round${roundTab === round ? ' active' : ''}`}
          >
            <h3>Round {round}</h3>
            <ol>
              {board.picks
                .filter((p) => p.round === round)
                .map((p) => (
                  <li
                    key={p.pick}
                    className={[
                      p.revealed ? 'revealed' : '',
                      p.isUser ? 'is-user' : '',
                      board.currentIndex === p.pick - 1 ? 'on-clock' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ borderLeftColor: p.teamColors[0] }}
                  >
                    <span className="pick-num">{p.pick}</span>
                    <span className="team-ab" style={{ background: p.teamColors[0], color: '#fff' }}>
                      {p.teamAbbrev}
                    </span>
                    <span className="prospect">
                      {p.revealed && p.prospectId ? (
                        <>
                          {p.prospectName}
                          {p.isUser ? ' ★' : ''}
                          <span className="muted"> · {p.position}</span>
                        </>
                      ) : (
                        <span className="muted">TBD</span>
                      )}
                    </span>
                  </li>
                ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
