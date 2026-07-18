import { CareerSave } from '../domain/models';
import { bracketForDisplay } from '../simulation/bracketProjection';
import { pendingUserMadnessGame } from '../simulation/marchMadness';
import { pendingUserPlayIn, pendingUserSeriesGame } from '../simulation/nbaPlayoffs';
import { MadnessBracket } from './MadnessBracket';
import { NbaBracket } from './NbaBracket';

function userPostseasonStatus(career: CareerSave, userTeamId: string | null | undefined): string | null {
  if (!userTeamId || !career.bracket || career.seasonStage === 'regular') return null;
  if (career.bracket.status === 'complete') {
    if (career.bracket.championId === userTeamId) return 'Champions';
    return 'Eliminated — spectating';
  }
  if (career.bracket.kind === 'marchMadness') {
    const pending = pendingUserMadnessGame(career.bracket, userTeamId);
    if (pending) {
      const opp =
        pending.slotA.teamId === userTeamId ? pending.slotB.teamName : pending.slotA.teamName;
      return `Alive — next: ${pending.round} vs ${opp}`;
    }
    const everIn = [...(career.bracket.firstFour ?? []), ...(career.bracket.rounds ?? [])].some(
      (m) => m.slotA.teamId === userTeamId || m.slotB.teamId === userTeamId,
    );
    return everIn ? 'Eliminated — spectating' : 'Watching the field';
  }
  const playIn = pendingUserPlayIn(career.bracket, userTeamId);
  if (playIn) {
    const opp = playIn.slotA.teamId === userTeamId ? playIn.slotB.teamName : playIn.slotA.teamName;
    return `Alive — Play-In vs ${opp}`;
  }
  const series = pendingUserSeriesGame(career.bracket, userTeamId);
  if (series) {
    const opp =
      series.series.teamAId === userTeamId
        ? series.series.teamBName
        : series.series.teamAName;
    return `Alive — ${series.series.round} vs ${opp}`;
  }
  const wasIn =
    (career.bracket.playIn ?? []).some(
      (m) => m.slotA.teamId === userTeamId || m.slotB.teamId === userTeamId,
    ) ||
    (career.bracket.series ?? []).some(
      (s) => s.teamAId === userTeamId || s.teamBId === userTeamId,
    );
  return wasIn ? 'Eliminated — spectating' : 'Watching the field';
}

export function BracketPage({ career }: { career: CareerSave }) {
  const bracket = bracketForDisplay(career);
  const isPro = career.phase === 'professional' || !!career.proTeamId;
  const userTeamId = isPro ? career.proTeamId : career.collegeId;
  const userStatus = userPostseasonStatus(career, userTeamId);

  if (!bracket) {
    return (
      <section className="panel panel-pad">
        <h2 className="card-title">Postseason</h2>
        <p className="muted">Standings are not ready yet. Sim a few games to project the field.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="tag">
          {career.seasonStage === 'regular' || !career.seasonStage
            ? 'Predicted from current standings'
            : career.bracket?.status === 'complete'
              ? 'Final'
              : 'Live bracket'}
        </span>
        {userStatus ? <span className="tag">{userStatus}</span> : null}
      </div>
      {bracket.kind === 'marchMadness' ? (
        <MadnessBracket saveId={career.id} bracket={bracket} userTeamId={userTeamId} />
      ) : (
        <NbaBracket
          saveId={career.id}
          bracket={bracket}
          userTeamId={userTeamId}
          standings={career.standings}
        />
      )}
    </div>
  );
}
