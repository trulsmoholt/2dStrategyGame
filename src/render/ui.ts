import type { Action, GameResult, GameState, Pos, UnitId } from '../sim/index';
import { attackableFrom, mergeableWith, reachableTiles, unitAt } from '../sim/index';

export const TILE_SIZE = 32;

export type UiState =
  | { k: 'idle' }
  | { k: 'selected'; unitId: UnitId; reachable: Pos[] }
  // `reachable` is carried on aiming and merging too so onCancel can step back
  // to 'selected' from just a UiState, with no GameState.
  | { k: 'aiming'; unitId: UnitId; dest: Pos; targets: UnitId[]; reachable: Pos[] }
  | { k: 'merging'; unitId: UnitId; candidates: UnitId[]; reachable: Pos[] }
  | { k: 'aiTurn' }
  | { k: 'over'; result: GameResult };

export function pixelToTile(px: number, py: number): Pos {
  return { x: Math.floor(px / TILE_SIZE), y: Math.floor(py / TILE_SIZE) };
}

const samePos = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;

export function onTileClick(
  state: GameState, ui: UiState, tile: Pos,
): { ui: UiState; action?: Action } {
  switch (ui.k) {
    case 'idle': {
      const unit = unitAt(state, tile);
      if (unit && unit.owner === state.current && !unit.hasActed) {
        return { ui: { k: 'selected', unitId: unit.id, reachable: reachableTiles(state, unit.id) } };
      }
      return { ui };
    }

    case 'selected': {
      const unit = state.units.find(u => u.id === ui.unitId);
      if (!unit) return { ui: { k: 'idle' } };

      // A living enemy is never on a reachable tile (occupied), so it falls
      // straight into the deselect branch below — attacking without moving
      // requires clicking the unit's own tile first, same as SPEC.md's flow.
      if (!ui.reachable.some(p => samePos(p, tile))) {
        return { ui: { k: 'idle' } };   // wall, out of bounds, an ally, an enemy, etc.: deselect
      }

      const targets = attackableFrom(state, ui.unitId, tile);
      if (targets.length > 0) {
        return { ui: { k: 'aiming', unitId: ui.unitId, dest: tile, targets, reachable: ui.reachable } };
      }

      // Clicking the unit's own tile with nothing to attack from here is a
      // deselect, not a wasted "move to self" action.
      if (samePos(tile, unit.pos)) {
        return { ui: { k: 'idle' } };
      }

      return { ui: { k: 'idle' }, action: { t: 'act', unitId: ui.unitId, to: tile } };
    }

    case 'aiming': {
      const clicked = unitAt(state, tile);
      if (clicked && ui.targets.includes(clicked.id)) {
        return {
          ui: { k: 'idle' },
          action: { t: 'act', unitId: ui.unitId, to: ui.dest, targetId: clicked.id },
        };
      }
      return { ui: { k: 'idle' }, action: { t: 'act', unitId: ui.unitId, to: ui.dest } };
    }

    case 'merging': {
      const clicked = unitAt(state, tile);
      if (clicked && ui.candidates.includes(clicked.id)) {
        // The selected unit survives and keeps its tile, so the merged unit
        // stands where the player first clicked.
        return {
          ui: { k: 'idle' },
          action: { t: 'merge', unitId: ui.unitId, absorbId: clicked.id },
        };
      }
      // Anything else deselects, same as every other invalid click.
      return { ui: { k: 'idle' } };
    }

    case 'aiTurn':
    case 'over':
      return { ui };

    default: {
      const exhaustive: never = ui;
      throw new Error(`onTileClick: unknown UiState ${JSON.stringify(exhaustive)}`);
    }
  }
}

// The action panel's Merge button. Only meaningful while a unit is selected;
// returns `ui` unchanged when there is nothing to merge with, so a stale or
// mis-enabled button is a no-op rather than an error.
export function onMerge(state: GameState, ui: UiState): UiState {
  if (ui.k !== 'selected') return ui;
  const candidates = mergeableWith(state, ui.unitId);
  if (candidates.length === 0) return ui;
  return { k: 'merging', unitId: ui.unitId, candidates, reachable: ui.reachable };
}

// Whether the Merge button should be enabled for the current selection.
export function mergeCandidates(state: GameState, ui: UiState): UnitId[] {
  if (ui.k !== 'selected' && ui.k !== 'merging') return [];
  return mergeableWith(state, ui.unitId);
}

export function onCancel(ui: UiState): UiState {
  switch (ui.k) {
    case 'aiming':
    case 'merging':
      return { k: 'selected', unitId: ui.unitId, reachable: ui.reachable };
    case 'selected':
      return { k: 'idle' };
    case 'idle':
    case 'aiTurn':
    case 'over':
      return ui;
    default: {
      const exhaustive: never = ui;
      throw new Error(`onCancel: unknown UiState ${JSON.stringify(exhaustive)}`);
    }
  }
}
