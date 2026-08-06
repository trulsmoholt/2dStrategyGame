# ROADMAP — Northern Norway

Planned work. [SPEC.md](SPEC.md) describes the game as it is built today and
never depends on anything here; when a phase lands, its rules move into
SPEC.md and this file's entry gets checked off, not deleted — the reasoning
behind a phase's ordering can still matter to the phases after it.

Goal: a larger, geographically-inspired map with water, and unit types that
use it (ships, planes). Every phase ends with a green `npm test` and a
playable game; the currently-shipped map stays playable throughout.

## Status

- [x] **Merging** (SPEC.md §3.7). Independent of every phase below — landed
      first for that reason.
- [x] **Renderer derives board size from `state.map`** instead of a
      hardcoded 16. A prerequisite for phase 1's multiple maps; landed ahead
      of it as its own change.
- [x] **Terrain cost table and movement domains** (land/sea/air) —
      originally phase 1's table. `reachableTiles` (SPEC.md §3.5) is now
      Dijkstra over per-tile cost via a bucket queue; `UnitStats` carries
      `domain`. Independent of phase 2's AI/map work, so it landed first —
      ships and planes are now unblocked (stat-table rows plus a `domain`,
      not hardcoded special cases).
- [x] **Phase 1** — Map format: terrain layer separate from the unit roster;
      multiple maps. `parseMap` is gone; `src/sim/map.ts` now has
      `parseTerrain`, `buildRoster`, and `loadMap`, and `src/sim/maps.ts` is
      a registry (`getMapDef`) that `newGame`/`replay` look up by an
      optional `mapId`. Only `standard` was registered — this landed the
      mechanism multiple maps need, not a second map's content.
- [x] **Phase 2** — Path-distance AI seek **and** the Northern Norway map,
      together. `src/ai/ai.ts`'s seek phase now minimises a Dijkstra
      distance field over passable terrain (`distanceField`, SPEC.md §3.5)
      instead of Chebyshev distance, and `newGame`/`replay` default to
      `MAP_NORTHERN_NORWAY` (SPEC.md §3.4, id `'northern-norway'`,
      registered alongside `'standard'`) — a 20×16 map whose water strait
      ends the old map's 180°-rotational symmetry. The self-play fairness
      assertion (SPEC.md §8) is now a win-rate band rather than a presence
      check, as this landing anticipated. See below for why it had to land
      as one change, not two.
- [ ] **Phase 3** — Ship and plane unit types; cargo — see below.
- [ ] **Phase 4** — Victory conditions and turn-cap retune.

## Phase 2 — why it couldn't split

The seek phase in `ai.ts` minimised Chebyshev distance to the nearest enemy
(SPEC.md §4). On a coastline that walks land units to the shore and strands
them opposite an enemy they can never path to — every game becomes a
turn-cap draw. The seek phase had to move to a Dijkstra distance field over
passable terrain in the same change that introduced the map; landing the
map first, or the seek fix first, would each have shipped a broken
intermediate state. That's why the entry above is one checkbox, not two.

Phase 2 also ended the map's 180°-rotational symmetry, which is what used
to make "both sides win at least once" (SPEC.md §8) a meaningful fairness
check. Balance now comes from asymmetric rosters (phase 3+), not this map's
terrain; the self-play assertion is a win-rate band instead.

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

Loading an infantry onto a ship is the same player-facing verb as merging,
and reuses the same action and the same UI panel, but has a different
effect: it sets cargo on the carrier instead of scaling its stack.
`mergeKind` gains a `'load'` result and `UnitStats` gains a `capacity`
column; `reduce` grows one branch. Nothing already built changes.

Two decisions are recorded now so the later change stays additive:

- **Passengers nest inside the carrier** (`cargo: readonly Unit[]`) and are
  removed from `state.units` — they do not stay in the array behind a
  `carriedBy` flag. Nesting keeps every existing scan (`unitAt`,
  `inEnemyZoc`, `attackableFrom`, `legalActions`, `checkResult`, the AI's
  enemy list, the renderer) correct by construction rather than by
  remembering to filter in seven places. It also preserves the passenger's
  `Unit` object intact, so unloading restores its original id — which
  sidesteps the runtime `UnitId` minting problem that rules out splitting a
  merged unit (SPEC.md §3.7).
- **Capacity counts `stack`, not bodies.** A `stack: 2` infantry occupies two
  slots, or merging becomes a way to smuggle a doubled unit aboard.

Still to build when cargo lands: an unload action (it targets a *tile*, so
it needs its own `UiState` variant and its own panel button, plus a rule for
whose turn it spends), and AI handling — an AI that loads but never unloads
strands its own army at sea, which is the same failure family the old
Chebyshev-seek bug was: a unit "closest" to its goal with no legal way to
actually get there.
