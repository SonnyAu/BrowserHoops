import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCollege } from '../data/colleges';
import { getProTeam } from '../data/nbaTeams';
import { CareerSave, LeagueTransaction, TeamSeasonRecord } from '../domain/models';
import {
  loadTeamSeasonRecords,
  loadTeamTransactions,
} from '../persistence/db';
import { PlayerLink, resolveTeam } from './EntityLinks';

export function TeamPage({ career }: { career: CareerSave }) {
  const { teamId = '' } = useParams();
  const team = resolveTeam(teamId);
  const pro = getProTeam(teamId);
  const college = getCollege(teamId);
  const [records, setRecords] = useState<TeamSeasonRecord[]>([]);
  const [txs, setTxs] = useState<LeagueTransaction[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [r, t] = await Promise.all([
        loadTeamSeasonRecords(career.id, teamId),
        loadTeamTransactions(career.id, teamId),
      ]);
      if (!alive) return;
      setRecords(r.sort((a, b) => b.season - a.season));
      setTxs(t.slice(0, 100));
    })();
    return () => {
      alive = false;
    };
  }, [career.id, teamId]);

  const currentStanding = career.standings?.find((s) => s.teamId === teamId);
  const roster = useMemo(() => {
    if (pro) {
      return (career.leagueRoster ?? [])
        .filter((p) => p.tid === pro.tid)
        .sort((a, b) => b.overall - a.overall);
    }
    if (college && career.collegeId === teamId) {
      return career.collegeRoster ?? [];
    }
    return [];
  }, [career, pro, college, teamId]);

  return (
    <div className="stack pane-scroll profile-page">
      <header className="profile-header" style={{ ['--team-accent' as string]: team.colors[0] }}>
        <p className="muted">
          <Link to={`/career/${career.id}/home`}>Home</Link> · Team
        </p>
        <h1>{team.name}</h1>
        <p className="muted">
          {team.abbrev}
          {pro ? ` · ${pro.conference} · ${pro.division}` : null}
          {college ? ` · ${college.conference}` : null}
        </p>
        {currentStanding ? (
          <p>
            Current: {currentStanding.wins}-{currentStanding.losses}
          </p>
        ) : null}
      </header>

      <section className="panel panel-pad">
        <h2 className="card-title">Season records</h2>
        {records.length === 0 ? (
          <p className="muted">No archived seasons yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Season</th>
                <th>W</th>
                <th>L</th>
                <th>Conf</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{r.season}</td>
                  <td>{r.wins}</td>
                  <td>{r.losses}</td>
                  <td>{r.conference ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel panel-pad">
        <h2 className="card-title">Roster</h2>
        {roster.length === 0 ? (
          <p className="muted">
            {college && career.collegeId !== teamId
              ? 'Full college rosters are only available for your school.'
              : 'No roster loaded.'}
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th>OVR</th>
                <th>Contract</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => {
                const id = 'tid' in p ? p.id : p.id;
                const ovr = p.overall;
                const pos = p.position;
                const contract =
                  'contractAmount' in p
                    ? `$${p.contractAmount}k / exp ${p.contractExp}`
                    : '—';
                return (
                  <tr key={id}>
                    <td>
                      <PlayerLink saveId={career.id} playerId={id}>
                        {p.name}
                      </PlayerLink>
                    </td>
                    <td>{pos}</td>
                    <td>{ovr}</td>
                    <td>{contract}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel panel-pad">
        <h2 className="card-title">Transactions</h2>
        {txs.length === 0 ? (
          <p className="muted">No transactions logged yet.</p>
        ) : (
          <ul className="tx-list">
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
