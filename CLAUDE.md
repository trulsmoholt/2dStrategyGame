# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A minimal 2D turn-based tactics game (5v5, fixed 16×16 grid, player vs. a
greedy AI). TypeScript + Vite + Vitest, zero runtime dependencies. The full
design is specified in [SPEC.md](SPEC.md), and planned-but-unbuilt work in
[ROADMAP.md](ROADMAP.md) — read SPEC.md before making design decisions; this
file only covers what it doesn't (commands, and architecture facts that span
files). [ABSTRACT.md](ABSTRACT.md) maps the four documents to each other and
states which one new documentation belongs in.

## Commands

```bash
npm test              # vitest run — full suite, single pass
npx vitest run <path>  # run one test file, e.g. src/sim/__tests__/combat.test.ts
npx vitest             # watch mode
npx tsc --noEmit       # typecheck only (build script also runs this)
npm run dev             # start the Vite dev server (manual browser playthrough)
npm run build           # tsc && vite build
```

There is no separate lint command. `noUnusedLocals`, `noUnusedParameters`,
`noImplicitReturns`, and `noUncheckedIndexedAccess` are all on in
`tsconfig.json`, so `tsc --noEmit` is the main static check.

## Architecture

Three layers with a **one-way, enforced dependency rule**:

```
src/sim/     pure, deterministic, zero rendering imports
src/ai/      imports only src/sim/index.ts
src/render/  imports only src/sim/index.ts and src/ai/ai.ts
```

`src/sim/index.ts` is the *only* module outside `src/sim/` is allowed to
import from — it's the public barrel; submodules like `src/sim/movement.ts`
are not meant to be imported directly from `ai/` or `render/`. This is
checked by an import-boundary test (`src/sim/__tests__/import-boundary.test.ts`,
`src/ai/__tests__/import-boundary.test.ts`) that greps source files for
disallowed import specifiers — it deliberately skips `__tests__/` directories,
since test code (e.g. `src/sim/__tests__/selfplay.test.ts`) is allowed to
reach into `src/ai` to drive self-play; only production code is boundary-checked.

**Everything in `src/sim/` is pure and immutable.** `GameState` is never
mutated — every function (`reduce`, `resolveAttack`, etc.) returns a new
object. The PRNG (`src/sim/rng.ts`, xorshift32) lives as a plain `number`
field on `GameState` (`state.rng`) rather than as external mutable state, so
the whole game is a pure function of `(seed, action log)`. This is what makes
`replay(seed, log)` in `src/sim/game.ts` able to deep-equal a live game's
final state — see `src/sim/__tests__/selfplay.test.ts` for the determinism
proof across 100 seeds.

**`src/ai/ai.ts` never merges**, by measurement rather than oversight — every
heuristic tried cost it ~15 points of win rate on `MAP_STANDARD`, because
merging's cost is immediate and its payoff is positional. SPEC.md §4 has the
numbers, and ROADMAP.md the condition to re-test under (a map with
chokepoints). Don't add one back without re-running that comparison.

**`src/ai/ai.ts` never rolls randomness.** It scores actions with
`expectedDamage` (deterministic, = unit power) instead of the real dice roll,
so `chooseTurn`/`chooseAction` are pure functions of `state` that never
advance `state.rng`. There are two entry points for different callers:
- `chooseAction(state)` decides one unit's action against the *real* current
  state — this is what `playOut` in `src/sim/game.ts` uses, so every decision
  reacts to actual (post-RNG) HP.
- `chooseTurn(state)` precomputes a whole turn's worth of actions up front
  using an internal RNG-free "expected outcome" simulation to sequence
  decisions between units, then hands the caller an `Action[]` to feed
  through the real `reduce` one at a time (this is what the renderer uses to
  animate a turn). Because it's based on expected, not actual, combat
  outcomes, it can in principle diverge from what actually happens once real
  rolls are applied — see the code comments in `ai.ts` if debugging an
  illegal-action error during an AI turn.

**Movement is Dijkstra over per-tile terrain cost, not plain BFS.**
`reachableTiles` in `src/sim/movement.ts` uses Dial's algorithm (a bucket
queue indexed by exact integer cost, not a binary heap — costs are always
small positive integers, so a heap would be pure ceremony). Cost and
passability both come from `terrainCost(terrain, domain)` in `src/sim/map.ts`
(`Infinity` = impassable), keyed by the mover's `UnitStats.domain` — today
only `'land'` is exercised by a real unit. `plain`/`wall` behave exactly as
before (cost 1 / impassable); `rough` (cost 2) and `water` (impassable to
`land`) are parsed for real by `parseTerrain` (`src/sim/map.ts`), but no
production map places them yet — `MAP_STANDARD` is still `.`/`#` only.

**Movement's zone-of-control rule has one sharp edge**: a tile adjacent to a
living enemy is added to `reachableTiles`'s result but not expanded
further — except the unit's own starting tile, which is always expanded even
if it's already in a ZoC. This asymmetry (the `isStart` check, evaluated when
a tile is settled/finalized in the bucket queue) is the most likely place to
introduce a movement bug; there's a dedicated test for it in
`movement.test.ts`.

**Combat resolution order is what prevents simultaneous death**: in
`src/sim/combat.ts`, `resolveAttack` rolls and applies attacker damage first,
and only rolls a counter if the defender is *still alive* and the attacker is
within the defender's range. This consumes 1 RNG advance on a lethal hit, 2
on a countered one — tested explicitly in `combat.test.ts`.

**`UNIT_STATS` in `src/sim/units.ts` is the single extension point for unit
types.** Any code that branches on `UnitTypeId` outside that file is
considered a bug (per SPEC.md §3.3) — stats should be looked up, not
switched on. That now includes *comparing* two units' types: use
`mergeKind(a, b)` rather than `a.type === b.type`, so cargo (ROADMAP.md)
can extend the dispatch in one place.

**Merging means two stats are per-unit, not per-type.** A merged unit carries
`stack > 1` (SPEC.md §3.7), and `maxHp` and `power` scale with it. Read them
via `unitMaxHp(u)` / `unitPower(u)` from `units.ts`; reaching for
`UNIT_STATS[u.type].maxHp` or `.power` silently ignores `stack` and is a bug.
`mp`, `range` and `glyph` are unaffected by merging and are still read
straight from the table — which is exactly why merging is restricted to a
single unit type and `movement.ts` and `actions.ts` needed no changes.
`expectedDamage` already funnels through `unitPower`, so `src/ai/` gets the
scaling for free and never reads either stat directly.

**`src/render/` has its own [CLAUDE.md](src/render/CLAUDE.md)** for
renderer-internal gotchas (event wiring, dimming/flash rules, draw order, the
action panel, the `reachable` field `UiState` carries). SPEC.md §5 keeps only
the decisions that constrain the renderer. The directory file is loaded
automatically when working there; this file sticks to facts that span
layers.

## Status

`src/sim/`, `src/ai/`, and `src/render/` are all implemented and tested
(`npm test` covers all three, including a 100-seed headless self-play proof
and a canvas smoke test using a fake 2D context — no jsdom dependency). The
full SPEC.md §8 verification has passed: `npm test` is green, and the
8-point manual browser playthrough has been run against `npm run dev`
end-to-end (selection/highlighting, melee trade, ranged no-counter attack,
Escape-to-cancel, AI turn stepping, a loss banner, and New Game reseeding
onto the same map). A win and a draw banner were exercised only via
`canvas.test.ts`'s unit test, not manually in-browser.

**Merging (SPEC.md §3.7) is built** — the first piece of the ROADMAP.md work.
Two adjacent same-type friendly units combine into one with summed HP and
`stack`, scaling maxHp and power. It is the answer to concentration of force *instead of*
stacking, so the one-unit-per-tile invariant that `unitAt`, `reachableTiles`
occupancy and ZoC all rely on stays intact. The player drives it from the
HTML action panel; the AI does not use it (see above).

`src/render/replay.ts` adds game export/import: `main.ts` tracks the current
game's seed and action log, `Export` serializes them to a textarea as JSON,
and `Import` parses/validates pasted JSON and calls the existing
`replay(seed, log)` (`src/sim/game.ts`) to jump straight to that
reconstructed state and resume live play from there — see
[src/render/CLAUDE.md](src/render/CLAUDE.md) for the validation/error-display
details.

**ROADMAP.md's map-format work (terrain/roster split, map registry) is
built.** `parseMap` is gone, replaced by
three functions in `src/sim/map.ts`: `parseTerrain(ascii)` builds a `GameMap`
from terrain characters only (no unit glyphs), `buildRoster(roster)` builds
the initial `Unit[]` from a structured `RosterEntry[]`, and `loadMap(def)`
combines the two and validates every unit starts in bounds on passable
terrain. Maps are looked up by id through `getMapDef` in `src/sim/maps.ts`,
which throws on an unknown id; `newGame`/`replay` take an optional `mapId`
(`src/sim/game.ts`), defaulting to `MAP_STANDARD_ID`. Only `standard` is
registered — this phase built the loading mechanism, not a second map or any
map-select UI, both of which stay ROADMAP.md work.
