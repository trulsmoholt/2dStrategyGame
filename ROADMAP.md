# ROADMAP — Northern Norway

Planned work. [SPEC.md](SPEC.md) describes the game as it is built today and
never depends on anything here; when a phase lands, its rules move into
SPEC.md and its entry disappears from this file.

Goal: a larger, geographically-inspired map with water, and unit types that
use it (ships, planes). Every phase ends with a green `npm test` and a
playable game; the currently-shipped map stays playable throughout.

## Phase order

| # | Change |
| --- | --- |
| 1 | Map format: terrain layer separate from the unit roster; multiple maps |
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

Path-distance AI seek and the Northern Norway map are also built, together,
as the ordering constraint below required. `src/ai/ai.ts`'s seek phase now
minimises a Dijkstra distance field over passable terrain (`distanceField`,
SPEC.md §3.5) instead of Chebyshev distance, and `newGame` plays
`MAP_NORTHERN_NORWAY` (SPEC.md §3.4), a 20×16 map whose water strait ends
the old map's 180°-rotational symmetry. The self-play fairness assertion
(SPEC.md §8) is now a win-rate band rather than a presence check, as this
landing anticipated.

**Re-test the AI merge heuristic — now unblocked, not yet done.**
`MAP_NORTHERN_NORWAY`'s row 11 is a one-tile-tall causeway: SPEC.md §4 has
the measurements showing every merge heuristic tried on the old open map
cost ~15 points of win rate, because merging forfeits an attack every turn
plus a body's worth of zone of control — but at a chokepoint the second unit
often can't attack anyway and its ZoC is redundant, so merging may cost
nothing there. This wasn't re-tested as part of landing the map (out of
scope for that change); `applyExpected` in `ai.ts` already handles the
`merge` action, so only `chooseUnitAction` needs to change to try it.

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
strands its own army at sea, which is the same failure family the old
Chebyshev-seek bug was: a unit "closest" to its goal with no legal way to
actually get there.
