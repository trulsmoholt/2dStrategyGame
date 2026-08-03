import type { Action, GameState, Pos, UnitId } from './types';
import { UNIT_STATS } from './units';
import { chebyshev } from './map';
import { reachableTiles } from './movement';

export function attackableFrom(
  state: GameState, unitId: UnitId, from: Pos,
): UnitId[] {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit) throw new Error(`attackableFrom: no unit with id ${unitId}`);
  const { range } = UNIT_STATS[unit.type];
  return state.units
    .filter(u => u.owner !== unit.owner && chebyshev(from, u.pos) <= range)
    .map(u => u.id)
    .sort((a, b) => a - b);
}

export function legalActions(state: GameState): Action[] {
  if (state.result !== null) return [];

  const actions: Action[] = [];
  const actors = state.units
    .filter(u => u.owner === state.current && !u.hasActed)
    .sort((a, b) => a.id - b.id);

  for (const unit of actors) {
    for (const to of reachableTiles(state, unit.id)) {
      for (const targetId of attackableFrom(state, unit.id, to)) {
        actions.push({ t: 'act', unitId: unit.id, to, targetId });
      }
      actions.push({ t: 'act', unitId: unit.id, to });
    }
    actions.push({ t: 'wait', unitId: unit.id });
  }

  actions.push({ t: 'endTurn' });
  return actions;
}
