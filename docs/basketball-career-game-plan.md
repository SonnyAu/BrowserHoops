# Basketball Solo Career Simulator: Implementation Plan

## 1. Product Pillars and Scope

Build a browser-based basketball career simulator focused on long-term career management, not direct on-court control. The player creates one athlete, chooses settings, receives a recruiting profile, selects a college from four offers, develops through college, enters the professional draft, and manages a complete professional career through retirement and legacy review.

### Firm product decisions

- The game is a **single-player career simulation** centered on one user-controlled player.
- The user never controls possessions, movement, shot timing, or live gameplay.
- Simulation is **one career-player game at a time**, even when the user chooses a long simulation target.
- Domain and simulation logic must be plain TypeScript and must not depend on React, IndexedDB, Dexie, or external import formats.
- IndexedDB is the primary durable storage system.
- Saves use a hybrid persistence model: periodic canonical snapshots plus immutable history/event records plus rotating autosaves and recovery backups.
- God Mode is a restricted command-based player editor enforced in the domain layer.
- Imported JSON formats are adapters only. They are validated, repaired where safe, converted into canonical game models, and never become internal state.

### Design goals

- Keep screens minimalist, readable, and responsive.
- Hide deep calculations behind clear summaries, tooltips, drilldowns, and review screens.
- Make player decisions meaningful without overwhelming the user with spreadsheet-like controls.
- Support 15 to 25 season careers without degraded responsiveness.
- Preserve immutable history so legacy, records, awards, and career timelines remain trustworthy.

### Non-goals for the first playable version

- No possession-level game engine.
- No licensed team logos or trademark-dependent art without explicit rights.
- No online multiplayer.
- No raw save editor.
- No editing historical outcomes through God Mode.

## 2. Repository Inspection

The current repository is effectively empty: no application stack, package manifest, source tree, or existing architecture was present during planning. This plan therefore recommends a greenfield implementation using the requested browser stack while keeping module boundaries explicit enough to avoid later coupling.

## 3. Recommended Technical Stack

Use the following stack unless later repository additions establish a strong reason to diverge:

- **React** for UI rendering.
- **TypeScript** for application, domain, simulation, workers, schemas, and tests.
- **Vite** for development server and build tooling.
- **React Router** or TanStack Router for lightweight routing.
- **IndexedDB** as primary browser storage.
- **Dexie** as the IndexedDB wrapper for transactions, migrations, and table access.
- **Zod** for runtime validation of settings, saves, templates, data packs, God Mode commands, and imported JSON.
- **Vitest** for unit and integration tests.
- **React Testing Library** for component behavior tests.
- **Playwright** for end-to-end browser tests.
- **Comlink** for ergonomic Web Worker calls, or a small typed message protocol if explicit control is preferred.
- **nanoid** or UUID v7 for stable IDs.
- **seedrandom**, `pure-rand`, or a small custom PRNG wrapper for deterministic seeded randomness.

Tradeoff: this stack is conventional and testable. It avoids heavy state frameworks and server dependencies, but requires discipline around serialization, worker boundaries, and IndexedDB transactions.

## 4. High-Level Architecture

### Layer boundaries

```text
src/
  app/                    # application bootstrap, routes, providers
  ui/                     # reusable components, layout, design system
  features/               # screen-level React features
  state/                  # thin app state, commands, selectors, view models
  domain/                 # canonical models, pure rules, invariants
  simulation/             # game, season, progression, roles, draft engines
  persistence/            # Dexie database, migrations, repositories
  workers/                # simulation and import workers
  importers/              # external format adapters into canonical models
  data/                   # bundled fictional/curated static data packs
  schemas/                # Zod schemas and format versions
  tests/                  # test utilities, fixtures, e2e helpers
```

### Dependency rule

- `domain` has no imports from React, Dexie, workers, or UI.
- `simulation` imports `domain` only.
- `importers` imports schemas and canonical constructors, not UI or persistence.
- `persistence` serializes/deserializes canonical state but does not simulate.
- `features` and `ui` render view models and dispatch application commands.
- `workers` call simulation/import services and return serializable patches/results.

### Recommended folder structure

```text
src/
  app/
    App.tsx
    router.tsx
    providers.tsx
  ui/
    components/
    layout/
    tokens/
    tables/
    charts/
  features/
    saves/
    templates/
    character-creation/
    career-settings/
    recruiting/
    career-home/
    player/
    training/
    college/
    pro-team/
    league/
    actions/
    god-mode/
    history/
    leaderboards/
    season-review/
    retirement/
  state/
    careerStore.ts
    appStore.ts
    commands.ts
    selectors/
    viewModels/
  domain/
    ids.ts
    date.ts
    rng.ts
    positions.ts
    ratings.ts
    player.ts
    teams.ts
    colleges.ts
    contracts.ts
    injuries.ts
    awards.ts
    records.ts
    history.ts
    saves.ts
    settings.ts
    validation.ts
    derived/
      overall.ts
      archetype.ts
      similarities.ts
      draftProjection.ts
      tradeValue.ts
      roles.ts
  simulation/
    controller/
    game/
    season/
    college/
    professional/
    recruiting/
    roles/
    development/
    training/
    injuries/
    events/
    draft/
    contracts/
    trades/
    records/
    leaderboards/
  persistence/
    db.ts
    schemaVersions.ts
    repositories/
    migrations/
    exportImport.ts
    recovery.ts
  workers/
    simulation.worker.ts
    import.worker.ts
    leaderboard.worker.ts
  importers/
    externalLeagueV67/
    basketballSoloCareerLeagueV1/
    collegeDataPackV1/
  schemas/
    saveFormat.ts
    templateFormat.ts
    leagueFormat.ts
    externalLeague.ts
```

## 5. Recommended State Architecture

Use **Dexie as durable source of truth**, a small UI store, and domain selectors.

### Decision

- Use Zustand or React context plus reducer for lightweight UI/application state.
- Do not store the entire career save in multiple global stores.
- Load the active save snapshot into an in-memory `CareerSession` while playing.
- Mutate career state only by domain commands and simulation steps.
- Persist every completed simulation step atomically before UI displays it as final.
- Store derived values through selectors where cheap; cache expensive derived aggregates with invalidation metadata.

### Why this fits

- Career saves are large and long-lived; duplicating full state in React stores risks stale data and expensive renders.
- Simulation needs pure state transitions and deterministic RNG, not component-driven mutation.
- Dexie transactions provide atomicity for autosaves, God Mode backups, and snapshot/history writes.
- A small UI store is sufficient for route state, loading indicators, modal state, active simulation status, and currently selected tabs.

### State categories

- **Durable canonical state:** save snapshot, immutable history, metadata, templates, data packs.
- **Ephemeral UI state:** selected tabs, open panels, filters, toasts, progress indicators.
- **Worker state:** active simulation target, cancellation token, progress messages.
- **Derived state:** overall, archetype, similarities, draft projection, trade value, roles, standings, leaderboards.

## 6. Canonical Data Boundaries

Clearly separate these entities:

- `LeagueDefinition`: static professional teams, rules, salary rules, draft rules, conferences/divisions where relevant.
- `CollegeDefinition`: static college program identities, region, conference, colors, styles, baseline prestige, facilities.
- `ProfessionalTeamDefinition`: stable pro team identity, colors, market, strategy metadata.
- `CharacterTemplate`: reusable player setup only.
- `CareerSave`: evolving career state and immutable history for one career.
- `SaveMetadata`: list-view data, timestamps, version, customized flag, active phase.
- `UserSettings`: global app preferences, accessibility, default autosave behavior.
- `ImmutableHistory`: recruiting history, game logs, stats, awards, records, transactions, contracts history, event outcomes, ratings history, injury history.
- `DynamicSimulationState`: current date, phase, schedules, standings, rosters, current ratings, fatigue, morale, current injuries, roles.
- `DerivedValues`: recalculated projections, overall, archetypes, similarities, trade values, leaderboards.
- `GodModeEditHistory`: command, before/after preview, affected fields, timestamp, backup reference.

### Stable IDs

Use branded string IDs generated at creation time:

```ts
type SaveId = Brand<string, "SaveId">;
type PlayerId = Brand<string, "PlayerId">;
type TeamId = Brand<string, "TeamId">;
type CollegeId = Brand<string, "CollegeId">;
type ConferenceId = Brand<string, "ConferenceId">;
type SeasonId = Brand<string, "SeasonId">;
type GameId = Brand<string, "GameId">;
type EventId = Brand<string, "EventId">;
type TransactionId = Brand<string, "TransactionId">;
type ContractId = Brand<string, "ContractId">;
type AwardId = Brand<string, "AwardId">;
type TemplateId = Brand<string, "TemplateId">;
type DraftPickId = Brand<string, "DraftPickId">;
```

## 7. Character Creation

### Configurable fields

- Name and basic identity.
- Birthplace and home region.
- High school.
- Primary and secondary position.
- Height, weight, wingspan.
- Dominant hand.
- Jersey number.
- Appearance or portrait reference.
- Play style.
- Personality and career priorities.
- Ratings: finishing, shooting, playmaking, ball handling, defense, rebounding, athleticism, strength, stamina, durability, basketball IQ.
- Tendencies: shot profile, pass preference, defensive aggression, rebounding involvement, pace preference.

### Point allocation model

Use an allocated-points system with progressive costs:

```ts
function ratingCost(target: number, cap: number): number {
  // Example bands, tuned by difficulty and build rules.
  // 25-50 cheap, 51-65 moderate, 66-75 expensive, 76+ premium.
}
```

Firm rules:

- Higher ratings cost progressively more.
- Position modifies caps and costs. Example: centers pay more for elite ball handling; guards pay more for elite interior defense.
- Measurements modify caps and costs. Example: extreme height improves interior/rebounding caps but raises speed/handling costs.
- Wingspan improves defensive and rebounding caps but can raise shooting/handling cost.
- Weight improves strength and contact finishing but can reduce speed and stamina caps.
- Extreme builds are allowed but must sacrifice other areas.

### Continuous build feedback

The character creator must continuously display:

- Overall rating from current ratings and position.
- Estimated potential range, not true potential.
- Archetype from position, ratings, tendencies, and physical profile.
- Strengths and weaknesses.
- Position fit and secondary-position viability.
- Attribute caps.
- Remaining points.
- Two or three player similarities separated by:
  - Offensive style.
  - Defensive style.
  - Physical profile.

Similarity text must avoid implying the created player is already as good as a star. Example: “offensive style resembles a movement-shooting wing profile,” not “the next superstar.”

### Character templates

Templates may contain:

- Identity defaults.
- Measurements.
- Ratings.
- Tendencies.
- Play style.
- Appearance.
- Personality and priorities.

Templates must not contain:

- Recruiting results.
- Offers.
- Team assignments.
- Contracts.
- Injuries.
- Statistics.
- Awards.
- Career history.

Template operations:

- Create from completed build.
- Load into character creator.
- Duplicate.
- Rename.
- Delete.
- Export.
- Import.

Templates use a separate `templateFormatVersion` and Zod validation.

## 8. Career Settings

### Settings screen fields

- Career name.
- Difficulty.
- Simulation realism.
- Progression and regression rates.
- Injury frequency and severity.
- Fatigue impact.
- Training effectiveness.
- Trade frequency.
- Trade-request difficulty.
- Contract negotiation difficulty.
- College and professional season lengths.
- Play-in rules.
- Salary-cap rules.
- Draft rules.
- College transfer rules.
- Event and news frequency.
- Autosave settings.
- Simulation interruption preferences.
- Random seed.
- God Mode enabled/disabled.

### Locked vs editable settings

Locked after career creation:

- Random seed.
- Initial career difficulty baseline.
- College/professional season length for already-created seasons.
- Salary-cap model.
- Draft rule model.
- Initial league and college data packs.
- God Mode availability if the save was created with God Mode disabled.

Editable later:

- Autosave frequency.
- Event/news frequency.
- Simulation interruption preferences.
- Accessibility/display preferences.
- Some realism sliders for future seasons only, clearly marked as future-effective.

Tradeoff: locking structural rules preserves deterministic history and avoids corrupting schedules, contracts, and records. Allowing non-structural preferences later improves usability.

## 9. Restricted God Mode

### Command-only model

God Mode is implemented as validated domain commands. No raw JSON editor is exposed. UI controls can only construct one of the allowed commands.

```ts
type GodModeEditCommand =
  | { type: "UPDATE_PLAYER_RATINGS"; playerId: PlayerId; ratings: Partial<PlayerRatings> }
  | { type: "CHANGE_PLAYER_POSITION"; playerId: PlayerId; primaryPosition: Position; secondaryPosition?: Position }
  | { type: "CHANGE_PLAYER_COLLEGE"; playerId: PlayerId; collegeId: CollegeId | null }
  | { type: "CORRECT_DRAFT_INFORMATION"; playerId: PlayerId; draft: DraftInformation }
  | { type: "UPDATE_PLAYER_INJURY"; playerId: PlayerId; injury: PlayerInjury }
  | { type: "UPDATE_CAREER_GOALS"; playerId: PlayerId; goals: CareerGoal[] }
  | { type: "UPDATE_PLAYER_MORALE"; playerId: PlayerId; morale: PlayerMorale }
  | { type: "REPLACE_ACTIVE_CONTRACT"; playerId: PlayerId; contract: PlayerContract | null };
```

### Allowed direct edits

- Current ratings.
- Primary and secondary position.
- College.
- Draft information.
- Current injury.
- Career goals.
- Current morale.
- Active contract information.

### Prohibited direct edits

God Mode must reject commands that attempt to mutate recruiting information, high school history, game logs, season/career statistics, awards, championships, records, transactions, team history, historical ratings, historical injuries, historical contracts, relationships, coach trust, team role, starting status, minutes, usage, depth-chart position, archetype, overall rating, player similarities, draft projection, trade value, potential, development traits, attribute caps, standings, schedules, game results, teams, rosters, league rules, league date, or season phase.

### Enforcement architecture

- `applyGodModeCommand(state, command)` lives in `domain/godMode`.
- Zod validates command shape and value ranges.
- A whitelist maps command type to exact mutable paths.
- Domain validators reject forged paths or unknown command types.
- Derived recalculation runs after command application.
- Persistence wraps the edit in one Dexie transaction.

### Edit flow

1. Build command through UI.
2. Validate command.
3. Produce preview showing affected derived values: overall, archetype, role estimate, draft projection, current rotation impact, contract cap impact where relevant.
4. Require confirmation.
5. Create automatic backup snapshot.
6. Apply command to a copy of canonical state.
7. Recalculate derived values and invalidation keys.
8. Commit backup, updated save, metadata customized flag, and edit log atomically.
9. Allow undo for the latest edit session by restoring the backup through a restricted restore operation.

Once the first edit is committed, `saveMetadata.customizedByGodMode` is permanently true.

### Hidden development profile

God Mode must not reveal or edit true potential, peak-age range, volatility, work ethic, injury resilience, or development traits. Only estimated potential is shown to normal UI and derived from scouting uncertainty.

## 10. Recruiting

### Recruiting profile fields

After character creation and settings, generate immutable high school recruiting history:

- National rank.
- Positional rank.
- Regional or state rank.
- Star level: unranked, two-star, three-star, four-star, five-star.
- High school statistics.
- Accolades.
- Scout confidence.
- Strengths and weaknesses.
- Scout summary.

### Recruiting algorithm

Do not map overall directly to rank. Use a weighted model:

- Current ratings by position.
- Measurements and physical tools.
- Athleticism and positional scarcity.
- Polish: IQ, stamina, skill balance, efficiency tendencies.
- Estimated potential range.
- Generated high school production.
- Competition strength by region.
- Scout confidence and randomized uncertainty.
- Personality and work ethic only as subtle modifiers.

```ts
type RecruitingScoreInputs = {
  ratings: PlayerRatings;
  measurements: Measurements;
  position: Position;
  estimatedPotential: PotentialRange;
  region: Region;
  highSchoolPerformance: HighSchoolStatLine;
  scarcityIndex: number;
  scoutUncertainty: number;
};
```

### Four initial college offers

Generate exactly four offers, each with a distinct tradeoff:

1. Elite program with limited early minutes.
2. Ranked program with a rotation role.
3. Mid-level program offering a starting role.
4. Lower-prestige program willing to build around the player.

Offer selection considers:

- Recruiting level.
- Position.
- Region.
- Team needs.
- School prestige.
- Roster competition.
- Scheme fit.
- Development quality.
- Playing-time opportunity.
- Scholarship availability.
- Coach preferences.

Each offer displays:

- School prestige.
- Preseason ranking.
- Coach quality.
- Development quality.
- Expected role.
- Expected minutes.
- Competition.
- Scrutiny.
- National exposure.
- Draft visibility.
- Scheme fit.

Recruiting and offers become immutable history once the career begins.

## 11. College Database

### College definition

```ts
interface CollegeDefinition {
  id: CollegeId;
  name: string;
  abbreviation: string;
  city: string;
  state: string;
  region: Region;
  conferenceId: ConferenceId;
  colors: string[];
  imageRefs?: ImageRef[];
  baselinePrestige: number;
  currentPrestige: number;
  preseasonRanking?: number;
  recentSuccess: number;
  historicalSuccess: number;
  coachingQuality: number;
  developmentQuality: number;
  recruitingStrength: number;
  facilities: number;
  fanIntensity: number;
  mediaScrutiny: number;
  proScoutingExposure: number;
  offensiveStyle: OffensiveStyle;
  defensiveStyle: DefensiveStyle;
  pace: number;
  positionNeeds: Record<Position, number>;
  roster: PlayerId[];
  scholarshipAvailability: number;
}
```

### Prestige and rankings

- Prestige changes slowly using recent success, tournament runs, draft outcomes, coaching changes, and recruiting classes.
- Preseason rankings change every season using returning talent, recruits, transfers, coaching, previous results, roster balance, and uncertainty.
- High-prestige programs provide stronger teammates, exposure, scrutiny, and tougher rotation competition.
- Lower-prestige programs provide more immediate opportunity, weaker teammates, lower exposure, and less reliable tournament access.

### Data population and licensing

Support three data sources:

1. **Fictional default pack** shipped with the game. This is the safest default and avoids trademark/logo risk.
2. **Curated non-logo pack** with real school-like metadata only if licensing review allows names and factual data use. Avoid official logos, mascots, proprietary images, and copied statistical databases.
3. **Community data packs** imported by users with clear warnings that users are responsible for rights.

Implementation rules:

- Never hardcode behavior around school names.
- Reference images by pack-local IDs or URLs with provenance metadata.
- Keep data packs versioned and validated.
- Provide a development CLI converter to transform curated CSV/JSON into `CollegeDataPack v1`.

## 12. College Roles and Career

### Role assignment inputs

Role, minutes, usage, and starting status are dynamic simulation outputs based on:

- Recruiting rank.
- Star level.
- Ratings.
- Estimated and hidden potential where appropriate.
- Position.
- Physical readiness.
- School prestige.
- Preseason ranking.
- Roster competition.
- Returning starters.
- Coach preferences.
- Scheme fit.
- Position need.
- Practice performance.
- Personality.
- Work ethic.
- Injuries.
- Recruiting promises.

### Role ladder

- Deep reserve.
- Developmental reserve.
- Rotation player.
- Sixth man.
- Spot starter.
- Starter.
- Featured starter.
- Primary option.
- Program star.

Roles control expected minutes, usage, coach trust, role security, scrutiny, and development opportunities. They do not directly overwrite immutable history.

### College career systems

Support:

- One-and-done path.
- Multi-year careers.
- Transfers.
- Redshirts.
- Returning to school after draft evaluation.
- Going undrafted.
- Conference tournaments.
- National tournaments.
- College awards.
- All-conference teams.
- All-American teams.
- Draft-stock changes.

### Draft stock model

Draft stock considers age, measurements, production, efficiency, competition, team success, tournament performance, ratings, potential, health, consistency, recruiting pedigree, and scout uncertainty. It is recalculated, not stored as editable truth.

## 13. Professional Draft and Career

### Draft process

- Draft declaration decision.
- Return-to-college decision where allowed.
- Draft projections.
- Combine measurements.
- Athletic testing.
- Interviews.
- Team workouts.
- Stock movement.
- Draft night.
- Undrafted outcomes.
- Rookie contracts.

Selection model:

- Team needs.
- Player value.
- Roster fit.
- Contract/cap context.
- Draft range uncertainty.
- Team strategy and tolerance for risk.

### Professional career systems

Support:

- Rotation competition and team roles.
- Training.
- Injuries and fatigue.
- Morale.
- Coach, teammate, and front-office relationships.
- Media and fan scrutiny.
- Trade requests and trades.
- Rookie contracts.
- Extensions.
- Free agency.
- Awards and All-Star selections.
- Playoffs and championships.
- Records.
- Aging and regression.
- Retirement.
- Hall of Fame or legacy evaluation.

## 14. Training and Development

### Training choices

Focus options:

- Shooting.
- Finishing.
- Playmaking.
- Ball handling.
- Defense.
- Rebounding.
- Athleticism.
- Strength.
- Conditioning.
- Basketball IQ.
- Recovery.
- Balanced development.

Each training plan includes:

- Primary focus.
- Optional secondary focus.
- Intensity.
- Recovery priority.

### Development model

Use hidden development profiles:

```ts
interface HiddenDevelopmentProfile {
  truePotential: number;
  peakAgeStart: number;
  peakAgeEnd: number;
  volatility: number;
  workEthic: number;
  injuryResilience: number;
  developmentTrait: DevelopmentTrait;
}
```

Normal UI shows only estimated potential ranges. God Mode cannot reveal or edit hidden profiles.

Training effects consider:

- Age.
- Current rating and cap.
- Diminishing returns.
- Work ethic.
- Coaching and facilities.
- Role and minutes.
- Schedule density.
- Fatigue.
- Injury risk.
- Recovery priority.
- Difficulty and realism settings.

Progression is gradual and uncertain. Avoid guaranteed rating increases after every training choice. Use fractional hidden progress buckets and surface progress qualitatively.

## 15. Event and Decision System

### Event definition

```ts
interface CareerEventDefinition {
  id: string;
  eligiblePhases: CareerPhase[];
  trigger: EventTriggerExpression;
  choices: CareerEventChoice[];
  expiration?: GameDate;
  interruption: SimulationInterruptionPolicy;
  followUps?: EventFollowUp[];
}

interface CareerEventChoice {
  id: string;
  label: string;
  description: string;
  immediateEffects: DomainEffect[];
  delayedEffects: DelayedEffect[];
  hiddenEffects: HiddenEffect[];
}
```

### Decision examples

- Accept or challenge role.
- Request more minutes.
- Change training.
- Play through injury.
- Rest.
- Respond to coaching feedback.
- Transfer.
- Declare for draft.
- Select agent.
- Request or withdraw trade request.
- Make trade request public.
- Name preferred destinations.
- Accept extension.
- Test free agency.
- Select contract.
- Mentor teammates.
- Respond to criticism.
- Prioritize stats or winning.
- Retire.

Recorded outcomes are immutable history and may trigger delayed effects later.

## 16. Trade Requests and Contracts

### Trade requests

Support states:

- Private discussion.
- Role complaint.
- Formal private request.
- Public demand.
- Preferred destinations submitted.
- Withdrawn.
- Resolved by trade.
- Denied or stale.

A request never guarantees a trade. Evaluation considers contract length, value, age, potential, team direction, trade market, salary matching, deadline timing, relationships, leverage, reputation, and whether the request is public.

### Contracts

Support:

- Rookie contracts.
- Extensions.
- Team options.
- Player options.
- Qualifying offers where appropriate.
- Restricted free agency.
- Unrestricted free agency.
- Minimum contracts.
- Maximum contracts.
- Multi-year deals.

Contract offers consider production, age, health, potential, role, market demand, team cap space, winning opportunity, playing time, location, loyalty, relationships, and reputation.

God Mode may edit only the active contract. Historical contracts and past earnings are immutable.

## 17. Simulation Controls and Controller

### Supported controls

Professional targets:

- Next game.
- One week.
- One month.
- Until All-Star break.
- Until trade deadline.
- Until postseason.
- Until playoffs.
- Until end of season.
- Resume.
- Pause.

College targets:

- Next game.
- One week.
- One month.
- Until conference play.
- Until conference tournament.
- Until national tournament.
- Until season end.
- Resume.
- Pause.

### One-game-at-a-time loop

Every option internally simulates one career-player game at a time:

1. Simulate the career player's next game.
2. Simulate required league games.
3. Update standings and rankings.
4. Update statistics and records.
5. Update injuries, fatigue, and morale.
6. Update progression, relationships, coach trust, and roles.
7. Update awards, recruiting status, or draft stock where relevant.
8. Generate news and events.
9. Check milestones and interruptions.
10. Persist the save atomically.
11. Yield control to the browser.
12. Check for pause or target completion.

Pausing stops before the next player game begins. The last completed game remains saved.

### Controller architecture

Use a Web Worker with an asynchronous state machine:

```ts
type SimulationCommand =
  | { type: "START"; saveId: SaveId; target: SimulationTarget }
  | { type: "PAUSE_REQUESTED" }
  | { type: "RESUME" }
  | { type: "CANCEL" };

type SimulationStatus =
  | { type: "IDLE" }
  | { type: "RUNNING"; target: SimulationTarget; lastCompletedGameId?: GameId }
  | { type: "PAUSING" }
  | { type: "INTERRUPTED"; reason: InterruptionReason; eventIds: EventId[] }
  | { type: "COMPLETED"; target: SimulationTarget }
  | { type: "FAILED"; error: SerializedError };
```

The worker should not write directly to React state. It sends progress messages. The main thread coordinates Dexie transactions unless the worker owns a dedicated persistence repository. Prefer worker-owned simulation and main-thread persistence initially to simplify Dexie debugging; move persistence into the worker later if profiling requires it.

### Interruptions

Long simulations may interrupt for:

- Injuries.
- Role changes.
- Transfers.
- Draft declarations.
- Trades.
- Contract decisions.
- Playoff qualification.
- Elimination games.
- Championships.
- Records.
- Awards.
- User-selected news/event priorities.

## 18. Game Simulation

### Engine scope

The engine does not simulate every possession. It generates plausible team results and full player/team box scores using deterministic seeded randomness.

### Inputs

- Ratings.
- Position.
- Archetype.
- Tendencies.
- Role.
- Minutes.
- Usage.
- Lineup fit.
- Teammates.
- Opponent quality.
- Positional defense.
- Pace and strategy.
- Coaching.
- Fatigue.
- Morale.
- Health.
- Home court.
- Recent form.
- Pressure.
- Random variance.

### Outputs

Each game produces:

- Final score.
- Team box scores.
- Full player box score: minutes, field goals, threes, free throws, rebounds, assists, steals, blocks, turnovers, fouls, points, plus-minus.
- Game grade.
- Milestones.
- Injury updates.
- Fatigue and morale changes.
- Record and award race updates.

### Determinism

- Every simulation step receives an explicit RNG state.
- The same canonical state and seed produce the same result unless the user makes a different decision or commits a God Mode edit.
- Persist RNG state after every completed step.

## 19. Screens, Routes, and Information Architecture

### Routes

```text
/
/saves
/templates
/new/character
/new/settings
/new/recruiting
/career/:saveId
/career/:saveId/player
/career/:saveId/training
/career/:saveId/college/:collegeId
/career/:saveId/pro-team/:teamId
/career/:saveId/league
/career/:saveId/actions
/career/:saveId/god-mode
/career/:saveId/history
/career/:saveId/leaderboards
/career/:saveId/season-review/:seasonId
/career/:saveId/retirement
```

### Save dashboard

Supports creating, continuing, renaming, duplicating, exporting, importing, deleting, and recovering saves. Shows metadata: career name, player, phase, current team/school, season, record, last played, customized flag, and autosave/recovery status.

### Career dashboard

Shows current player, team, role, record, date, next opponent, recent games, upcoming schedule, training, fatigue, morale, health, coach trust, draft or contract status, messages, decisions, and simulation controls.

### Career history

Shows season-by-season statistics, teams, schools, contracts, transactions, awards, playoff runs, injuries, milestones, ratings history, and timeline.

### All-time leaderboards

Supports college and professional stats, regular season/postseason filters, totals, per-game values, active/retired filters, position filters, and era filters.

### End-of-season review

Summarizes team results, player statistics, awards, rankings, milestones, postseason performance, rating changes, development, role changes, draft-stock changes, contract status, and career trajectory.

## 20. Visual Design System

### Design direction

- Clean typography.
- Neutral surfaces.
- Restrained team colors as accents, not full-screen themes.
- Strong spacing and hierarchy.
- Accessible contrast.
- Responsive layouts.
- Subtle motion.
- Consistent cards and tables.
- Useful empty states.
- Tooltips for advanced metrics.

Avoid giant headers, excessive gradients, dense walls of stats, tiny text, excessive modals, deeply nested navigation, and animations that slow simulation.

### Design tokens

```ts
const tokens = {
  typography: {
    fontSans: "Inter, ui-sans-serif, system-ui",
    size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 32 },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeight: { tight: 1.15, normal: 1.45, relaxed: 1.65 }
  },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 },
  radii: { sm: 6, md: 10, lg: 16, xl: 24, pill: 999 },
  surfaces: { page: "#0f1115", card: "#171a21", elevated: "#1f2430" },
  borders: { subtle: "#2a3040", strong: "#3b4458" },
  shadows: { card: "0 10px 30px rgba(0,0,0,.18)" },
  semantic: { success: "#2fbf71", warning: "#f4b740", danger: "#e35d6a", info: "#4f8cff" },
  teamAccent: { primary: "var(--team-primary)", secondary: "var(--team-secondary)" },
  motion: { fast: "120ms", normal: "180ms", slow: "260ms", easing: "cubic-bezier(.2,.8,.2,1)" }
};
```

### Navigation

- Desktop: left rail for major career sections; top bar for save status and simulation controls.
- Mobile: bottom navigation for primary sections; collapsible action sheet for simulation controls and decisions.
- Tables collapse into summary cards on mobile with “details” drilldowns.

## 21. IndexedDB and Saves

### Recommended structure

Use a hybrid approach:

- **Snapshots** for fast load and recovery.
- **Normalized tables** for metadata, templates, data packs, history indexes, and exports.
- **Immutable event/history logs** for game logs, transactions, awards, event outcomes, God Mode edits, and season reviews.

This avoids replaying decades of events on load while preserving historical integrity and efficient leaderboards.

### Dexie tables

```ts
interface BrowserHoopsDb extends Dexie {
  saveMetadata: Table<SaveMetadataRecord, SaveId>;
  saveSnapshots: Table<SaveSnapshotRecord, string>;
  autosaves: Table<AutosaveRecord, string>;
  recoveryBackups: Table<RecoveryBackupRecord, string>;
  characterTemplates: Table<CharacterTemplateRecord, TemplateId>;
  userSettings: Table<UserSettingsRecord, string>;
  leagueDefinitions: Table<LeagueDefinitionRecord, string>;
  collegeDataPacks: Table<CollegeDataPackRecord, string>;
  gameLogs: Table<GameLogRecord, GameId>;
  seasonStats: Table<SeasonStatsRecord, string>;
  transactions: Table<TransactionRecord, TransactionId>;
  awards: Table<AwardRecord, AwardId>;
  records: Table<RecordBookRecord, string>;
  godModeEdits: Table<GodModeEditRecord, string>;
  importReports: Table<ImportReportRecord, string>;
}
```

### Atomic commits

Simulation step transaction writes:

- Updated canonical snapshot.
- Metadata update.
- New game log.
- Updated stats records.
- New history entries.
- Autosave/recovery records if configured.
- Derived cache invalidations.

God Mode transaction writes:

- Backup snapshot.
- Updated canonical snapshot.
- Metadata customized flag.
- Edit log.
- Derived cache invalidations.

Do not display a game or edit as finalized until the transaction succeeds.

### Versions

Maintain separate versions:

- `appDbVersion` for IndexedDB schema.
- `saveFormatVersion` for career snapshots.
- `leagueFormatVersion` for canonical league definitions.
- `templateFormatVersion` for character templates.
- `externalImportFormatVersion` for adapter inputs.
- `collegeDataPackVersion` for college data.

## 22. External JSON Adapter

### Role of external format

The example format is an input format only. It must not become internal state.

### Adapter responsibilities

- Validate the structure with path-specific errors.
- Normalize positions.
- Normalize height, weight, salary units, season fields, and team IDs.
- Select current ratings from ratings history.
- Preserve useful historical stats and awards.
- Map external team IDs to stable canonical team IDs.
- Handle missing fields with defaults or skipped records.
- Detect duplicate names and duplicate IDs.
- Handle free agents and inactive teams.
- Preserve unknown fields in an import report, not canonical state.
- Report repaired and skipped records.

### Import pipeline

```text
raw JSON
  -> external schema validation
  -> repair pass with warnings
  -> canonical mapping
  -> domain validation
  -> preview report
  -> user confirmation
  -> IndexedDB transaction
```

## 23. BasketballSoloCareerLeague v1

### Format goals

A purpose-built versioned JSON format named `BasketballSoloCareerLeague v1` supports in-game importing and optional development CLI conversion.

It separates static definitions from evolving career state.

### Top-level outline

```ts
interface BasketballSoloCareerLeagueV1 {
  format: "BasketballSoloCareerLeague";
  version: 1;
  metadata: LeagueMetadataV1;
  staticDefinitions: {
    conferences: ConferenceV1[];
    colleges: CollegeV1[];
    professionalTeams: ProfessionalTeamV1[];
    rules: LeagueRulesV1;
    salaryRules: SalaryRulesV1;
    draftRules: DraftRulesV1;
    recruitingConfig: RecruitingConfigV1;
    images?: ImageAssetV1[];
  };
  initialState?: {
    players: PlayerV1[];
    ratings: PlayerRatingsV1[];
    hiddenDevelopmentProfiles?: HiddenDevelopmentProfileV1[];
    tendencies?: PlayerTendenciesV1[];
    contracts?: ContractV1[];
    historicalStatistics?: HistoricalStatLineV1[];
    awards?: AwardV1[];
    records?: RecordV1[];
    schedules?: ScheduleV1[];
    tournaments?: TournamentV1[];
    playoffs?: PlayoffStateV1[];
  };
  provenance: ImportProvenanceV1;
}
```

### Zod outline

```ts
const BasketballSoloCareerLeagueV1Schema = z.object({
  format: z.literal("BasketballSoloCareerLeague"),
  version: z.literal(1),
  metadata: LeagueMetadataSchema,
  staticDefinitions: z.object({
    conferences: z.array(ConferenceSchema),
    colleges: z.array(CollegeSchema),
    professionalTeams: z.array(ProfessionalTeamSchema),
    rules: LeagueRulesSchema,
    salaryRules: SalaryRulesSchema,
    draftRules: DraftRulesSchema,
    recruitingConfig: RecruitingConfigSchema,
    images: z.array(ImageAssetSchema).optional()
  }),
  initialState: z.object({
    players: z.array(PlayerSchema),
    ratings: z.array(PlayerRatingsSchema),
    hiddenDevelopmentProfiles: z.array(HiddenDevelopmentProfileSchema).optional(),
    tendencies: z.array(PlayerTendenciesSchema).optional(),
    contracts: z.array(ContractSchema).optional(),
    historicalStatistics: z.array(HistoricalStatLineSchema).optional(),
    awards: z.array(AwardSchema).optional(),
    records: z.array(RecordSchema).optional(),
    schedules: z.array(ScheduleSchema).optional(),
    tournaments: z.array(TournamentSchema).optional(),
    playoffs: z.array(PlayoffStateSchema).optional()
  }).optional(),
  provenance: ImportProvenanceSchema
});
```

### CLI converter

Add an optional `scripts/convert-league.ts` later to convert curated CSV/JSON into this format, validate it, and emit an import report.

## 24. Testing Strategy

### Unit tests

Cover:

- Character creation point allocation.
- Position and measurement caps.
- Archetype and similarity calculations.
- Template validation and forbidden fields.
- Recruiting ranks and star levels.
- Four diverse college offers.
- College role assignment.
- Draft projection.
- Training and progression.
- Injury generation and recovery.
- Contract offer generation.
- Trade request evaluation.
- Every allowed God Mode command.
- Rejection of every prohibited God Mode field.
- Deterministic RNG.

### Integration tests

Cover:

- Character creation through recruiting.
- College selection through first simulated game.
- Full college season and tournament.
- Draft declaration and selection.
- Professional season and playoffs.
- IndexedDB saves and migrations.
- Autosave recovery.
- Long simulation pause/resume.
- Event interruptions.
- End-of-season reviews.
- Career history and leaderboards.
- Save/template import and export.
- External JSON parsing and conversion.
- God Mode backup, undo, edit logging, and customization marking.

### End-to-end tests

Cover:

- Create career, save template, choose settings, view recruiting, select college, simulate first game.
- Long simulation interrupted by injury or decision.
- Export and import save.
- Recover autosave after simulated crash.
- Use God Mode allowed edit and verify derived recalculation.
- Attempt forged God Mode command and verify rejection.

### Edge cases

- Corrupted IndexedDB records.
- Browser closure during writes.
- Invalid imports.
- Duplicate IDs.
- Duplicate names.
- Missing history.
- Long careers of 25+ seasons.
- Undrafted players.
- Invalid contracts.
- Invalid injuries.
- Simulations with no upcoming games.
- Empty data packs.
- Unavailable teams or colleges.

## 25. Performance Plan

### Main thread

Keep on main thread:

- React rendering.
- Small selectors for current screen.
- User input validation.
- Dexie transaction coordination initially.
- Lightweight derived values for visible cards.

### Asynchronous chunks

Use async chunking for:

- Save export assembly.
- Template imports.
- Recovering large autosave lists.
- Rendering paginated timelines.

### Web Workers

Use workers for:

- Long simulation targets.
- External JSON validation and conversion.
- Leaderboard calculations over multi-decade histories.
- Bulk derived cache rebuilds.

### Data volume controls

- Paginate career history and game logs.
- Virtualize large tables.
- Cache leaderboards by stat, phase, era, and invalidation version.
- Store season aggregates separately from game logs.
- Recalculate only affected derived data after God Mode edits.
- Keep worker messages compact by sending patches or IDs where practical.

## 26. Roadmap: Working Vertical Slices

Each phase must leave the game usable and testable.

1. **Application shell, routing, design system, IndexedDB, and save dashboard**
   - Create routes, layout, tokens, Dexie schema, metadata table, empty dashboard operations.
2. **Character creation, attribute allocation, comparisons, and templates**
   - Build character creator, cap/cost rules, archetype, similarities, template CRUD/export/import.
3. **Settings, recruiting generation, college database, and four offers**
   - Add settings screen, seed handling, fictional college pack, recruiting profile, four offer algorithm.
4. **College dashboard, role assignment, one-game simulation, statistics, training, and autosave**
   - Establish first playable loop with one college game and atomic save.
5. **Long simulation, pause, resume, targets, and event interruptions**
   - Add worker controller and interruption policies.
6. **Full college season, tournaments, awards, and draft stock**
   - Complete college progression loop.
7. **Draft process and professional entry**
   - Add declaration, combine, workouts, draft night, undrafted flow, rookie contract.
8. **Professional seasons, roles, injuries, contracts, and playoffs**
   - Implement pro career foundation.
9. **Trade requests, relationships, extensions, and free agency**
   - Add higher-level career management decisions.
10. **Career history, leaderboards, retirement, and legacy**
   - Add long-term payoff screens and record books.
11. **Restricted God Mode**
   - Add command UI, domain enforcement, previews, backups, undo, edit log.
12. **External data import, custom data packs, and export tools**
   - Add adapters, purpose-built format, import reports, CLI converter.

## 27. Smallest Vertical Slice That Proves the Architecture

The smallest proof should include:

- Save dashboard with create/continue/delete.
- Character creator with point allocation, caps, archetype, similarities, and template save/load.
- Career settings with seed and autosave preferences.
- Fictional college data pack with at least 16 colleges.
- Recruiting profile and exactly four college offers.
- College selection.
- Career home dashboard.
- One-game college simulation.
- Atomic IndexedDB persistence of snapshot, game log, stats, and autosave.
- Deterministic replay test for the same seed/state.
- Basic career history page showing the first game.

This slice proves UI, canonical models, settings, recruiting, data packs, simulation, persistence, deterministic RNG, and history boundaries without building the full career.

## 28. Exact Early Implementation Order

1. Initialize Vite React TypeScript project and test tooling.
2. Add linting/formatting and path aliases.
3. Implement design tokens, shell layout, and route map.
4. Implement branded IDs, positions, ratings, measurements, RNG, and Zod base schemas.
5. Implement Dexie database with version 1 tables: metadata, snapshots, autosaves, templates, settings, data packs, game logs.
6. Implement repositories and atomic transaction helpers.
7. Build save dashboard with create, rename, duplicate, delete, export, import stubs, and recovery UI placeholders.
8. Implement character creation domain rules: caps, costs, overall, archetype, similarities.
9. Build character creator UI.
10. Implement template schema, CRUD, export, import, and forbidden-field tests.
11. Implement career settings schema and UI, including locked/editable explanations.
12. Create fictional college data pack and validation.
13. Implement recruiting profile generator and four-offer generator.
14. Build recruiting dashboard and college offer selection.
15. Implement initial `CareerSave` creation from character, settings, recruiting, and selected college.
16. Implement college role assignment.
17. Implement one-game simulation engine and deterministic RNG tests.
18. Implement atomic simulation-step persistence.
19. Build career dashboard with next-game simulation control.
20. Add first career history view.

## 29. Largest Technical Risks

- Keeping deterministic simulation stable across workers, persistence, and migrations.
- Preventing React/UI code from mutating canonical save state directly.
- Designing IndexedDB transactions that remain fast for long careers.
- Migrating save formats without corrupting user careers.
- Maintaining clean boundaries between external import formats and canonical models.
- Efficient leaderboards and history views over 25-season saves.
- God Mode enforcement against forged commands rather than only UI hiding.
- Pausable long simulations that always stop at safe, persisted boundaries.

## 30. Largest Game-Design Risks

- Recruiting feeling too directly tied to overall rating.
- College offers lacking meaningful tradeoffs.
- Roles and minutes feeling arbitrary or unfair.
- Training feeling either too deterministic or too opaque.
- Long simulations skipping events the user cares about.
- God Mode undermining legacy credibility if customization is not clearly marked.
- Career progression becoming too linear across 15 to 25 seasons.
- Interfaces becoming stat-dense instead of polished and digestible.

## 31. Definition of Done for the First Playable Version

The first playable version is done when a user can:

- Create a player with identity, measurements, ratings, play style, personality, and visible build feedback.
- Save and load character templates without career-history leakage.
- Configure career settings and understand locked vs editable choices.
- Generate a recruiting profile with rank, star level, stats, accolades, scout confidence, strengths, weaknesses, and summary.
- Compare exactly four college offers with distinct tradeoffs.
- Select a college and enter a career dashboard.
- See a dynamic college role, expected minutes, training status, fatigue, morale, health, coach trust, and next opponent.
- Simulate at least one college game with deterministic results and a full player box score.
- Persist the completed game atomically to IndexedDB before it appears finalized.
- View basic career history and game log.
- Export/import a save and recover from a rotating autosave.
- Run automated tests for character creation, templates, recruiting, four offers, one-game simulation, deterministic replay, and IndexedDB persistence.

## 32. Final Recommendations

### Recommended technical stack

React, TypeScript, Vite, lightweight routing, IndexedDB, Dexie, Zod, Vitest, React Testing Library, Playwright, Web Workers, and deterministic seeded RNG.

### Recommended state architecture

Use Dexie-backed canonical saves as durable truth, one active in-memory `CareerSession`, a small UI store for ephemeral interface state, domain commands for mutation, and selectors/view models for rendering. Do not duplicate the full save in multiple stores.

### Recommended IndexedDB structure

Use a hybrid model: snapshots for fast load, normalized metadata/templates/data packs/history indexes for queries, immutable logs for game results/events/transactions/God Mode edits, rotating autosaves, and recovery backups. Commit simulation steps and God Mode sessions atomically.

### Recommended simulation architecture

Use a pure TypeScript simulation engine and a cancellable asynchronous worker controller. Every long target simulates one career-player game at a time, persists after each completed game, yields to the browser, then checks pause, interruption, and target completion.

### Recommended canonical data model

Use stable branded IDs, canonical `CareerSave` state, immutable history collections, dynamic simulation state, separate league/college/team definitions, separate character templates, and derived values recalculated by selectors or domain services. External JSON adapters must convert into this model before simulation.

### Recommended God Mode command architecture

Use domain-enforced structured commands only. Allow ratings, position, college, draft information, current injury, career goals, current morale, and active contract edits. Reject all prohibited historical, derived, structural, relationship, role, roster, schedule, result, and hidden-development edits. Provide validation, preview, confirmation, automatic backup, latest-session undo, edit log, and permanent customized-save marking.

### Smallest vertical slice that proves the architecture

Build save dashboard, character creator, templates, settings, fictional college data, recruiting profile, four offers, college selection, one-game college simulation, atomic IndexedDB persistence, deterministic replay test, and basic career history.

### Exact early implementation order

Initialize the app and tests, create design/routing shell, define domain primitives and schemas, build Dexie persistence, implement save dashboard, implement character creation and templates, add settings, add fictional colleges, add recruiting and offers, create the first career save, implement college role assignment, implement one-game simulation, persist atomically, and expose the first career history page.

### Largest technical risks

Determinism, IndexedDB migrations, long-career performance, worker/persistence coordination, import boundary discipline, God Mode enforcement, and avoiding duplicated mutable save state.

### Largest game-design risks

Recruiting fairness, college-offer variety, role transparency, training uncertainty, meaningful interruptions, legacy credibility after God Mode, and keeping UI elegant despite deep systems.

### Definition of done for the first playable version

A user can create a player, save/load templates, configure settings, receive recruiting history, choose among four meaningful college offers, enter the college dashboard, simulate one deterministic college game, persist it atomically, view career history, export/import or recover the save, and pass the automated tests for the implemented slice.
