import { useEffect, useState } from 'react';
import { CareerSave, LeagueGameRecord } from '../domain/models';
import { loadLeagueGame, loadLeagueGamesForDay, loadLeagueGamesForSeason } from '../persistence/db';
import { BoxScoreView } from './BoxScoreView';
import { TeamLink } from './EntityLinks';

const STAGE_SHORT: Record<string, string> = {
  regular: 'RS',
  playIn: 'Play-In',
  playoffs: 'Playoffs',
  tournament: 'NCAA',
  complete: '—',
};

export function ScheduleView({ career }: { career: CareerSave }) {
  const [day, setDay] = useState(() => {
    const next = career.schedule.find((g) => !g.completed);
    return next?.gameNumber ?? Math.max(1, career.nextGame - 1);
  });
  const [leagueDay, setLeagueDay] = useState<LeagueGameRecord[]>([]);
  const [selected, setSelected] = useState<LeagueGameRecord | null>(null);
  const [seasonFilter, setSeasonFilter] = useState(career.season);

  const userGames = career.schedule;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const games = await loadLeagueGamesForDay(career.id, day);
      if (!cancelled) setLeagueDay(games.sort((a, b) => a.homeTeamName.localeCompare(b.homeTeamName)));
    })();
    return () => {
      cancelled = true;
    };
  }, [career.id, day, career.updatedAt]);

  async function openBox(id: string | undefined) {
    if (!id) return;
    const g = await loadLeagueGame(id);
    if (g) setSelected(g);
  }

  async function openFromLeague(g: LeagueGameRecord) {
    setSelected(g);
  }

  const maxDay = Math.max(
    career.settings.collegeSeasonLength,
    career.settings.proSeasonLength,
    ...career.schedule.map((g) => g.gameNumber),
    day,
  );

  return (
    <div className="workspace-h schedule-view">
      <div className="stack pane-scroll" style={{ flex: 1.2, minWidth: 0 }}>
        <section className="panel panel-pad">
          <h2 className="card-title">Your schedule</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Season {career.season} ·{' '}
            {career.seasonStage === 'regular' || !career.seasonStage
              ? 'Regular season'
              : STAGE_SHORT[career.seasonStage] ?? career.seasonStage}
          </p>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Opp</th>
                  <th>H/A</th>
                  <th>Result</th>
                  <th>Round</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {userGames.map((g) => (
                  <tr
                    key={g.id}
                    className={!g.completed ? 'is-next-game' : undefined}
                    onClick={() => setDay(g.gameNumber)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{g.gameNumber}</td>
                    <td>
                      <TeamLink saveId={career.id} teamId={g.opponentId}>
                        {g.opponentName}
                      </TeamLink>
                    </td>
                    <td>{g.home ? 'Home' : 'Away'}</td>
                    <td>
                      {g.completed
                        ? `${g.result} ${g.teamScore}-${g.opponentScore}`
                        : '—'}
                    </td>
                    <td>{g.round ?? STAGE_SHORT[g.stage ?? 'regular'] ?? 'RS'}</td>
                    <td>
                      {g.leagueGameId ? (
                        <button
                          type="button"
                          className="btn"
                          style={{ fontSize: 12, padding: '2px 8px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void openBox(g.leagueGameId);
                          }}
                        >
                          Box
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="stack pane-scroll" style={{ flex: 1, minWidth: 0 }}>
        {selected ? (
          <BoxScoreView
            saveId={career.id}
            game={selected}
            onClose={() => setSelected(null)}
          />
        ) : (
          <section className="panel panel-pad">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <h2 className="card-title" style={{ margin: 0 }}>
                League results · Day {day}
              </h2>
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={day <= 1}
                  onClick={() => setDay((d) => d - 1)}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={day >= maxDay}
                  onClick={() => setDay((d) => d + 1)}
                >
                  Next
                </button>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Every league game that day — click for full box score.
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Away</th>
                    <th></th>
                    <th>Home</th>
                    <th>Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {leagueDay.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        No league games stored for this day yet. Sim to generate box scores.
                      </td>
                    </tr>
                  ) : (
                    leagueDay.map((g) => (
                      <tr
                        key={g.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => void openFromLeague(g)}
                      >
                        <td>
                          <TeamLink saveId={career.id} teamId={g.awayTeamId}>
                            {g.awayTeamName}
                          </TeamLink>{' '}
                          <strong>{g.awayScore}</strong>
                        </td>
                        <td>@</td>
                        <td>
                          <TeamLink saveId={career.id} teamId={g.homeTeamId}>
                            {g.homeTeamName}
                          </TeamLink>{' '}
                          <strong>{g.homeScore}</strong>
                        </td>
                        <td>{g.stage}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <SeasonBrowser
              saveId={career.id}
              season={seasonFilter}
              onSeason={setSeasonFilter}
              onPick={(g) => setSelected(g)}
            />
          </section>
        )}
      </div>
    </div>
  );
}

function SeasonBrowser({
  saveId,
  season,
  onSeason,
  onPick,
}: {
  saveId: string;
  season: number;
  onSeason: (s: number) => void;
  onPick: (g: LeagueGameRecord) => void;
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const games = await loadLeagueGamesForSeason(saveId, season);
      if (!cancelled) setCount(games.length);
    })();
    return () => {
      cancelled = true;
    };
  }, [saveId, season]);

  return (
    <div style={{ marginTop: 16 }}>
      <label className="field" style={{ maxWidth: 160 }}>
        Archive season
        <input
          type="number"
          min={1}
          value={season}
          onChange={(e) => onSeason(Number(e.target.value) || 1)}
        />
      </label>
      <p className="muted" style={{ fontSize: 12 }}>
        {count} league games stored for season {season}. Open any day above after simulating.
      </p>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          const games = await loadLeagueGamesForSeason(saveId, season);
          if (games[0]) onPick(games[0]);
        }}
      >
        Open first box (S{season})
      </button>
    </div>
  );
}
