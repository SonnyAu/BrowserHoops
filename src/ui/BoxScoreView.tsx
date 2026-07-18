import { LeagueGameRecord } from '../domain/models';

export function BoxScoreView({
  game,
  onClose,
}: {
  game: LeagueGameRecord;
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
            {game.awayTeamName} {game.awayScore} @ {game.homeTeamName} {game.homeScore}
          </h2>
        </div>
        {onClose ? (
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
      <TeamBox title={game.awayTeamName} lines={away} />
      <TeamBox title={game.homeTeamName} lines={home} />
    </section>
  );
}

function TeamBox({
  title,
  lines,
}: {
  title: string;
  lines: LeagueGameRecord['players'];
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>{title}</h3>
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
                    {p.playerName}
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
