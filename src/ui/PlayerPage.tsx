import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCollege } from '../data/colleges';
import { overall, scoutedPotential } from '../domain/derived';
import { resolveCollegeIdFromPlayer } from '../domain/collegeLookup';
import { jerseyForTeam } from '../domain/jersey';
import {
  CareerSave,
  LeaguePlayer,
  LeagueTransaction,
  PlayerSeasonLine,
  Ratings,
  ATTR_LABELS,
  allAttrKeys,
} from '../domain/models';
import { getLeaguePlayer } from '../data/nbaPlayers';
import { getPackSeasonLines } from '../data/packSeasonLines';
import {
  loadPlayerSeasonLines,
  loadPlayerTransactions,
} from '../persistence/db';
import { jerseyStopsFromLines, liveSeasonLines } from '../simulation/seasonArchive';
import { TeamLink, resolveTeam, teamIdFromTid } from './EntityLinks';
import { JerseyHistory, JerseyStop } from './JerseyHistory';
import { PlayerStatsTable } from './PlayerStatsTable';

type ResolvedPlayer = {
  id: string;
  name: string;
  position: string;
  age: number;
  ovr: number;
  pot: number;
  ratings: Ratings;
  teamId: string | null;
  /** Alma mater college id when known (NBA pack / draft). */
  collegeId: string | null;
  contractLabel: string;
  jerseyNumber: number;
  jerseyByTeamId?: Record<string, number>;
  isUser: boolean;
};

function resolvePlayer(career: CareerSave, playerId: string): ResolvedPlayer | null {
  if (playerId === 'user') {
    const teamId = career.proTeamId ?? career.collegeId ?? null;
    return {
      id: 'user',
      name: career.player.name,
      position: career.player.position,
      age: career.age,
      ovr: overall(career.player),
      pot: scoutedPotential(career.player, career.hidden),
      ratings: career.player.ratings,
      teamId,
      collegeId: career.collegeId,
      contractLabel: career.contract
        ? `$${career.contract.amount}k · exp ${career.contract.exp} (${career.contract.type})`
        : 'No contract',
      jerseyNumber: career.player.jerseyNumber,
      isUser: true,
    };
  }
  const lp = (career.leagueRoster ?? []).find((p) => p.id === playerId);
  if (lp) {
    return fromLeaguePlayer(lp);
  }
  const mate = (career.collegeRoster ?? []).find((p) => p.id === playerId);
  if (mate) {
    return {
      id: mate.id,
      name: mate.name,
      position: mate.position,
      age: mate.age,
      ovr: mate.overall,
      pot: mate.truePotential,
      ratings: mate.ratings,
      teamId: career.collegeId,
      collegeId: career.collegeId,
      contractLabel: 'College',
      jerseyNumber: jerseyForTeam(mate.id, career.collegeId ?? 'college'),
      isUser: false,
    };
  }
  return null;
}

function fromLeaguePlayer(lp: LeaguePlayer): ResolvedPlayer {
  return {
    id: lp.id,
    name: lp.name,
    position: lp.position,
    age: lp.age ?? Math.max(19, new Date().getFullYear() - (lp.bornYear ?? 2000)),
    ovr: lp.overall,
    pot: lp.potential,
    ratings: lp.ratings,
    teamId: teamIdFromTid(lp.tid),
    collegeId: resolveCollegeIdFromPlayer(lp),
    contractLabel:
      lp.tid === 'FA'
        ? 'Free agent'
        : `$${lp.contractAmount}k · exp ${lp.contractExp}`,
    jerseyNumber: jerseyForTeam(lp.id, teamIdFromTid(lp.tid) ?? 'fa', lp.jerseyNumber, lp.jerseyByTeamId),
    jerseyByTeamId: lp.jerseyByTeamId,
    isUser: false,
  };
}

export function PlayerPage({ career }: { career: CareerSave }) {
  const { playerId = '' } = useParams();
  const player = resolvePlayer(career, playerId);
  const [archivedLines, setArchivedLines] = useState<PlayerSeasonLine[]>([]);
  const [liveLines, setLiveLines] = useState<PlayerSeasonLine[]>([]);
  const [txs, setTxs] = useState<LeagueTransaction[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [l, t] = await Promise.all([
        loadPlayerSeasonLines(career.id, playerId),
        loadPlayerTransactions(career.id, playerId),
      ]);
      if (!alive) return;
      setArchivedLines(l);
      setTxs(t.slice(0, 100));
    })();
    return () => {
      alive = false;
    };
  }, [career.id, playerId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const live = await liveSeasonLines(career, playerId);
      if (alive) setLiveLines(live);
    })();
    return () => {
      alive = false;
    };
  }, [career, playerId]);

  // Real pre-game NBA history baked into the data pack (empty for the user / college players).
  const packLines = useMemo(() => {
    const bornYear =
      (career.leagueRoster ?? []).find((p) => p.id === playerId)?.bornYear ??
      getLeaguePlayer(playerId)?.bornYear;
    return bornYear != null ? getPackSeasonLines(playerId, bornYear) : [];
  }, [career.leagueRoster, playerId]);

  const lines = useMemo(() => {
    const archivedKeys = new Set(
      archivedLines.map((l) => `${l.season}|${l.phase}|${l.teamId}`),
    );
    const live = liveLines.filter(
      (l) => !archivedKeys.has(`${l.season}|${l.phase}|${l.teamId}`),
    );
    return [...packLines, ...archivedLines, ...live];
  }, [packLines, archivedLines, liveLines]);

  const collegeLines = useMemo(
    () => lines.filter((l) => l.level === 'college'),
    [lines],
  );
  const proLines = useMemo(() => lines.filter((l) => l.level === 'pro'), [lines]);

  const jerseyStops = useMemo((): JerseyStop[] => {
    if (!player) return [];
    const stops = jerseyStopsFromLines(lines, player.teamId);
    const collegeId = player.collegeId ?? (player.isUser ? career.collegeId : null);
    if (collegeId && !stops.some((s) => s.level === 'college' && s.teamId === collegeId)) {
      stops.unshift({ teamId: collegeId, level: 'college' });
    }
    if (player.teamId && !stops.some((s) => s.teamId === player.teamId)) {
      stops.push({
        teamId: player.teamId,
        level: getCollege(player.teamId) ? 'college' : 'pro',
      });
    }
    return stops.map((s) => ({
      teamId: s.teamId,
      level: s.level,
      number: jerseyForTeam(
        player.id,
        s.teamId,
        player.jerseyNumber,
        player.jerseyByTeamId,
      ),
    }));
  }, [player, lines, career.collegeId]);

  if (!player) {
    return (
      <section className="panel panel-pad">
        <h2 className="card-title">Player not found</h2>
        <Link className="btn" to={`/career/${career.id}/home`}>
          Home
        </Link>
      </section>
    );
  }

  const team = player.teamId ? resolveTeam(player.teamId) : null;
  const startRatings = player.isUser ? career.ratingsAtSeasonStart : null;

  return (
    <div className="stack pane-scroll profile-page">
      <header className="profile-header">
        <p className="muted">
          <Link to={`/career/${career.id}/home`}>Home</Link> · Player
          {player.isUser ? ' · You' : ''}
        </p>
        <h1>
          {player.name}{' '}
          {player.isUser ? <span className="tag">You</span> : null}
        </h1>
        <p>
          {player.position} · Age {player.age} · {player.ovr} OVR · {player.pot} POT
        </p>
        <p>
          {team && player.teamId ? (
            <>
              <TeamLink saveId={career.id} teamId={player.teamId} />
              {' · '}
            </>
          ) : (
            'Free agent · '
          )}
          {player.contractLabel}
        </p>
        <JerseyHistory saveId={career.id} stops={jerseyStops} />
      </header>

      <section className="panel panel-pad">
        <h2 className="card-title">Ratings</h2>
        <div className="ratings-grid">
          {allAttrKeys.map((k) => {
            const v = player.ratings[k];
            const delta = startRatings ? v - startRatings[k] : 0;
            return (
              <div key={k} className="rating-cell">
                <span className="muted">{ATTR_LABELS[k]}</span>
                <strong>{v}</strong>
                {player.isUser && delta !== 0 ? (
                  <span className={delta > 0 ? 'delta-up' : 'delta-down'}>
                    {delta > 0 ? '+' : ''}
                    {delta}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {player.isUser ? (
        <section className="panel panel-pad">
          <h2 className="card-title">Your season</h2>
          <p>
            Role {career.role} · {career.minutes} min · Usage{' '}
            {(career.usage * 100).toFixed(0)}% · Fatigue {career.fatigue} · Morale{' '}
            {career.morale.overall}
          </p>
          <p className="muted">
            Training: {career.trainingFocus} / {career.trainingIntensity}
            {career.draftStock != null ? ` · Draft stock ${career.draftStock.toFixed(0)}` : ''}
          </p>
          {career.seasonReviews.length ? (
            <ul className="tx-list">
              {career.seasonReviews
                .slice()
                .reverse()
                .slice(0, 5)
                .map((r) => (
                  <li key={`${r.season}-${r.narrative.slice(0, 12)}`}>
                    S{r.season}: {r.narrative}
                    {r.awards?.length ? ` · ${r.awards.join(', ')}` : ''}
                  </li>
                ))}
            </ul>
          ) : null}
          {(() => {
            const myDev = (career.developmentLog ?? []).filter((line) =>
              line.includes(career.player.name),
            );
            if (!myDev.length) return null;
            return (
              <>
                <h3 className="card-title" style={{ marginTop: 12 }}>
                  Development
                </h3>
                <ul className="tx-list">
                  {myDev.slice(0, 12).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </>
            );
          })()}
        </section>
      ) : null}

      {collegeLines.length > 0 ? (
        <section className="panel panel-pad">
          <h2 className="card-title">College career</h2>
          <PlayerStatsTable
            saveId={career.id}
            lines={collegeLines}
            careerLabel="College career"
          />
        </section>
      ) : null}

      {collegeLines.length > 0 && proLines.length > 0 && career.draft ? (
        <p className="muted profile-bridge">
          Drafted {career.draft.undrafted ? 'undrafted' : `R${career.draft.round} P${career.draft.pick}`}{' '}
          ({career.draft.year})
        </p>
      ) : null}

      {proLines.length > 0 ? (
        <section className="panel panel-pad">
          <h2 className="card-title">NBA career</h2>
          <PlayerStatsTable
            saveId={career.id}
            lines={proLines}
            careerLabel="NBA career"
          />
        </section>
      ) : null}

      {!collegeLines.length && !proLines.length ? (
        <section className="panel panel-pad">
          <p className="muted">
            No season stats yet — lines appear once this player logs minutes.
          </p>
        </section>
      ) : null}

      <section className="panel panel-pad">
        <h2 className="card-title">Transactions</h2>
        {txs.length === 0 && !(player.isUser && career.transactions?.length) ? (
          <p className="muted">No transactions logged yet.</p>
        ) : (
          <ul className="tx-list">
            {player.isUser
              ? (career.transactions ?? []).map((t, i) => (
                  <li key={`legacy-${i}`}>
                    S{t.season} · {t.type}: {t.detail}
                  </li>
                ))
              : null}
            {txs.map((t) => (
              <li key={t.id}>
                <span className="muted">S{t.season}</span> · {t.summary}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
