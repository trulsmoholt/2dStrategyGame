# CLAUDE.md (src/render/)

Directory-scoped guidance for `src/render/`. Loaded alongside the root
[CLAUDE.md](../../CLAUDE.md) when working in this directory — see that file
for commands and cross-layer architecture. SPEC.md §5 has the intended
design; this covers what isn't obvious from reading it.

**`ui.ts`'s `UiState.aiming` carries a `reachable` field that SPEC.md's
snippet omits.** `onCancel(ui)` takes only a `UiState`, no `GameState`, so
stepping `aiming → selected` needs the reachable set available on the state
itself rather than recomputed from the sim.

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
Escape), and the End Turn button handler in `main.ts`. Any new input path
should be gated the same way rather than adding a fourth ad hoc check.

**Overlays are drawn *under* units, not over them** — `canvas.ts`'s `draw()`
order is terrain → reachable overlay → attackable overlay → units. Since
each unit's fill is inset only 3px and nearly opaque, the reachable/
attackable tint is visible only as a thin border ring around units standing
on a highlighted tile. That's intentional, not a rendering bug.

**Per-unit dimming reflects `hasActed`, not "did something this turn."**
`reduce`'s `endTurn` marks *every* remaining unit of the outgoing player as
acted, whether or not it moved, so after ending a turn with idle units they
render dimmed (`globalAlpha 0.55` in `drawUnit`) until that player's next
turn resets them — this is `reduce` behavior surfacing through the
renderer, not a `canvas.ts` bug.
