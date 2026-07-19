import { useMemo, useState } from 'react';
import { PlayerSeasonLine } from '../domain/models';
import {
  formatPct,
  formatStat,
  mergeLines,
  toPerGame,
  type PerGameRow,
} from '../simulation/playerStatsMath';
import { TeamLink } from './EntityLinks';

type Tab = 'regular' | 'playoffs' | 'combined';

export function PlayerStatsTable({
  saveId,
  lines,
  careerLabel,
}: {
  saveId: string;
  lines: PlayerSeasonLine[];
  careerLabel: string;
}) {
  const [tab, setTab] = useState<Tab>('regular');
  const [sortKey, setSortKey] = useState<keyof PerGameRow>('season');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    if (tab === 'combined') return lines;
    return lines.filter((l) => l.phase === tab);
  }, [lines, tab]);

  const bySeason = useMemo(() => {
    const map = new Map<string, PlayerSeasonLine[]>();
    for (const l of filtered) {
      const key = `${l.season}|${l.teamId}`;
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    }
    return [...map.values()]
      .map((group) => mergeLines(group)!)
      .map(toPerGame);
  }, [filtered]);

  const rows = useMemo(() => {
    const sorted = [...bySeason].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return String(av).localeCompare(String(bv)) * (sortDir === 'asc' ? 1 : -1);
    });
    return sorted;
  }, [bySeason, sortKey, sortDir]);

  const career = useMemo(() => {
    const m = mergeLines(filtered);
    return m ? toPerGame(m) : null;
  }, [filtered]);

  function toggleSort(key: keyof PerGameRow) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'season' ? 'asc' : 'desc');
    }
  }

  if (!lines.length) {
    return <p className="muted">No season stats archived yet.</p>;
  }

  return (
    <div className="player-stats-block">
      <div className="player-stats-tabs">
        {(
          [
            ['regular', 'Regular Season'],
            ['playoffs', 'Playoffs'],
            ['combined', 'Combined'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`btn ${tab === id ? 'primary' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="player-stats-scroll">
        <table className="player-stats-table">
          <thead>
            <tr>
              {(
                [
                  ['season', 'Year'],
                  ['teamAbbrev', 'Team'],
                  ['age', 'Age'],
                  ['gp', 'G'],
                  ['gs', 'GS'],
                  ['mp', 'MP'],
                  ['fg', 'FG'],
                  ['fga', 'FGA'],
                  ['fgPct', 'FG%'],
                  ['tp', '3P'],
                  ['tpa', '3PA'],
                  ['tpPct', '3P%'],
                  ['twop', '2P'],
                  ['twopa', '2PA'],
                  ['twopPct', '2P%'],
                  ['efgPct', 'eFG%'],
                  ['ft', 'FT'],
                  ['fta', 'FTA'],
                  ['ftPct', 'FT%'],
                  ['orb', 'ORB'],
                  ['drb', 'DRB'],
                  ['trb', 'TRB'],
                  ['ast', 'AST'],
                  ['tov', 'TOV'],
                  ['stl', 'STL'],
                  ['blk', 'BLK'],
                  ['pf', 'PF'],
                  ['pts', 'PTS'],
                ] as const
              ).map(([key, label]) => (
                <th key={key} onClick={() => toggleSort(key)}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.season}-${r.teamId}`}>
                <td>{r.season}{r.live ? '*' : ''}</td>
                <td>
                  <TeamLink saveId={saveId} teamId={r.teamId} abbrev />
                </td>
                <td>{r.age}</td>
                <td>{r.gp}</td>
                <td>{r.gs}</td>
                <td>{formatStat(r.mp)}</td>
                <td>{formatStat(r.fg)}</td>
                <td>{formatStat(r.fga)}</td>
                <td>{formatPct(r.fgPct)}</td>
                <td>{formatStat(r.tp)}</td>
                <td>{formatStat(r.tpa)}</td>
                <td>{formatPct(r.tpPct)}</td>
                <td>{formatStat(r.twop)}</td>
                <td>{formatStat(r.twopa)}</td>
                <td>{formatPct(r.twopPct)}</td>
                <td>{formatPct(r.efgPct)}</td>
                <td>{formatStat(r.ft)}</td>
                <td>{formatStat(r.fta)}</td>
                <td>{formatPct(r.ftPct)}</td>
                <td>{formatStat(r.orb)}</td>
                <td>{formatStat(r.drb)}</td>
                <td>{formatStat(r.trb)}</td>
                <td>{formatStat(r.ast)}</td>
                <td>{formatStat(r.tov)}</td>
                <td>{formatStat(r.stl)}</td>
                <td>{formatStat(r.blk)}</td>
                <td>{formatStat(r.pf)}</td>
                <td>{formatStat(r.pts)}</td>
              </tr>
            ))}
            {career ? (
              <tr className="career-row">
                <td colSpan={2}>{careerLabel}</td>
                <td>—</td>
                <td>{career.gp}</td>
                <td>{career.gs}</td>
                <td>{formatStat(career.mp)}</td>
                <td>{formatStat(career.fg)}</td>
                <td>{formatStat(career.fga)}</td>
                <td>{formatPct(career.fgPct)}</td>
                <td>{formatStat(career.tp)}</td>
                <td>{formatStat(career.tpa)}</td>
                <td>{formatPct(career.tpPct)}</td>
                <td>{formatStat(career.twop)}</td>
                <td>{formatStat(career.twopa)}</td>
                <td>{formatPct(career.twopPct)}</td>
                <td>{formatPct(career.efgPct)}</td>
                <td>{formatStat(career.ft)}</td>
                <td>{formatStat(career.fta)}</td>
                <td>{formatPct(career.ftPct)}</td>
                <td>{formatStat(career.orb)}</td>
                <td>{formatStat(career.drb)}</td>
                <td>{formatStat(career.trb)}</td>
                <td>{formatStat(career.ast)}</td>
                <td>{formatStat(career.tov)}</td>
                <td>{formatStat(career.stl)}</td>
                <td>{formatStat(career.blk)}</td>
                <td>{formatStat(career.pf)}</td>
                <td>{formatStat(career.pts)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {rows.some((r) => r.live) ? (
        <p className="muted">* season in progress</p>
      ) : null}
    </div>
  );
}
