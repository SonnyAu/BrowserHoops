import { Link } from 'react-router-dom';
import { CareerSave } from '../domain/models';
import { bracketForDisplay } from '../simulation/bracketProjection';
import { MadnessBracket } from './MadnessBracket';
import { NbaBracket } from './NbaBracket';

export function BracketPage({ career }: { career: CareerSave }) {
  const bracket = bracketForDisplay(career);
  const isPro = career.phase === 'professional' || !!career.proTeamId;
  const userTeamId = isPro ? career.proTeamId : career.collegeId;

  if (!bracket) {
    return (
      <section className="panel panel-pad">
        <h2 className="card-title">Bracket</h2>
        <p className="muted">Standings are not ready yet. Sim a few games to project the field.</p>
        <Link className="btn" to={`/career/${career.id}/schedule`}>
          Schedule
        </Link>
      </section>
    );
  }

  return (
    <div className="stack" style={{ height: '100%', minHeight: 0 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="tag">
          {career.seasonStage === 'regular' || !career.seasonStage
            ? 'Predicted from current standings'
            : career.bracket?.status === 'complete'
              ? 'Final'
              : 'Live bracket'}
        </span>
        <Link className="btn" to={`/career/${career.id}/schedule`}>
          Schedule & box scores
        </Link>
      </div>
      {bracket.kind === 'marchMadness' ? (
        <MadnessBracket bracket={bracket} userTeamId={userTeamId} />
      ) : (
        <NbaBracket bracket={bracket} userTeamId={userTeamId} />
      )}
    </div>
  );
}
