# ROADMAP — Northern Norway

Planned work. [SPEC.md](SPEC.md) describes the game as it is built today and
never depends on anything here; when a phase lands, its rules move into
SPEC.md and its entry disappears from this file.

Goal: a larger, geographically-inspired map with water, and unit types that
use it (ships, planes). Every phase ends with a green `npm test` and a
playable game; the current 16×16 board stays playable throughout.

## Phase order

| # | Change |
| --- | --- |
| 1 | Path-distance AI seek **and** the Northern Norway map, together |
| 2 | Ship and plane unit types; cargo (below) |
| 3 | Victory conditions and turn-cap retune |

Merging (SPEC.md §3.7) was the first piece of this work and is built. It was
independent of everything above, which is why it landed first. The renderer
deriving board size from `state.map` instead of a hardcoded 16 is also built,
independently, ahead of this phase order — it was a prerequisite the map work
above needs, not a phase of its own.

The terrain cost table and movement domains (land/sea/air) — originally this
table's phase 1 — are also built: `reachableTiles` (SPEC.md §3.5) is now
Dijkstra over per-tile movement cost via a bucket queue, and `UnitStats`
carries a `domain` field. It was independent of the map/AI work below, which
is why it landed ahead of it; ships and planes are unblocked now that the
domain table exists (they're stat-table rows plus a `domain`, not hardcoded
special cases).

Map format — terrain layer separate from the unit roster, plus a map
registry keyed by id — is also built, and was independent of everything
below, which is why it took the phase-1 slot next and has now vacated it in
turn. `parseMap` is gone; `src/sim/map.ts` now has `parseTerrain`,
`buildRoster`, and `loadMap`, and `src/sim/maps.ts` is a registry
(`getMapDef`) that `newGame`/`replay` look up by an optional `mapId`. Only
`standard` is registered — this phase built the mechanism multiple maps
need, not a second map's content. The Northern Norway map itself is still
phase 1's job below, alongside the AI seek change it's paired with.

One ordering constraint is not negotiable:

- **Phase 1 is one phase, not two.** The seek phase in `ai.ts` minimises
  Chebyshev distance to the nearest enemy (SPEC.md §4). On a coastline that
  walks land units to the shore and strands them opposite an enemy they can
  never path to — every game becomes a turn-cap draw. The seek phase must move
  to a Dijkstra distance field over passable terrain in the same change that
  introduces the map.

Phase 1 also ends the map's 180°-rotational symmetry, which is what currently
makes "both sides win at least once" (SPEC.md §8) a meaningful fairness check.
Balance moves to asymmetric rosters, and the self-play assertion becomes a
win-rate band rather than a presence check.

**Re-test the AI merge heuristic when phase 1 lands.** SPEC.md §4 has the
measurements showing every heuristic tried costs ~15 points of win rate on the
current open map, because merging forfeits an attack every turn plus a body's
worth of zone of control. A one-tile chokepoint inverts that: the second unit
cannot attack anyway and its ZoC is redundant, so merging costs nothing.
`applyExpected` already handles the action, so only `chooseUnitAction` needs
to change.

## Cargo — designed for, not built

Loading an infantry onto a ship is the same player-facing verb as merging, and
reuses the same action and the same UI panel, but has a different effect: it
sets cargo on the carrier instead of scaling its stack. `mergeKind` gains a
`'load'` result and `UnitStats` gains a `capacity` column; `reduce` grows one
branch. Nothing already built changes.

Two decisions are recorded now so the later change stays additive:

- **Passengers nest inside the carrier** (`cargo: readonly Unit[]`) and are
  removed from `state.units` — they do not stay in the array behind a
  `carriedBy` flag. Nesting keeps every existing scan (`unitAt`,
  `inEnemyZoc`, `attackableFrom`, `legalActions`, `checkResult`, the AI's
  enemy list, the renderer) correct by construction rather than by remembering
  to filter in seven places. It also preserves the passenger's `Unit` object
  intact, so unloading restores its original id — which sidesteps the runtime
  `UnitId` minting problem that rules out splitting a merged unit
  (SPEC.md §3.7).
- **Capacity counts `stack`, not bodies.** A `stack: 2` infantry occupies two
  slots, or merging becomes a way to smuggle a doubled unit aboard.

Still to build when cargo lands: an unload action (it targets a *tile*, so it
needs its own `UiState` variant and its own panel button, plus a rule for
whose turn it spends), and AI handling — an AI that loads but never unloads
strands its own army at sea, which is the same failure family as the
Chebyshev-seek problem in phase 1.
