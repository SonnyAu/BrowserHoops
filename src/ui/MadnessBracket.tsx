import { useMemo, useState } from 'react';
import { BracketMatchup, BracketSlot, BracketState, MadnessRegion } from '../domain/models';
import { TeamLink } from './EntityLinks';

const TREE_ROUNDS = ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite Eight'] as const;

/** Which part of the always-visible tree is zoomed in. 'all' = even columns. */
type Focus = 'all' | 'First Four' | (typeof TREE_ROUNDS)[number] | 'Final Four';

export function MadnessBracket({
  saveId,
  bracket,
  userTeamId,
}: {
  saveId: string;
  bracket: BracketState;
  userTeamId?: string | null;
}) {
  const [focus, setFocus] = useState<Focus>('all');
  const rounds = bracket.rounds ?? [];
  const firstFour = bracket.firstFour ?? [];

  const byRegionRound = useMemo(() => {
    const map = new Map<string, BracketMatchup[]>();
    for (const m of rounds) {
      const key = `${m.region}|${m.round}`;
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return map;
  }, [rounds]);

  const regionGames = (region: MadnessRegion, round: string): BracketMatchup[] =>
    byRegionRound.get(`${region}|${round}`) ?? [];

  const finalFour = rounds.filter((m) => m.round === 'Final Four');
  const champGame = rounds.find((m) => m.round === 'Championship');

  const live =
    [...firstFour, ...rounds].find(
      (m) =>
        !m.completed &&
        m.slotA.teamId &&
        m.slotB.teamId &&
        !String(m.slotA.teamId).startsWith('ff-winner'),
    ) ?? null;

  const tabs: { id: Focus; label: string }[] = [
    { id: 'all', label: 'Full bracket' },
    ...(firstFour.length ? [{ id: 'First Four' as Focus, label: 'First Four' }] : []),
    { id: 'Round of 64', label: 'Round of 64' },
    { id: 'Round of 32', label: 'Round of 32' },
    { id: 'Sweet 16', label: 'Sweet 16' },
    { id: 'Elite Eight', label: 'Elite Eight' },
    { id: 'Final Four', label: 'Final Four' },
  ];

  const colClass = (round: string) =>
    focus === 'all' ? '' : focus === round ? ' focus' : ' dim';
  const centerSlotClass =
    focus === 'all' ? '' : focus === 'Final Four' ? ' focus' : ' dim';
  const firstFourClass =
    focus === 'all' ? '' : focus === 'First Four' ? ' focus' : ' dim';

  return (
    <div className="madness-stage">
      <header className="madness-header">
        <div>
          <p className="madness-kicker">
            {bracket.status === 'projected' ? 'Projected field' : 'NCAA Tournament'} · Season{' '}
            {bracket.season}
          </p>
          <h1>March Madness</h1>
          {bracket.championName ? (
            <p className="madness-champ">Champions: {bracket.championName}</p>
          ) : (
            <p className="muted">68 teams · One Shining Moment on the line</p>
          )}
        </div>
      </header>

      {live ? (
        <div className="madness-callout">
          <p className="madness-callout-label">Up next</p>
          <h2>
            ({live.slotA.seed}) {live.slotA.teamName} vs ({live.slotB.seed}) {live.slotB.teamName}
          </h2>
          <p style={{ margin: 0, fontSize: 12 }}>{live.round}</p>
        </div>
      ) : null}

      <div className="madness-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`btn ${focus === t.id ? 'primary' : ''}`}
            onClick={() => setFocus(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mtree bracket-zoom">
        <div className="mtree-side">
          <RegionTree
            saveId={saveId}
            region="East"
            games={regionGames}
            userTeamId={userTeamId}
            colClass={colClass}
          />
          <RegionTree
            saveId={saveId}
            region="South"
            games={regionGames}
            userTeamId={userTeamId}
            colClass={colClass}
          />
        </div>

        <div className={`mtree-center${focus === 'Final Four' ? ' grow' : ''}`}>
          <div className={`mtree-center-slot${centerSlotClass}`}>
            <p className="mtree-round-label">Final Four</p>
            {finalFour[0] ? (
              <TreeBox saveId={saveId} m={finalFour[0]} userTeamId={userTeamId} featured />
            ) : null}
          </div>
          <div className={`mtree-center-slot mtree-championship${centerSlotClass}`}>
            <p className="mtree-round-label">Championship</p>
            {champGame ? (
              <TreeBox saveId={saveId} m={champGame} userTeamId={userTeamId} featured />
            ) : null}
            {bracket.status === 'complete' && bracket.championName ? (
              <div className="mtree-champ-banner">
                <span>{bracket.championName}</span>
                <span className="mtree-champ-sub">National Champs · S{bracket.season}</span>
              </div>
            ) : null}
          </div>
          <div className={`mtree-center-slot${centerSlotClass}`}>
            <p className="mtree-round-label">Final Four</p>
            {finalFour[1] ? (
              <TreeBox saveId={saveId} m={finalFour[1]} userTeamId={userTeamId} featured />
            ) : null}
          </div>
          {firstFour.length ? (
            <div className={`mtree-firstfour${firstFourClass}`}>
              <p className="mtree-round-label">First Four</p>
              {firstFour.map((m) => (
                <TreeBox key={m.id} saveId={saveId} m={m} userTeamId={userTeamId} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="mtree-side">
          <RegionTree
            saveId={saveId}
            region="West"
            games={regionGames}
            userTeamId={userTeamId}
            colClass={colClass}
            mirror
          />
          <RegionTree
            saveId={saveId}
            region="Midwest"
            games={regionGames}
            userTeamId={userTeamId}
            colClass={colClass}
            mirror
          />
        </div>
      </div>
    </div>
  );
}

function RegionTree({
  saveId,
  region,
  games,
  userTeamId,
  colClass,
  mirror,
}: {
  saveId: string;
  region: MadnessRegion;
  games: (region: MadnessRegion, round: string) => BracketMatchup[];
  userTeamId?: string | null;
  colClass: (round: string) => string;
  mirror?: boolean;
}) {
  return (
    <div className={`mtree-region${mirror ? ' mirror' : ''}`}>
      <p className="mtree-region-label">{region}</p>
      <div className="mtree-region-cols">
        {TREE_ROUNDS.map((round) => (
          <div className={`mtree-col${colClass(round)}`} key={round}>
            {games(region, round).map((m) => (
              <TreeBox key={m.id} saveId={saveId} m={m} userTeamId={userTeamId} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TreeBox({
  saveId,
  m,
  userTeamId,
  featured,
}: {
  saveId: string;
  m: BracketMatchup;
  userTeamId?: string | null;
  featured?: boolean;
}) {
  const userIn =
    userTeamId && (m.slotA.teamId === userTeamId || m.slotB.teamId === userTeamId);
  return (
    <div
      className={[
        'mtree-box',
        m.completed ? 'done' : '',
        userIn ? 'is-user' : '',
        featured ? 'featured' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <TreeSlot
        saveId={saveId}
        slot={m.slotA}
        winner={Boolean(m.completed && m.winnerId && m.winnerId === m.slotA.teamId)}
        score={m.completed ? m.homeScore : undefined}
        user={m.slotA.teamId === userTeamId}
      />
      <TreeSlot
        saveId={saveId}
        slot={m.slotB}
        winner={Boolean(m.completed && m.winnerId && m.winnerId === m.slotB.teamId)}
        score={m.completed ? m.awayScore : undefined}
        user={m.slotB.teamId === userTeamId}
      />
    </div>
  );
}

function TreeSlot({
  saveId,
  slot,
  winner,
  score,
  user,
}: {
  saveId: string;
  slot: BracketSlot;
  winner: boolean;
  score?: number;
  user?: boolean;
}) {
  const linkable =
    slot.teamId &&
    !slot.teamId.startsWith('ff-winner') &&
    !slot.teamId.startsWith('tbd-');
  return (
    <div className={`mtree-slot${winner ? ' winner' : ''}${user ? ' user' : ''}`}>
      <span className="mtree-seed">{slot.seed ?? ''}</span>
      <span className="mtree-name">
        {linkable ? (
          <TeamLink saveId={saveId} teamId={slot.teamId!}>
            {slot.teamName}
          </TeamLink>
        ) : (
          slot.teamName
        )}
      </span>
      <span className="mtree-score">{score != null ? score : ''}</span>
    </div>
  );
}
