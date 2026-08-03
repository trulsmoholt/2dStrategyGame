# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A minimal 2D turn-based tactics game (5v5, fixed 16×16 grid, player vs. a
greedy AI). TypeScript + Vite + Vitest, zero runtime dependencies. The full
design is specified in [SPEC.md](SPEC.md) — read it before making design
decisions; this file only covers what SPEC.md doesn't (commands, and
architecture facts that span files).

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

**Movement's zone-of-control rule has one sharp edge**: in
`src/sim/movement.ts`, a tile adjacent to a living enemy is added to
`reachableTiles`'s result but not expanded further — except the unit's own
starting tile, which is always expanded even if it's already in a ZoC. This
asymmetry (`isStart` check in the BFS) is the most likely place to introduce
a movement bug; there's a dedicated test for it in `movement.test.ts`.

**Combat resolution order is what prevents simultaneous death**: in
`src/sim/combat.ts`, `resolveAttack` rolls and applies attacker damage first,
and only rolls a counter if the defender is *still alive* and the attacker is
within the defender's range. This consumes 1 RNG advance on a lethal hit, 2
on a countered one — tested explicitly in `combat.test.ts`.

**`UNIT_STATS` in `src/sim/units.ts` is the single extension point for unit
types.** Any code that branches on `UnitTypeId` outside that file is
considered a bug (per SPEC.md §3.3) — stats should be looked up, not
switched on.

**`src/render/ui.ts`'s `UiState.aiming` carries a `reachable` field that
SPEC.md's snippet omits.** `onCancel(ui)` takes only a `UiState`, no
`GameState`, so stepping `aiming → selected` needs the reachable set
available on the state itself rather than recomputed from the sim.

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
