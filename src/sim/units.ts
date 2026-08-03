import type { UnitTypeId } from './types';

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
