import { LeagueGameRecord } from '../domain/models';
import { PlayerLink, TeamLink } from './EntityLinks';

export function BoxScoreView({
  game,
  saveId,
  onClose,
}: {
  game: LeagueGameRecord;
  saveId: string;
  onClose?: () => void;
}) {
  const home = game.players.filter((p) => p.teamId === game.homeTeamId);
  const away = game.players.filter((p) => p.teamId === game.awayTeamId);

  return (
    <section className="panel panel-pad box-score">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            S{game.season} · Day {game.day} · {game.stage}
            {game.playoffMeta?.round ? ` · ${game.playoffMeta.round}` : ''}
          </p>
          <h2 className="card-title" style={{ marginBottom: 4 }}>
            <TeamLink saveId={saveId} teamId={game.awayTeamId}>
              {game.awayTeamName}
            </TeamLink>{' '}
            {game.awayScore} @{' '}
            <TeamLink saveId={saveId} teamId={game.homeTeamId}>
              {game.homeTeamName}
            </TeamLink>{' '}
            {game.homeScore}
          </h2>
        </div>
        {onClose ? (
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
      <TeamBox saveId={saveId} title={game.awayTeamName} teamId={game.awayTeamId} lines={away} />
      <TeamBox saveId={saveId} title={game.homeTeamName} teamId={game.homeTeamId} lines={home} />
    </section>
  );
}

function TeamBox({
  saveId,
  title,
  teamId,
  lines,
}: {
  saveId: string;
  title: string;
  teamId: string;
  lines: LeagueGameRecord['players'];
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>
        <TeamLink saveId={saveId} teamId={teamId}>
          {title}
        </TeamLink>
      </h3>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Player</th>
              <th>MIN</th>
              <th>PTS</th>
              <th>REB</th>
              <th>AST</th>
              <th>STL</th>
              <th>BLK</th>
              <th>FG</th>
              <th>3P</th>
              <th>FT</th>
              <th>TO</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={11} className="muted">
                  No player lines
                </td>
              </tr>
            ) : (
              lines.map((p) => (
                <tr key={p.playerId} className={p.isUser ? 'is-user-row' : undefined}>
                  <td>
                    <PlayerLink
                      saveId={saveId}
                      playerId={p.isUser ? 'user' : p.playerId}
                    >
                      {p.playerName}
                    </PlayerLink>
                    {p.isUser ? ' ★' : ''}
                  </td>
                  <td>{p.minutes}</td>
                  <td>{p.points}</td>
                  <td>{p.rebounds}</td>
                  <td>{p.assists}</td>
                  <td>{p.steals}</td>
                  <td>{p.blocks}</td>
                  <td>
                    {p.fgm}/{p.fga}
                  </td>
                  <td>
                    {p.tpm}/{p.tpa}
                  </td>
                  <td>
                    {p.ftm}/{p.fta}
                  </td>
                  <td>{p.turnovers}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
