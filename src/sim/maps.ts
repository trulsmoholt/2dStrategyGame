import type { MapDef, MapId, RosterEntry } from './types';

// 16x16, 180deg-rotationally symmetric, all walls 2 tiles thick.
const STANDARD_TERRAIN = `
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
`;

// Order matches the original ASCII grid's row-major reading order (top to
// bottom, left to right), so unit ids come out identical to before the
// terrain/roster split — this is load-bearing for anything that references
// a unit by id (e.g. a saved game's action log).
const STANDARD_ROSTER: readonly RosterEntry[] = [
  { type: 'melee', owner: 0, pos: { x: 2, y: 0 } },
  { type: 'ranged', owner: 0, pos: { x: 4, y: 0 } },
  { type: 'melee', owner: 0, pos: { x: 1, y: 1 } },
  { type: 'melee', owner: 0, pos: { x: 0, y: 2 } },
  { type: 'ranged', owner: 0, pos: { x: 1, y: 3 } },
  { type: 'ranged', owner: 1, pos: { x: 14, y: 12 } },
  { type: 'melee', owner: 1, pos: { x: 15, y: 13 } },
  { type: 'melee', owner: 1, pos: { x: 14, y: 14 } },
  { type: 'ranged', owner: 1, pos: { x: 11, y: 15 } },
  { type: 'melee', owner: 1, pos: { x: 13, y: 15 } },
];

export const MAP_STANDARD_ID: MapId = 'standard';

export const MAP_STANDARD: MapDef = {
  id: MAP_STANDARD_ID,
  terrain: STANDARD_TERRAIN,
  roster: STANDARD_ROSTER,
};

const REGISTRY: Record<MapId, MapDef> = {
  [MAP_STANDARD_ID]: MAP_STANDARD,
};

export function getMapDef(id: MapId): MapDef {
  const def = REGISTRY[id];
  if (!def) throw new Error(`getMapDef: unknown map id '${id}'`);
  return def;
}
