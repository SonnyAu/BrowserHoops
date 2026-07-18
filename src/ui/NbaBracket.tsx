import { getProTeam } from '../data/nbaTeams';
import {
  BracketMatchup,
  BracketState,
  NbaSeriesState,
  StandingRow,
} from '../domain/models';
import { TeamLink } from './EntityLinks';

type Conf = 'East' | 'West';

export function NbaBracket({
  saveId,
  bracket,
  userTeamId,
  standings = [],
}: {
  saveId: string;
  bracket: BracketState;
  userTeamId?: string | null;
  standings?: StandingRow[];
}) {
  const allSeries = bracket.series ?? [];
  const recordMap = new Map(standings.map((r) => [r.teamId, r]));

  const westR1 = byConfRound(allSeries, 'West', 'First Round');
  const westSemis = byConfRound(allSeries, 'West', 'Conf Semis');
  const westCf = byConfRound(allSeries, 'West', 'Conf Finals');
  const eastR1 = byConfRound(allSeries, 'East', 'First Round');
  const eastSemis = byConfRound(allSeries, 'East', 'Conf Semis');
  const eastCf = byConfRound(allSeries, 'East', 'Conf Finals');
  const finals = allSeries.find((s) => s.round === 'Finals');

  const livePlayIn = (bracket.playIn ?? []).find(
    (m) => !m.completed && m.slotA.teamId && m.slotB.teamId,
  );
  const liveSeries = allSeries.find((s) => !s.completed && !s.teamAId.startsWith('tbd-'));

  const playIn = bracket.playIn ?? [];

  return (
    <div className="nba-bracket-stage pane-scroll">
      <header className="nba-bracket-header">
        <div>
          <p className="nba-bracket-kicker">
            {bracket.status === 'projected' ? 'Projected' : 'Live'} · Season {bracket.season}
          </p>
          <h1>Playoffs</h1>
          <p className="muted" style={{ margin: 0 }}>
            Best-of-seven · Main stage above · Play-In below
          </p>
        </div>
      </header>

      {livePlayIn ? (
        <div className="nba-callout">
          <p className="nba-callout-label">Up next · Play-In</p>
          <h2>
            ({livePlayIn.slotA.seed}) {livePlayIn.slotA.teamName} vs ({livePlayIn.slotB.seed}){' '}
            {livePlayIn.slotB.teamName}
          </h2>
        </div>
      ) : liveSeries ? (
        <div className="nba-callout">
          <p className="nba-callout-label">Up next · {liveSeries.round}</p>
          <h2>
            ({liveSeries.teamASeed}) {liveSeries.teamAName} {liveSeries.winsA} –{' '}
            {liveSeries.winsB} ({liveSeries.teamBSeed}) {liveSeries.teamBName}
          </h2>
        </div>
      ) : null}

      <section className="nba-main-stage" aria-label="Playoff main stage">
        <div className="nba-tree-side nba-tree-west">
          <p className="nba-conf-label">Western Conference</p>
          <div className="nba-tree-cols">
            <TreeCol
              label="R1"
              series={westR1}
              saveId={saveId}
              userTeamId={userTeamId}
              recordMap={recordMap}
            />
            <TreeCol
              label="Semis"
              series={westSemis}
              saveId={saveId}
              userTeamId={userTeamId}
              recordMap={recordMap}
            />
            <TreeCol
              label="CF"
              series={westCf}
              saveId={saveId}
              userTeamId={userTeamId}
              recordMap={recordMap}
            />
          </div>
        </div>

        <div className="nba-tree-finals">
          <p className="nba-conf-label">Finals</p>
          {finals ? (
            <SeriesBox
              s={finals}
              saveId={saveId}
              userTeamId={userTeamId}
              recordMap={recordMap}
              featured
            />
          ) : (
            <div className="nba-series-box nba-series-empty">
              <p className="muted">Finals TBD</p>
            </div>
          )}
          {bracket.championName ? (
            <div className="nba-champ-banner">
              {bracket.season} {bracket.championName} League Champions
            </div>
          ) : null}
        </div>

        <div className="nba-tree-side nba-tree-east">
          <p className="nba-conf-label">Eastern Conference</p>
          <div className="nba-tree-cols nba-tree-cols-mirror">
            <TreeCol
              label="CF"
              series={eastCf}
              saveId={saveId}
              userTeamId={userTeamId}
              recordMap={recordMap}
            />
            <TreeCol
              label="Semis"
              series={eastSemis}
              saveId={saveId}
              userTeamId={userTeamId}
              recordMap={recordMap}
            />
            <TreeCol
              label="R1"
              series={eastR1}
              saveId={saveId}
              userTeamId={userTeamId}
              recordMap={recordMap}
            />
          </div>
        </div>
      </section>

      {playIn.length > 0 ? (
        <section className="nba-playin-stage" aria-label="Play-In Tournament">
          <h2>Play-In Tournament</h2>
          <p className="nba-playin-blurb">
            The winners of the 7/8 games make the playoffs. Then the losers play the winners of the
            9/10 games for the final playoff spots.
          </p>
          <div className="nba-playin-conferences">
            {(['West', 'East'] as const).map((conf) => (
              <PlayInConference
                key={conf}
                conf={conf}
                matchups={playIn.filter(
                  (m) => m.slotA.conference === conf || m.id.includes(`-${conf}-`),
                )}
                saveId={saveId}
                userTeamId={userTeamId}
                recordMap={recordMap}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function byConfRound(
  series: NbaSeriesState[],
  conf: Conf,
  round: string,
): NbaSeriesState[] {
  return series.filter((s) => s.conference === conf && s.round === round);
}

function TreeCol({
  label,
  series,
  saveId,
  userTeamId,
  recordMap,
}: {
  label: string;
  series: NbaSeriesState[];
  saveId: string;
  userTeamId?: string | null;
  recordMap: Map<string, StandingRow>;
}) {
  return (
    <div className="nba-tree-col">
      <span className="nba-tree-col-label">{label}</span>
      {series.length === 0 ? (
        <div className="nba-series-box nba-series-empty">
          <p className="muted">—</p>
        </div>
      ) : (
        series.map((s) => (
          <SeriesBox
            key={s.id}
            s={s}
            saveId={saveId}
            userTeamId={userTeamId}
            recordMap={recordMap}
          />
        ))
      )}
    </div>
  );
}

function SeriesBox({
  s,
  saveId,
  userTeamId,
  recordMap,
  featured,
}: {
  s: NbaSeriesState;
  saveId: string;
  userTeamId?: string | null;
  recordMap: Map<string, StandingRow>;
  featured?: boolean;
}) {
  const userIn = userTeamId && (s.teamAId === userTeamId || s.teamBId === userTeamId);
  return (
    <article
      className={`nba-series-box ${userIn ? 'is-user' : ''} ${s.completed ? 'is-done' : ''} ${
        featured ? 'is-featured' : ''
      }`}
    >
      <TeamRow
        saveId={saveId}
        teamId={s.teamAId}
        name={s.teamAName}
        seed={s.teamASeed}
        wins={s.winsA}
        winner={s.winnerId === s.teamAId}
        user={s.teamAId === userTeamId}
        record={recordMap.get(s.teamAId)}
      />
      <TeamRow
        saveId={saveId}
        teamId={s.teamBId}
        name={s.teamBName}
        seed={s.teamBSeed}
        wins={s.winsB}
        winner={s.winnerId === s.teamBId}
        user={s.teamBId === userTeamId}
        record={recordMap.get(s.teamBId)}
      />
    </article>
  );
}

function TeamRow({
  saveId,
  teamId,
  name,
  seed,
  wins,
  score,
  winner,
  user,
  record,
}: {
  saveId: string;
  teamId: string | null;
  name: string;
  seed: number | null;
  wins?: number;
  score?: number;
  winner?: boolean;
  user?: boolean;
  record?: StandingRow;
}) {
  const pro = teamId && !teamId.startsWith('tbd-') ? getProTeam(teamId) : null;
  const chip = pro?.colors[0] ?? '#555';
  const value = score != null ? score : wins;
  return (
    <div
      className={`nba-team-row ${winner ? 'is-winner' : ''} ${user ? 'is-user-row' : ''}`}
      style={winner && pro ? { background: `${chip}22` } : undefined}
    >
      <span className="nba-color-chip" style={{ background: chip }} aria-hidden />
      <span className="nba-seed">{seed != null ? `${seed}.` : '—'}</span>
      <span className="nba-team-meta">
        <span className="nba-team-name">
          {teamId && !teamId.startsWith('tbd-') ? (
            <TeamLink saveId={saveId} teamId={teamId}>
              {shortName(name)}
            </TeamLink>
          ) : (
            shortName(name)
          )}
        </span>
        {record ? (
          <span className="nba-team-record">
            {record.wins}-{record.losses}
          </span>
        ) : null}
      </span>
      <span className="nba-team-score">{value != null ? value : ''}</span>
    </div>
  );
}

function shortName(name: string): string {
  // "Golden State Warriors" → prefer region word when long
  const parts = name.split(' ');
  if (parts.length >= 2 && name.length > 16) {
    return parts.slice(0, -1).join(' ');
  }
  return name;
}

function PlayInConference({
  conf,
  matchups,
  saveId,
  userTeamId,
  recordMap,
}: {
  conf: Conf;
  matchups: BracketMatchup[];
  saveId: string;
  userTeamId?: string | null;
  recordMap: Map<string, StandingRow>;
}) {
  const g78 = matchups.find((m) => m.id.includes('-7v8'));
  const g910 = matchups.find((m) => m.id.includes('-9v10'));
  const g8 = matchups.find((m) => m.id.includes('-8seed'));

  return (
    <div className="nba-playin-conf">
      <h3>{conf === 'West' ? 'Western' : 'Eastern'} Conference</h3>
      <div className="nba-playin-tree">
        <div className="nba-playin-col">
          {g78 ? (
            <PlayInBox
              m={g78}
              saveId={saveId}
              userTeamId={userTeamId}
              recordMap={recordMap}
            />
          ) : null}
          {g910 ? (
            <PlayInBox
              m={g910}
              saveId={saveId}
              userTeamId={userTeamId}
              recordMap={recordMap}
            />
          ) : null}
        </div>
        <div className="nba-playin-col nba-playin-col-final">
          {g8 ? (
            <PlayInBox
              m={g8}
              saveId={saveId}
              userTeamId={userTeamId}
              recordMap={recordMap}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PlayInBox({
  m,
  saveId,
  userTeamId,
  recordMap,
}: {
  m: BracketMatchup;
  saveId: string;
  userTeamId?: string | null;
  recordMap: Map<string, StandingRow>;
}) {
  const userIn =
    userTeamId &&
    (m.slotA.teamId === userTeamId || m.slotB.teamId === userTeamId);
  return (
    <article
      className={`nba-series-box ${userIn ? 'is-user' : ''} ${m.completed ? 'is-done' : ''}`}
    >
      <TeamRow
        saveId={saveId}
        teamId={m.slotA.teamId}
        name={m.slotA.teamName}
        seed={m.slotA.seed}
        score={m.completed ? m.homeScore : undefined}
        winner={m.winnerId === m.slotA.teamId}
        user={m.slotA.teamId === userTeamId}
        record={m.slotA.teamId ? recordMap.get(m.slotA.teamId) : undefined}
      />
      <TeamRow
        saveId={saveId}
        teamId={m.slotB.teamId}
        name={m.slotB.teamName}
        seed={m.slotB.seed}
        score={m.completed ? m.awayScore : undefined}
        winner={m.winnerId === m.slotB.teamId}
        user={m.slotB.teamId === userTeamId}
        record={m.slotB.teamId ? recordMap.get(m.slotB.teamId) : undefined}
      />
    </article>
  );
}
