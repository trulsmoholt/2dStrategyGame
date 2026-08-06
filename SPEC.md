# SPEC — Minimal 2D Turn-Based Strategy Game

Stack: TypeScript + Vite + Vitest. No runtime dependencies.

This document describes the game as it is built today. Work that is planned
but not built lives in [ROADMAP.md](ROADMAP.md); nothing here is conditional
on it.

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
| Stacking | One unit per tile — concentration of force is via merging (§3.7) |
| Zone of control | Entering a tile adjacent to an enemy halts movement — no exceptions |
| Geometry | 8-way movement, Chebyshev distance, diagonals always legal |
| Roster | 2 unit types, 2 terrain types (data-driven, designed to grow) |
| Map | One playable map, loaded by id through a registry (`getMapDef`); 16×16, 180°-rotationally symmetric |
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

## 2. Layer boundaries

```
src/sim/     pure, deterministic, zero rendering imports
src/ai/      imports only src/sim/index.ts
src/render/  reads state, never mutates it
```

**Dependency rule (enforced by review, and by a test):** nothing under
`src/sim/` may import from `src/render/` or `src/ai/`. `src/ai/` imports only
`src/sim/index.ts`. `src/render/` imports only `src/sim/index.ts` and
`src/ai/ai.ts`.

`src/ai/` is deliberately outside `src/sim/` — it is pure and deterministic,
but it is a *policy*, not a rule of the game, and the sim must never depend
on it.

---

## 3. Sim rules

The types live in `src/sim/types.ts` and the signatures in the file each
subsection names; neither is restated here. What follows is the part the code
cannot tell you — why each rule is the way it is, and what breaks if it
changes.

### 3.1 State

`GameState` is `{ map, units, current, turn, rng, result }` and is treated as
immutable throughout: every sim function returns a new object and none mutates
its input. Two consequences worth stating outright:

- **Dead units are removed from `units`, not kept with `hp: 0`**, so
  `units.filter(u => u.owner === p).length` is the authoritative liveness
  check.
- **The PRNG state is a field on `GameState`**, not external mutable state.
  This is what makes the whole game a pure function of `(seed, action log)`
  and lets `replay` deep-equal a live game (§3.10).

`Action` has four variants — `act` (move, with an optional target), `wait`,
`merge` (§3.7), and `endTurn`.

### 3.2 Randomness — `src/sim/rng.ts`

xorshift32. No module-level mutable state, no `Math.random` anywhere in
`src/sim/` or `src/ai/`. `seedRng` must never return 0 (xorshift32 has 0 as a
fixed point) — map 0 to a constant.

### 3.3 Unit stats — `src/sim/units.ts`

```ts
melee:  { maxHp: 10, power: 4, mp: 3, range: 1, domain: 'land' }
ranged: { maxHp:  6, power: 3, mp: 2, range: 2, domain: 'land' }
```

**This table is the extension point.** Adding a third unit type must require
editing `UnitTypeId` and this record and nothing else. Any code that
`switch`es on unit type outside this file is a bug.

`domain` selects which row of `terrainCost` (§3.5) governs the unit's
movement. Like `mp`, `range` and `glyph`, it's read straight from the table
and unaffected by merging (§3.7). Both unit types are `'land'` today; `'sea'`
and `'air'` exist in the `Domain` type for ROADMAP.md's ship/plane phase but
have no unit yet.

`units.ts` also owns the three merge-aware helpers of §3.7 — `unitMaxHp`,
`unitPower`, and `mergeKind`. Reading `UNIT_STATS[u.type].power` or `.maxHp`
for a *unit* anywhere else is a bug for the same reason: it silently ignores
`stack`.

### 3.4 Maps — `src/sim/map.ts` and `maps.ts`

A map is a `MapDef` (`src/sim/types.ts`): `{ id, terrain, roster }`. Terrain
and the initial unit roster are independent inputs — the same terrain grid
could in principle back more than one roster — rather than one ASCII grid
encoding both.

`parseTerrain(ascii)` builds a `GameMap` from terrain characters only. ASCII
legend: `.` plain, `#` wall, `~` rough, `w` water. Throws on non-rectangular
input or an unknown character.

`buildRoster(roster: readonly RosterEntry[])` builds the initial `Unit[]`,
assigning ids in **array order** from 0. `RosterEntry` is
`{ type, owner, pos }`. Throws if either side does not have exactly 3 melee +
2 ranged, or if two entries share a start position.

`loadMap(def: MapDef): ParsedMap` combines the two and is the function a game
actually calls: it parses `def.terrain`, builds `def.roster`, then validates
every unit starts in bounds and on terrain passable for its `domain` —
throwing otherwise. A glyph-based grid got both guarantees for free (a glyph
set its own tile to `plain`); splitting terrain from the roster means
`loadMap` has to check them explicitly.

Maps are looked up by id through a small registry in `maps.ts`:
`getMapDef(id: MapId): MapDef` throws `getMapDef: unknown map id '${id}'` if
`id` isn't registered. `MAP_STANDARD_ID` (`'standard'`) is the only
registered id today; `MAP_STANDARD` is its `MapDef` — 16×16,
180°-rotationally symmetric, all walls 2 tiles thick:

```
................
................
........##......
........##......
........##......
....##..........
....##..........
....##..........
..........##....
..........##....
..........##....
......##........
......##........
......##........
................
................
```

(its roster places the same 5v5 starting positions as before, just as
`RosterEntry` data rather than glyphs on this grid.)

`newGame(seed, mapId = MAP_STANDARD_ID)` and `replay(seed, log, mapId = ...)`
call `loadMap(getMapDef(mapId))`. An unknown `mapId` throws — a malformed or
missing map is a programming error, not a runtime condition.

### 3.5 Movement — `src/sim/movement.ts`

`reachableTiles` — Dijkstra over per-tile movement cost, 8 neighbours,
cumulative cost ≤ `stats.mp`. Implemented as Dial's algorithm (a bucket
queue indexed by exact integer cost) rather than a binary heap: every
terrain cost is a small positive integer and `mp` is tiny, so a heap would
be pure ceremony. Cost and passability both come from one lookup,
`terrainCost(terrain, domain)` in `src/sim/map.ts` — `Infinity` means
impassable. Exact rules:

1. The unit's own tile is always in the result, at cost 0 (a legal "move
   nowhere").
2. A tile may be **entered** iff it is in bounds, `terrainCost(terrain,
   domain)` is finite for the mover's `domain`, unoccupied by any unit
   (friend or foe), and the cumulative cost to reach it does not exceed
   `mp`. No moving through allies.
3. Diagonal steps have no corner restriction: passability depends only on
   the destination tile. Walls seal only where they are ≥2 thick.
4. **ZoC:** if a tile is adjacent (Chebyshev 1) to a living enemy unit, it
   is added to the result but **not expanded** — the unit stops there. It
   is marked *terminal*, not *impassable*; this distinction is the single
   most likely bug in the file and has a dedicated test. The check runs
   when a tile is settled (its shortest cost finalized), the same point in
   the algorithm the old breadth-first version checked it at.
5. The **start tile is always expanded**, even when it is in enemy ZoC. A
   unit that begins its turn in contact can move away freely. This
   guarantees no unit is ever permanently frozen.

Returned positions are sorted `(y, x)` ascending so the AI is deterministic
without needing a stable sort.

`Terrain` has four members: `plain` (cost 1 to `land`), `wall` (impassable
to everything built so far), `rough` (cost 2, still `land`-passable), and
`water` (impassable to `land`, passable to `sea`). `parseTerrain` (§3.4)
parses all four for real; only `plain`/`wall` appear on `MAP_STANDARD`
today — no production map places `rough`/`water` yet. `sea`/`air` domain
costs have no unit to exercise them yet; see the comment on `TERRAIN_COST` in
`map.ts` for their placeholder values.

### 3.6 Combat — `src/sim/combat.ts`

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

### 3.7 Merging

Two adjacent friendly units of the **same type** combine into one stronger
unit. This is how the game handles concentration of force without stacking:
the one-unit-per-tile invariant that `unitAt`, `reachableTiles` occupancy and
ZoC all depend on is never broken.

A unit carries `stack`, which is 1 until it is merged.
`{ t: 'merge', unitId, absorbId }` is legal iff both units are alive, both
owned by `current`, both `!hasActed`, `chebyshev === 1`, of the same `type`,
and `a.stack + b.stack <= MAX_STACK`. `unitId` survives and keeps its tile;
`absorbId` is removed. `stack` and `hp` are summed onto the survivor, which is
then marked `hasActed`. No randomness is consumed.

**Only `maxHp` and `power` scale**, through `unitMaxHp` / `unitPower` in
`units.ts`. `mp`, `range` and `glyph` are unchanged — which is precisely why
merging is restricted to a single type: there is no stat fold to define and no
ordering question, so `movement.ts` and `actions.ts` needed no changes at all.
Those two helpers are the only permitted way to read a unit's effective power
or max HP; raw `UNIT_STATS[u.type].power` or `.maxHp` silently ignores `stack`
and is a bug, for the same reason as §3.3's rule.

**Power scales, not just HP.** With HP alone, merging would halve damage
output and ZoC footprint and return nothing — two melee deal 8 damage a turn
and take 8 in counters, where an HP-only merged pair would deal 4 and take 4.
It would be a strictly dominated button. Scaling power makes it a real trade:
the merged pair deals the same 8 but takes only one counter instead of two,
paid for with half the board presence, one action per turn instead of two, and
the risk of losing everything in a single exchange.

**Consequences, accepted:**

- Merging permanently reduces your action count for the rest of the game.
  There is no split — splitting would have to mint a `UnitId` at runtime, and
  ids come from `buildRoster`'s array order (§3.4), so it would need a
  `nextId` counter on `GameState` to stay replay-deterministic.
- `checkResult` counts bodies, so an army merged down to one unit loses the
  moment that unit dies.
- `MAX_STACK = 3` exists so the endgame cannot collapse into a single
  doomstack.

**Dispatch rule.** Whether two units can combine is decided by `mergeKind` in
`units.ts`, never by a type comparison at the call site. A `UnitTypeId`
comparison outside that file is the same class of bug as a `switch` on unit
type (§3.3). This is the seam cargo grows through — see ROADMAP.md.

### 3.8 Legal actions — `src/sim/actions.ts`

`legalActions` returns, for the current player, when `state.result === null`:

- one `{ t: 'act', unitId, to, targetId }` per (reachable destination ×
  attackable enemy from that destination), for every un-acted unit;
- one `{ t: 'act', unitId, to }` (move without attacking) per reachable
  destination, for every un-acted unit;
- one `{ t: 'wait', unitId }` per un-acted unit — always available, so a
  fully-surrounded unit never blocks turn completion;
- one `{ t: 'merge', unitId, absorbId }` per un-acted unit × legal merge
  partner (§3.7). Emitted in both directions, since which unit survives is
  the player's choice and changes where the merged unit stands;
- always exactly one `{ t: 'endTurn' }`.

**Invariant: `legalActions(state).length >= 1` whenever `result === null`.**
`endTurn` alone guarantees it. Neither the AI loop nor the UI can ever
deadlock on an empty action set. If `result !== null`, returns `[]`.

### 3.9 Reduction — `src/sim/reduce.ts`

`reduce` is pure. It returns a new state and throws on an illegal action (the caller is
expected to have consulted `legalActions`). Behaviour:

- `act` — validates the unit is alive, owned by `current`, and `!hasActed`;
  validates `to ∈ reachableTiles`; moves the unit; if `targetId` is present,
  validates it is in range **from `to`** and calls `resolveAttack`; sets
  `hasActed = true` on the acting unit (if it survived its own counter);
  then re-checks the result.
- `wait` — sets `hasActed = true`, nothing else.
- `merge` — validates both units per §3.7; sums `hp` and `stack` onto
  `unitId`, removes `absorbId`, sets `hasActed = true` on the survivor.
  Consumes no randomness. Both units are spent: the absorbed one is gone, and
  the survivor has acted.
- `endTurn` — marks every remaining unit of `current` as acted, flips
  `current`, clears `hasActed` on the incoming player's units; if the
  incoming player is 0, increments `turn`; then re-checks the result.

Move and attack are applied together in one reduction. The sim never holds a
half-finished unit turn. "I moved but haven't picked a target yet" exists
only as a preview in `src/render/ui.ts`, so cancelling is free and there is
no undo stack anywhere.

### 3.10 Game lifecycle — `src/sim/game.ts`

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

`chooseTurn` precomputes a whole turn's worth of actions; `chooseAction`
decides one step against the real current state. Both are pure functions of
state. No RNG, no `Math.random`, no reliance on object
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

**The AI never merges, deliberately.** Two heuristics were tried and measured
over the same 300 seeds:

| AI | P0 wins | merges |
| --- | --- | --- |
| never merges (shipped) | 138 / 300 | 0 |
| merges below 40% HP, preferring the most damaged partner | 92 / 300 | 111 |
| …preferring the healthiest partner | 92 / 300 | 111 |

Both cost ~15 percentage points. (The two variants are identical because
adjacency + same-type + both-un-acted almost always leaves exactly one
candidate, so the preference never gets to matter.) An earlier attempt that
gated merging on "nothing to attack" fired **zero** times in 100 games: a unit
is below 40% HP precisely *because* it is in contact, so it always has an
attack available. Merging has to compete with attacking, not follow it.

This is a property of `MAP_STANDARD`, not of the mechanic. On an open board
both units in a pair can always bring their attacks to bear, so merging
forfeits an attack every turn plus a body's worth of zone of control. On a
one-tile chokepoint the second unit cannot attack anyway and its ZoC is
redundant, so merging costs nothing and the halved counterattack exposure is
pure profit. Until there is a map where merging pays, shipping a heuristic
that measurably weakens the AI is worse than shipping none — ROADMAP.md
records when to re-test. `applyExpected` already handles the action, so only
`chooseUnitAction` would need to change.

---

## 5. Renderer — `src/render/`

The renderer reads `GameState` and never constructs or mutates one; all
changes go through `reduce`. `UiState` — the selection machine in `ui.ts` —
lives entirely in the renderer; the sim has no concept of selection, so
cancelling a half-made move discards a preview and nothing more, and there is
no undo stack anywhere.

The decisions that constrain it:

- **Full redraw every frame.** No diffing, no dirty rects, so `draw` must stay
  cheap. Transient view state (hit-flash timers) lives beside `GameState`,
  never inside it.
- **No assets and no async init** (§6), so the renderer can be constructed
  synchronously and tested against a fake 2D context.
- **Input is locked for the whole of the AI turn** by the `aiTurn` UI state.
  Every input path checks it identically.
- **AI actions are stepped ~400 ms apart** so a turn is legible rather than
  instantaneous.
- **The board click is the only game input; the action panel is the
  exception.** Move needs no mode — clicking a destination is the move — and
  attack follows from it automatically when an enemy is in range of the chosen
  tile. Merging is the one action that cannot be inferred from a board click,
  so it is the one button on the panel. The panel is HTML rather than
  canvas-drawn, because the canvas click handler turns every click into a tile
  coordinate and a drawn panel would need region hit-testing ahead of it.
- **`newGame(Date.now() >>> 0)` is the only place a nondeterministic value
  enters the system**, and it enters as a seed.

Renderer-internal detail — event wiring, draw order, dimming and flash rules,
the `reachable` field `UiState` carries that this section doesn't mention — is
documented in [src/render/CLAUDE.md](src/render/CLAUDE.md), next to the code
it constrains.

---

## 6. Explicitly out of scope

Not in this version. Listed so they are decisions, not omissions. Entries
marked **→ ROADMAP** are scheduled to be reclaimed and are no longer permanent
decisions:

- Terrain defence bonuses. Movement cost and domain restriction are built
  (§3.5); no terrain grants a combat bonus, and `wall` remains impassable to
  every domain built so far.
- Any third unit type, unit abilities, items, upgrades, veterancy, or healing.
  **→ ROADMAP, phase 3** for ship and plane. Merging (§3.7) is the one
  exception already built: it is not an ability on a unit type, it is an
  action.
- A second playable map, a map-select screen, or procedural generation. The
  loading mechanism is built — maps are looked up by id through a registry
  (§3.4) — but only `standard` is registered and nothing lets a player choose
  among maps. **→ ROADMAP, phase 2** for the actual Northern Norway map; a
  map-select screen isn't scheduled.
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
- `merge.test.ts` — derived stats scale with `stack` while mp and range do
  not; a merged attacker deals stack-scaled damage; `canMerge` rejects
  different types, enemies, non-adjacent units, already-acted units, and
  anything over `MAX_STACK`; `legalActions` offers both directions; `reduce`
  sums hp and stack onto the survivor, removes the absorbed unit, spends the
  turn, and consumes no RNG.
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