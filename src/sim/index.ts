// Public barrel — the ONLY module src/render may import.

export type {
  Player, UnitId, UnitTypeId, Domain, Terrain, Pos, Unit, GameMap, GameResult,
  GameState, Action, RosterEntry, MapId, MapDef,
} from './types';
export { MAX_TURNS, MAX_STACK, MIN_DAMAGE, DAMAGE_ROLL_MIN, DAMAGE_ROLL_MAX } from './types';

export type { Rng } from './rng';
export { seedRng, nextRng, rollInt } from './rng';

export type { UnitStats, MergeKind } from './units';
export { UNIT_STATS, unitMaxHp, unitPower, mergeKind } from './units';

export {
  MAP_STANDARD, MAP_STANDARD_ID, MAP_NORTHERN_NORWAY, MAP_NORTHERN_NORWAY_ID, getMapDef,
} from './maps';

export type { ParsedMap } from './map';
export { loadMap, parseTerrain, buildRoster, inBounds, terrainAt, chebyshev, terrainCost } from './map';

export { unitAt, inEnemyZoc, reachableTiles, distanceField, distanceAt } from './movement';

export { expectedDamage, resolveAttack } from './combat';

export { attackableFrom, canMerge, mergeableWith, legalActions } from './actions';

export { reduce, checkResult } from './reduce';

export { newGame, playOut, replay } from './game';
