# SPEC — Minimal 2D Turn-Based Strategy Game

Status: design complete, implementation not started.
Stack: TypeScript + Vite + Vitest. No runtime dependencies.

---

## 1. Design summary

A 5v5 tactical skirmish on a fixed 16×16 grid. You play Player 0 against a
greedy AI. Units move and attack once per turn; last army standing wins.

| Decision | Choice |
| --- | --- |
| Win condition | Eliminate all enemy units |
| Stalemate rule | Hard cap at turn 50 → **Draw** (no HP tiebreak) |
| Turn model | Each unit: move, then optionally attack, once per turn |
| Combat | Seeded RNG damage roll, minimum 1 damage |
| Counterattack | Only if the defender survives and the attacker is in the defender's range |
| Randomness | PRNG state is a field in `GameState`, advanced purely |
| Stacking | One unit per tile |
| Zone of control | Entering a tile adjacent to an enemy halts movement — no exceptions |
| Geometry | 8-way movement, Chebyshev distance, diagonals always legal |
| Roster | 2 unit types, 2 terrain types (data-driven, designed to grow) |
| Map | One hardcoded 16×16 ASCII map, 180°-rotationally symmetric |
| AI | Two-phase per unit: fight if a target is reachable, else seek |
| Input | Click unit → click destination → click target |
| Renderer | Canvas 2D, full redraw, AI actions stepped ~400 ms apart |
| Art | Rectangles, HP bars, hit flash. Zero assets. |
| Verification | 100-seed headless self-play + one manual browser playthrough |

### Consequences you accepted, stated plainly

- **8-way ZoC covers 8 tiles.** A single unit locks down a 3×3 area. Front
  lines will be very sticky, and a ranged unit (2 MP) that gets into contact
  effectively has 1 MP until the enemy dies. This is the intended cost of
  the choice; if it plays badly, the tuning lever is ranged MP, not the rule.
- **Diagonals are porous at corners.** A 1-tile-thick wall does not seal.
  Every wall on the shipped map is therefore ≥2 tiles thick.
- **Draw-only turn cap.** A side that is ahead on HP at turn 50 gets nothing.
  The AI seek phase exists specifically so this is a backstop, not a routine
  outcome; the self-play test asserts draws are rare.

---

## 2. File layout

```
index.html
package.json
tsconfig.json
vite.config.ts
SPEC.md

src/sim/            pure, deterministic, zero rendering imports
  types.ts          all shared types and constants
  rng.ts            xorshift32 PRNG, pure
  units.ts          unit stat table (the extension point for new types)
  maps.ts           MAP_STANDARD ASCII literal
  map.ts            parseMap, terrain queries
  movement.ts       reachableTiles (BFS + ZoC)
  combat.ts         resolveAttack, expectedDamage
  actions.ts        legalActions, attackableFrom
  reduce.ts         reduce(state, action) -> GameState
  game.ts           newGame, checkResult, playOut, replay
  index.ts          public barrel — the ONLY module src/render may import

src/ai/
  ai.ts             chooseTurn(state): Action[]   — pure, imports only src/sim

src/render/         reads state, never mutates it
  canvas.ts         draw(ctx, state, view)
  ui.ts             UiState selection machine + hit-testing
  main.ts           bootstrap, event wiring, AI turn stepping

src/sim/__tests__/
  rng.test.ts
  movement.test.ts
  combat.test.ts
  reduce.test.ts
  selfplay.test.ts  the end-to-end sim proof
```

**Dependency rule (enforced by review, and by a test):** nothing under
`src/sim/` may import from `src/render/` or `src/ai/`. `src/ai/` imports only
`src/sim/index.ts`. `src/render/` imports only `src/sim/index.ts` and
`src/ai/ai.ts`.

`src/ai/` is deliberately outside `src/sim/` — it is pure and deterministic,
but it is a *policy*, not a rule of the game, and the sim must never depend
on it.

---

## 3. Sim interfaces

### 3.1 `src/sim/types.ts`

```ts
export type Player = 0 | 1;
export type UnitId = number;
export type UnitTypeId = 'melee' | 'ranged';
export type Terrain = 'plain' | 'wall';

export interface Pos { readonly x: number; readonly y: number }

export interface Unit {
  readonly id: UnitId;
  readonly owner: Player;
  readonly type: UnitTypeId;
  readonly pos: Pos;
  readonly hp: number;
  readonly hasActed: boolean;
}

export interface GameMap {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly Terrain[];   // row-major, length width*height
}

export type GameResult = 'p0' | 'p1' | 'draw';

export interface GameState {
  readonly map: GameMap;
  readonly units: readonly Unit[];      // dead units are REMOVED, not flagged
  readonly current: Player;
  readonly turn: number;                // starts at 1, +1 when P1 ends turn
  readonly rng: number;                 // uint32, never 0
  readonly result: GameResult | null;   // null while playing
}

export type Action =
  | { readonly t: 'act'; readonly unitId: UnitId; readonly to: Pos;
      readonly targetId?: UnitId }
  | { readonly t: 'wait'; readonly unitId: UnitId }
  | { readonly t: 'endTurn' };

export const MAX_TURNS = 50;
export const MIN_DAMAGE = 1;
export const DAMAGE_ROLL_MIN = -1;   // inclusive
export const DAMAGE_ROLL_MAX = 1;    // inclusive
```

`GameState` is treated as immutable throughout. Every sim function returns a
new object; none mutates its input. Dead units are removed from `units`
rather than kept with `hp: 0`, so `units.filter(u => u.owner === p).length`
is the authoritative liveness check.

### 3.2 `src/sim/rng.ts`

```ts
export type Rng = number;                       // uint32, never 0

export function seedRng(seed: number): Rng;     // maps any int to a legal state
export function nextRng(s: Rng): [value: number, next: Rng];   // value in [0,1)
export function rollInt(s: Rng, min: number, max: number): [n: number, next: Rng];
```

xorshift32. No module-level mutable state, no `Math.random` anywhere in
`src/sim/` or `src/ai/`. `seedRng` must never return 0 (xorshift32 has 0 as a
fixed point) — map 0 to a constant.

### 3.3 `src/sim/units.ts`

```ts
export interface UnitStats {
  readonly maxHp: number;
  readonly power: number;
  readonly mp: number;       // movement points (tiles, 8-way, uniform cost)
  readonly range: number;    // Chebyshev attack range
  readonly glyph: string;    // renderer hint only
}

export const UNIT_STATS: Record<UnitTypeId, UnitStats> = {
  melee:  { maxHp: 10, power: 4, mp: 3, range: 1, glyph: 'M' },
  ranged: { maxHp:  6, power: 3, mp: 2, range: 2, glyph: 'R' },
};
```

**This table is the extension point.** Adding a third unit type must require
editing `UnitTypeId` and this record and nothing else. Any code that
`switch`es on unit type outside this file is a bug.

### 3.4 `src/sim/map.ts` and `maps.ts`

```ts
export interface ParsedMap {
  readonly map: GameMap;
  readonly units: readonly Unit[];   // ids assigned in reading order, from 0
}

export function parseMap(ascii: string): ParsedMap;
export function inBounds(map: GameMap, p: Pos): boolean;
export function terrainAt(map: GameMap, p: Pos): Terrain;
export function chebyshev(a: Pos, b: Pos): number;   // max(|dx|, |dy|)
```

ASCII legend: `.` plain, `#` wall, `m`/`r` Player 0 melee/ranged, `M`/`R`
Player 1 melee/ranged.

`MAP_STANDARD` in `maps.ts` — 16×16, 180°-rotationally symmetric, all walls
2 tiles thick:

```
..m.r...........
.m..............
m.......##......
.r......##......
........##......
....##..........
....##..........
....##..........
..........##....
..........##....
..........##....
......##........
......##......R.
......##.......M
..............M.
...........R.M..
```

`parseMap` throws on: non-rectangular input, unknown characters, or a unit
count other than 3 melee + 2 ranged per side. A malformed map is a
programming error, not a runtime condition.

### 3.5 `src/sim/movement.ts`

```ts
export function unitAt(state: GameState, p: Pos): Unit | undefined;
export function inEnemyZoc(state: GameState, p: Pos, owner: Player): boolean;
export function reachableTiles(state: GameState, unitId: UnitId): Pos[];
```

`reachableTiles` — breadth-first search, uniform cost 1 per step, 8
neighbours, depth ≤ `stats.mp`. Exact rules:

1. The unit's own tile is always in the result (a legal "move nowhere").
2. A tile may be **entered** iff it is in bounds, `terrain === 'plain'`, and
   unoccupied by any unit (friend or foe). No moving through allies.
3. Diagonal steps have no corner restriction: `canStep` depends only on the
   destination tile. Walls seal only where they are ≥2 thick.
4. **ZoC:** if a newly-entered tile is adjacent (Chebyshev 1) to a living
   enemy unit, it is added to the result but **not expanded** — the unit
   stops there. It is marked *terminal*, not *impassable*; this distinction
   is the single most likely bug in the file and has a dedicated test.
5. The **start tile is always expanded**, even when it is in enemy ZoC. A
   unit that begins its turn in contact can move away freely. This
   guarantees no unit is ever permanently frozen.

Returned positions are sorted `(y, x)` ascending so the AI is deterministic
without needing a stable sort.

### 3.6 `src/sim/combat.ts`

```ts
export function expectedDamage(attacker: Unit): number;   // = stats.power, no RNG
export function resolveAttack(
  state: GameState, attackerId: UnitId, defenderId: UnitId,
): GameState;
```

Resolution order — this ordering *is* the rule that makes simultaneous death
impossible:

1. Roll attacker damage: `dmg = max(MIN_DAMAGE, power + rollInt(-1, 1))`.
   Consumes one RNG advance.
2. Subtract from defender HP.
3. If defender HP ≤ 0: remove defender, **stop**. No counterattack. Consumes
   no further RNG.
4. Else if `chebyshev(defender.pos, attacker.pos) <= defenderStats.range`:
   roll counter damage the same way (second RNG advance), subtract from the
   attacker, remove the attacker if it reaches 0.

So the number of RNG advances per attack is 1 or 2, state-dependent but fully
deterministic. Melee vs melee at range 1: both counter. Ranged (range 2)
shooting melee (range 1) from distance 2: no counter — the reason to field
ranged units. Damage floor of 1 means every exchange strictly progresses; no
two units can chip each other forever.

`expectedDamage` returns `power` (the roll is symmetric, mean 0) and consumes
no randomness — the AI uses this and never advances the real RNG stream.

### 3.7 `src/sim/actions.ts`

```ts
export function attackableFrom(
  state: GameState, unitId: UnitId, from: Pos,
): UnitId[];                                  // living enemies within range of `from`
export function legalActions(state: GameState): Action[];
```

`legalActions` returns, for the current player, when `state.result === null`:

- one `{ t: 'act', unitId, to, targetId }` per (reachable destination ×
  attackable enemy from that destination), for every un-acted unit;
- one `{ t: 'act', unitId, to }` (move without attacking) per reachable
  destination, for every un-acted unit;
- one `{ t: 'wait', unitId }` per un-acted unit — always available, so a
  fully-surrounded unit never blocks turn completion;
- always exactly one `{ t: 'endTurn' }`.

**Invariant: `legalActions(state).length >= 1` whenever `result === null`.**
`endTurn` alone guarantees it. Neither the AI loop nor the UI can ever
deadlock on an empty action set. If `result !== null`, returns `[]`.

### 3.8 `src/sim/reduce.ts`

```ts
export function reduce(state: GameState, action: Action): GameState;
```

Pure. Returns a new state; throws on an illegal action (the caller is
expected to have consulted `legalActions`). Behaviour:

- `act` — validates the unit is alive, owned by `current`, and `!hasActed`;
  validates `to ∈ reachableTiles`; moves the unit; if `targetId` is present,
  validates it is in range **from `to`** and calls `resolveAttack`; sets
  `hasActed = true` on the acting unit (if it survived its own counter);
  then re-checks the result.
- `wait` — sets `hasActed = true`, nothing else.
- `endTurn` — marks every remaining unit of `current` as acted, flips
  `current`, clears `hasActed` on the incoming player's units; if the
  incoming player is 0, increments `turn`; then re-checks the result.

Move and attack are applied together in one reduction. The sim never holds a
half-finished unit turn. "I moved but haven't picked a target yet" exists
only as a preview in `src/render/ui.ts`, so cancelling is free and there is
no undo stack anywhere.

### 3.9 `src/sim/game.ts`

```ts
export function newGame(seed: number): GameState;
export function checkResult(state: GameState): GameResult | null;
export function playOut(
  state: GameState, choose: (s: GameState) => Action,
): { final: GameState; log: Action[] };
export function replay(seed: number, log: readonly Action[]): GameState;
```

`checkResult`, evaluated after every reduction:

1. P0 has no living units and P1 does → `'p1'`.
2. P1 has no living units and P0 does → `'p0'`.
3. Neither side has units (unreachable given the ordering rule in §3.6, but
   checked defensively) → `'draw'`.
4. `state.turn > MAX_TURNS` → `'draw'`.
5. Otherwise `null`.

`replay(seed, log)` folds `reduce` over the log starting from
`newGame(seed)`. Because the RNG lives in the state and every roll is derived
from it, `replay(seed, log)` must deep-equal the original final state. That
equality is the determinism test.

---

## 4. AI — `src/ai/ai.ts`

```ts
export function chooseTurn(state: GameState): Action[];  // ends with { t:'endTurn' }
export function chooseAction(state: GameState): Action;  // one step, for playOut
```

Pure function of state. No RNG, no `Math.random`, no reliance on object
iteration order. Per un-acted unit, **in ascending unit id**, two phases:

**Fight phase.** Enumerate every (destination, target) pair from
`reachableTiles` × `attackableFrom`. If non-empty, score each:

```
score =  100 * min(expectedDamage(attacker), target.hp)     // damage dealt
       + 400 * (expectedDamage(attacker) >= target.hp ? 1 : 0)   // kill bonus
       -  80 * expectedCounter(target, attacker, dest)      // 0 if the kill lands
       -   5 * (number of enemies adjacent to dest)         // don't dive
```

Take the max; break ties by lowest `(y, x)` destination, then lowest target
id. Deterministic by construction.

**Seek phase.** If no attack is possible, move to the reachable tile
minimising `min over living enemies of chebyshev(dest, enemy.pos)`. Ties
break by lowest `(y, x)`. If the best tile is the unit's current tile, emit
`{ t: 'wait' }` instead so the log stays clean.

The explicit seek branch is what prevents the "every move scores 0, the AI
stands still, everything is a Draw at turn 50" failure. It is a separate code
path, not a term in the evaluation function, so it can be tested on its own:
given a board with no unit in reach of anything, every AI unit must strictly
reduce its distance to the nearest enemy.

Scoring uses `expectedDamage`, never a roll, so `chooseTurn` never advances
`state.rng` and calling it is free of side effects on the real game.

---

## 5. Renderer — `src/render/`

The renderer reads `GameState` and never constructs or mutates one; all
changes go through `reduce`.

### 5.1 `src/render/ui.ts`

```ts
export type UiState =
  | { k: 'idle' }
  | { k: 'selected'; unitId: UnitId; reachable: Pos[] }
  | { k: 'aiming'; unitId: UnitId; dest: Pos; targets: UnitId[] }
  | { k: 'aiTurn' }
  | { k: 'over'; result: GameResult };

export function pixelToTile(px: number, py: number): Pos;
export function onTileClick(
  state: GameState, ui: UiState, tile: Pos,
): { ui: UiState; action?: Action };
export function onCancel(ui: UiState): UiState;
```

Selection flow:

- `idle` + click own un-acted unit → `selected`, with `reachableTiles`
  highlighted.
- `selected` + click a highlighted tile → if enemies are attackable from
  there, go to `aiming` (targets highlighted); otherwise emit
  `{ t: 'act', unitId, to }` immediately and return to `idle`.
- `aiming` + click a highlighted target → emit
  `{ t: 'act', unitId, to, targetId }`, back to `idle`.
- `aiming` + click elsewhere → emit the move without an attack, back to
  `idle`.
- Escape or right-click → `onCancel` steps back one level
  (`aiming` → `selected` → `idle`). Nothing has been committed to the sim, so
  cancelling discards a preview and nothing more.
- All clicks are ignored while `k === 'aiTurn'`.

`UiState` lives entirely in the renderer. The sim has no concept of selection.

### 5.2 `src/render/canvas.ts`

```ts
export interface ViewState {
  readonly ui: UiState;
  readonly flashes: readonly { unitId: UnitId; until: number }[];
}
export function draw(ctx: CanvasRenderingContext2D, state: GameState, view: ViewState): void;
```

32 px tiles, 512×512 canvas plus a status strip. Full redraw each frame — no
diffing, no dirty rects. Draw order: terrain → reachable overlay (translucent
blue) → attackable overlay (translucent red) → units → HP bars → hit flashes
→ status text (`Turn n/50 · Your move` / `AI thinking…` / result banner).

Units: filled rect in the owner's colour, `stats.glyph` centred, a 3 px HP
bar along the bottom edge (`hp / maxHp`), and a dimmed fill when `hasActed`.
Flash: a white overlay on a unit for ~180 ms after it takes damage. Flash
timers are transient view state and never enter `GameState`.

### 5.3 `src/render/main.ts`

Owns the single mutable `let state: GameState` and drives the loop:

```ts
async function runAiTurn() {
  ui = { k: 'aiTurn' };
  for (const action of chooseTurn(state)) {
    state = reduce(state, action);
    draw(ctx, state, view);
    await sleep(400);
    if (state.result) break;
  }
  ui = state.result ? { k: 'over', result: state.result } : { k: 'idle' };
}
```

Input is locked for the whole of `runAiTurn` by the `aiTurn` UI state. A
"New game" button calls `newGame(Date.now() >>> 0)` — the only place a
nondeterministic value enters the system, and it enters as a seed.

---

## 6. Explicitly out of scope

Not in this version. Listed so they are decisions, not omissions:

- Terrain effects of any kind — no movement cost, no defence bonus. `wall` is
  purely impassable. Movement is uniform cost, so BFS never needs to become
  Dijkstra.
- Any third unit type, unit abilities, items, upgrades, veterancy, or healing.
- Multiple maps, a map-select screen, or procedural generation.
- Fog of war and any form of hidden information. Both players see everything;
  `GameState` has no per-player view.
- Undo, redo, save/load, or a persisted replay format. `{ seed, log }` is
  sufficient to reconstruct any game, but nothing writes it to disk.
- Human-vs-human hot seat, and networked play.
- Movement tweening, attack animations, sound, particles, camera or zoom.
- Sprites or any loaded asset. The renderer must have no async init.
- Difficulty levels, and any AI deeper than one ply. No minimax, no
  expectimax, no lookahead across units.
- HP tiebreak at the turn cap — turn 50 is a Draw, full stop.
- Mobile/touch input, accessibility affordances, i18n.
- Any runtime npm dependency. Vite, TypeScript and Vitest are dev-only.

---

## 7. Test plan

Unit tests (`src/sim/__tests__/`):

- `rng.test.ts` — `seedRng` never yields 0; the same seed yields the same
  sequence; `rollInt` covers exactly `[min, max]` inclusive over many draws.
- `movement.test.ts` — on hand-written tiny maps: walls block; occupied tiles
  block; ZoC tiles are **entered but not expanded**; a unit starting in ZoC
  can still move its full MP away; a diagonal gap between two wall corners is
  passable; a 2-thick wall is not; `reachableTiles` is sorted.
- `combat.test.ts` — damage never below 1; a dead defender never counters; a
  range-2 attacker hitting a range-1 defender from distance 2 takes no
  counter; melee at range 1 trade both ways; the RNG advances exactly once on
  a lethal hit and exactly twice on a countered one.
- `reduce.test.ts` — illegal actions throw; `hasActed` blocks a second
  action; `endTurn` resets flags and flips `current`; `turn` increments only
  when play returns to Player 0; eliminating the last enemy unit sets
  `result` in the same reduction.
- An import-boundary test asserting no file under `src/sim/` contains an
  import from `src/render` or `src/ai`.

---

## 8. End-to-end verification

Two steps. The build is not done until both pass.

### Step 1 — headless self-play (`src/sim/__tests__/selfplay.test.ts`)

```ts
for (let seed = 0; seed < 100; seed++) {
  const { final, log } = playOut(newGame(seed), chooseAction);

  expect(final.result).not.toBeNull();          // every game terminates
  expect(final.turn).toBeLessThanOrEqual(MAX_TURNS + 1);
  expect(replay(seed, log)).toEqual(final);     // seed + log reproduces exactly
  expect(log.length).toBeGreaterThan(10);       // not a degenerate instant end

  // invariants held at the end
  expect(new Set(final.units.map(u => `${u.pos.x},${u.pos.y}`)).size)
    .toBe(final.units.length);                  // never two units on a tile
  for (const u of final.units) {
    expect(u.hp).toBeGreaterThan(0);            // dead units are removed
    expect(terrainAt(final.map, u.pos)).toBe('plain');
  }
}
```

Plus, across those 100 games:

- **Draws are rare:** at most 10 of 100 end in `'draw'`. This is the real
  test of the AI seek phase — if seeking is broken, armies never meet and
  this assertion fails loudly rather than the game merely feeling dull.
- **Both sides can win:** `'p0'` and `'p1'` each appear at least once, so the
  map and the AI are not trivially biased.
- **Determinism under re-run:** `playOut(newGame(seed), chooseAction)` run
  twice for the same seed produces identical logs — proving `chooseTurn` is
  pure and consumes no randomness.

Run with:

```bash
npm test
```

### Step 2 — manual browser playthrough

```bash
npm run dev
```

Then, in one sitting, confirm all of the following:

1. The board renders: 16×16 grid, two 2-thick wall clusters, 5 blue units
   bottom-left, 5 red top-right, HP bars visible.
2. Click a melee unit → its reachable tiles highlight, and the highlight
   **stops** at tiles adjacent to a red unit rather than flowing past them.
3. Move that unit adjacent to a red unit, then click the red unit → both take
   damage, both flash, both HP bars drop.
4. Move a ranged unit to exactly distance 2 from a red melee unit and shoot →
   the target loses HP and the shooter takes **none**.
5. Press Escape mid-selection → the highlight clears and nothing has changed
   on the board.
6. Click "End turn" → the AI's units move one at a time, roughly 0.4 s apart,
   and clicks are ignored while it does.
7. Play to the end: every red unit dies and a "You win" banner appears — or
   you lose, or turn 50 arrives and a "Draw" banner appears. All three
   endings must render; force the draw case by refusing to engage if needed.
8. Reload and play again: the opening position is identical (fixed map) but
   damage numbers differ (new seed).

The game is complete when `npm test` is green and all eight browser checks
pass.
