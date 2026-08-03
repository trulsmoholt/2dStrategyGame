import type { Action, GameResult, GameState, Pos, UnitId } from '../sim/index';
import { attackableFrom, reachableTiles, unitAt } from '../sim/index';

export const TILE_SIZE = 32;

export type UiState =
  | { k: 'idle' }
  | { k: 'selected'; unitId: UnitId; reachable: Pos[] }
  // `reachable` is carried here too (SPEC.md's snippet omits it) so onCancel
  // can step back to 'selected' from just a UiState, with no GameState.
  | { k: 'aiming'; unitId: UnitId; dest: Pos; targets: UnitId[]; reachable: Pos[] }
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
      if (!ui.reachable.some(p => samePos(p, tile))) {
        return { ui };
      }
      const targets = attackableFrom(state, ui.unitId, tile);
      if (targets.length > 0) {
        return { ui: { k: 'aiming', unitId: ui.unitId, dest: tile, targets, reachable: ui.reachable } };
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

    case 'aiTurn':
    case 'over':
      return { ui };

    default: {
      const exhaustive: never = ui;
      throw new Error(`onTileClick: unknown UiState ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function onCancel(ui: UiState): UiState {
  switch (ui.k) {
    case 'aiming':
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
