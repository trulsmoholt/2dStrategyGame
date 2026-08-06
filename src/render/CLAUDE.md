# CLAUDE.md (src/render/)

Directory-scoped guidance for `src/render/`. Loaded alongside the root
[CLAUDE.md](../../CLAUDE.md) when working in this directory — see that file
for commands and cross-layer architecture. SPEC.md §5 holds the handful of
*decisions* that constrain the renderer (full redraw, input locked during the
AI turn, why the action panel is HTML); everything below is the
implementation detail those decisions leave open, and this file — not
SPEC.md — is where it belongs.

**Canvas pixel dimensions are derived from `state.map`, not fixed.**
`canvas.ts`'s `canvasWidth`/`canvasHeight`/`boardWidthPx`/`boardHeightPx`
take a `GameMap` and multiply its `width`/`height` by `TILE_SIZE`; there is
no `GRID` constant. `main.ts` calls `resizeCanvas()` — which reads
`state.map` — every time `state` is replaced wholesale (module init, New
Game, Import), never on every `render()`, since the map never changes
mid-game.

**`ui.ts`'s `UiState.aiming` and `.merging` both carry a `reachable` field.**
`onCancel(ui)` takes only a `UiState`, no
`GameState`, so stepping `aiming → selected` or `merging → selected` needs
the reachable set available on the state itself rather than recomputed from
the sim. `merging` never *uses* it for drawing — a merging unit isn't going
to move, so `drawOverlays` skips the reachable tint and shows only the green
merge-candidate highlight — it is carried purely so cancel can restore it.

**Attacking without moving still goes through `aiming`, via the unit's own
tile.** A living enemy is never on a reachable tile (it's occupied), so
clicking one directly while `selected` can't be a move destination —
`onTileClick` deselects instead. To attack without moving, click the unit's
own tile first (it's always in `reachable`); if an enemy is attackable from
there, that enters `aiming` with `dest` equal to the unit's current
position, same as SPEC.md's flow. (An earlier revision let a direct click
on an in-range enemy skip straight to `aiming`/attack; that shortcut was
deliberately reverted.)

**Every click while `selected` that isn't a deliberate move or attack setup
deselects (→ `idle`) rather than being ignored.** This covers a wall, an
out-of-bounds tile, an ally, an out-of-range enemy — and clicking the unit's
own tile when nothing is attackable from here, which deselects rather than
wasting the turn on a move-to-self.

**`main.ts` has no framework and no diffing** — `state`, `ui`, and `flashes`
are plain mutable module-scope variables. Event handlers (canvas click,
contextmenu, Escape keydown, the two buttons) mutate them directly and call
`render()`; a `requestAnimationFrame` loop *also* calls `render()`
unconditionally every frame, purely so hit-flashes (`FLASH_MS = 180`) fade
out on their own even when nothing else is happening. `draw()` therefore
runs far more often than the game state actually changes — it has to stay a
cheap full redraw, which it already is (SPEC.md's "no diffing, no dirty
rects").

**Flashes are derived, not stored in `GameState`.** `applyAction` in
`main.ts` diffs `before.units` against the post-`reduce` state by id and
pushes a flash for any surviving unit whose `hp` dropped. A unit that's
killed outright never flashes — it's simply gone from the array by the time
the diff runs.

**`ui.k === 'aiTurn'` is the single input lock**, checked identically at the
top of the canvas click handler, `handleCancel` (shared by right-click and
Escape), the End Turn button handler, and the Merge button handler in
`main.ts`. Any new input path should be gated the same way rather than adding
a fifth ad hoc check.

**The action panel is HTML, not canvas-drawn, and is derived state.** The
canvas click handler turns *every* click into a tile coordinate, so a
panel painted onto the canvas would need region hit-testing ahead of that;
`#action-panel` in `index.html` sidesteps the whole problem. `renderPanel()`
recomputes the button's enabled/label state and the hint text from
`(state, ui)` on every `render()`, so there is no panel state to keep in
sync — same discipline as the canvas full redraw. The Merge button is a
toggle: it reads `Cancel merge` and calls `onCancel` while `k === 'merging'`.
`onMerge` returns `ui` unchanged when there is nothing to merge with, so a
stale or mis-enabled button is a no-op rather than an error.

**Overlays are drawn *under* units, not over them** — `canvas.ts`'s `draw()`
order is terrain → reachable overlay (blue) → attackable overlay (red) →
merge-candidate overlay (green) → units → HP bars → hit flashes → status
text. Since
each unit's fill is inset only 3px and nearly opaque, the reachable/
attackable tint is visible only as a thin border ring around units standing
on a highlighted tile. That's intentional, not a rendering bug.

**A merged unit renders as its glyph plus its stack — `M2`, not `M`** — and
its HP bar is divided by `unitMaxHp(unit)`, not the type's `maxHp`, so a full
bar still means full strength. Using the table's `maxHp` here would paint a
20 HP merged unit as a permanently-full bar; that's the renderer-side face of
the `unitMaxHp`/`unitPower` rule in the root CLAUDE.md.

**Per-unit dimming reflects `hasActed`, not "did something this turn."**
`reduce`'s `endTurn` marks *every* remaining unit of the outgoing player as
acted, whether or not it moved, so after ending a turn with idle units they
render dimmed (`globalAlpha 0.55` in `drawUnit`) until that player's next
turn resets them — this is `reduce` behavior surfacing through the
renderer, not a `canvas.ts` bug.

**Export/import (`replay.ts`) is a save/load, not a VCR.** `main.ts` tracks
`seed` and `actionLog` alongside `state` (both reset on New Game, both
pushed to on every `applyAction`). Export just serializes them; Import calls
`replay(seed, log)` — the same pure sim-layer function the 100-seed
determinism proof uses — to jump straight to the reconstructed state and
hand control back to the player. There is no animated step-through and no
read-only viewer mode; a successful import fully replaces `state`, `seed`,
and `actionLog` as if the player had played it live. `parseSavedGame`
structurally validates the pasted JSON (shape/types of every action) before
handing off to `replay`, so a garbled paste surfaces as a message in
`#import-error` rather than a raw exception from deep inside `reduce`; a
paste that's structurally valid but *illegal* (e.g. acting with a unit that
doesn't exist) still throws from `reduce` and is caught the same way. Import
is gated on `ui.k !== 'aiTurn'`, same as every other input path.
