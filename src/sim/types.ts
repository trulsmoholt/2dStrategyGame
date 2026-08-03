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
