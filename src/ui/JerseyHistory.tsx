import { jerseyFaceColors } from '../domain/collegeLookup';
import { TeamLink, resolveTeam } from './EntityLinks';

export type JerseyStop = {
  teamId: string;
  number: number;
  level: 'college' | 'pro';
};

function JerseyTiles({
  saveId,
  stops,
}: {
  saveId: string;
  stops: JerseyStop[];
}) {
  return (
    <div className="jersey-history-tiles">
      {stops.map((s) => {
        const t = resolveTeam(s.teamId);
        const { bg, fg } = jerseyFaceColors(t.colors);
        return (
          <TeamLink
            key={`${s.level}-${s.teamId}-${s.number}`}
            saveId={saveId}
            teamId={s.teamId}
            className="jersey-tile"
          >
            <span
              className="jersey-tile-face"
              style={{ background: bg, color: fg }}
              title={`${t.name} #${s.number}`}
            >
              {s.number}
            </span>
          </TeamLink>
        );
      })}
    </div>
  );
}

export function JerseyHistory({
  saveId,
  stops,
}: {
  saveId: string;
  stops: JerseyStop[];
}) {
  if (!stops.length) return null;
  const college = stops.filter((s) => s.level === 'college');
  const pro = stops.filter((s) => s.level === 'pro');
  const showLabels = college.length > 0 && pro.length > 0;

  return (
    <div className="jersey-history" aria-label="Jersey history">
      {college.length > 0 ? (
        <div className="jersey-history-group">
          {showLabels ? <p className="jersey-history-label">College</p> : null}
          <JerseyTiles saveId={saveId} stops={college} />
        </div>
      ) : null}
      {pro.length > 0 ? (
        <div className="jersey-history-group">
          {showLabels ? <p className="jersey-history-label">NBA</p> : null}
          <JerseyTiles saveId={saveId} stops={pro} />
        </div>
      ) : null}
    </div>
  );
}
