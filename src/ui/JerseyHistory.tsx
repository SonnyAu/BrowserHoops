import { TeamLink, resolveTeam } from './EntityLinks';

export type JerseyStop = {
  teamId: string;
  number: number;
};

export function JerseyHistory({
  saveId,
  stops,
}: {
  saveId: string;
  stops: JerseyStop[];
}) {
  if (!stops.length) return null;
  return (
    <div className="jersey-history" aria-label="Jersey history">
      {stops.map((s) => {
        const t = resolveTeam(s.teamId);
        const bg = t.colors[0] ?? '#333';
        const num = t.colors[1] ?? '#fff';
        return (
          <TeamLink
            key={`${s.teamId}-${s.number}`}
            saveId={saveId}
            teamId={s.teamId}
            className="jersey-tile"
          >
            <span
              className="jersey-tile-face"
              style={{ background: bg, color: num }}
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
