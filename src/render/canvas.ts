import type { GameMap, GameState, Unit, UnitId } from '../sim/index';
import { UNIT_STATS, terrainAt, unitMaxHp } from '../sim/index';
import type { UiState } from './ui';
import { TILE_SIZE } from './ui';

export const STATUS_H = 32;
export const boardWidthPx = (map: GameMap): number => map.width * TILE_SIZE;
export const boardHeightPx = (map: GameMap): number => map.height * TILE_SIZE;
export const canvasWidth = (map: GameMap): number => boardWidthPx(map);
export const canvasHeight = (map: GameMap): number => boardHeightPx(map) + STATUS_H;

export interface ViewState {
  readonly ui: UiState;
  readonly flashes: readonly { unitId: UnitId; until: number }[];
}

const OWNER_COLOR: Record<0 | 1, string> = { 0: '#2563eb', 1: '#dc2626' };
const TERRAIN_COLOR: Record<'plain' | 'wall', string> = { plain: '#e8f5e9', wall: '#374151' };
const REACHABLE_OVERLAY = 'rgba(37, 99, 235, 0.28)';
const ATTACKABLE_OVERLAY = 'rgba(220, 38, 38, 0.35)';
const MERGEABLE_OVERLAY = 'rgba(34, 197, 94, 0.45)';
const FLASH_OVERLAY = 'rgba(255, 255, 255, 0.75)';

export function draw(ctx: CanvasRenderingContext2D, state: GameState, view: ViewState): void {
  drawTerrain(ctx, state);
  drawOverlays(ctx, state, view.ui);
  drawUnits(ctx, state, view);
  drawStatus(ctx, state, view.ui);
}

function drawTerrain(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { map } = state;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      ctx.fillStyle = TERRAIN_COLOR[terrainAt(map, { x, y })];
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  const widthPx = boardWidthPx(map);
  const heightPx = boardHeightPx(map);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= map.width; i++) {
    ctx.beginPath();
    ctx.moveTo(i * TILE_SIZE + 0.5, 0);
    ctx.lineTo(i * TILE_SIZE + 0.5, heightPx);
    ctx.stroke();
  }
  for (let i = 0; i <= map.height; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * TILE_SIZE + 0.5);
    ctx.lineTo(widthPx, i * TILE_SIZE + 0.5);
    ctx.stroke();
  }
}

function drawOverlays(ctx: CanvasRenderingContext2D, state: GameState, ui: UiState): void {
  // While merging, the reachable set is irrelevant — the unit is not going to
  // move — so only the merge partners are highlighted.
  const reachable = ui.k === 'selected' || ui.k === 'aiming' ? ui.reachable : [];
  ctx.fillStyle = REACHABLE_OVERLAY;
  for (const p of reachable) {
    ctx.fillRect(p.x * TILE_SIZE, p.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  if (ui.k === 'aiming') {
    ctx.fillStyle = ATTACKABLE_OVERLAY;
    for (const targetId of ui.targets) {
      const target = state.units.find(u => u.id === targetId);
      if (target) ctx.fillRect(target.pos.x * TILE_SIZE, target.pos.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  if (ui.k === 'merging') {
    ctx.fillStyle = MERGEABLE_OVERLAY;
    for (const candidateId of ui.candidates) {
      const candidate = state.units.find(u => u.id === candidateId);
      if (candidate) ctx.fillRect(candidate.pos.x * TILE_SIZE, candidate.pos.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
}

function drawUnits(ctx: CanvasRenderingContext2D, state: GameState, view: ViewState): void {
  const now = Date.now();
  for (const unit of state.units) {
    const flashing = view.flashes.some(f => f.unitId === unit.id && f.until > now);
    drawUnit(ctx, unit, flashing);
  }
}

function drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, flashing: boolean): void {
  const stats = UNIT_STATS[unit.type];
  const px = unit.pos.x * TILE_SIZE;
  const py = unit.pos.y * TILE_SIZE;
  const inset = 3;

  ctx.globalAlpha = unit.hasActed ? 0.55 : 1;
  ctx.fillStyle = OWNER_COLOR[unit.owner];
  ctx.fillRect(px + inset, py + inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);
  ctx.globalAlpha = 1;

  // A merged unit reads as e.g. 'M2' — the glyph plus how many units are in
  // it. Its HP bar is scaled by the same factor, so a full bar still means
  // full strength.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = unit.stack > 1 ? `${stats.glyph}${unit.stack}` : stats.glyph;
  ctx.fillText(label, px + TILE_SIZE / 2, py + TILE_SIZE / 2 - 2);

  const barW = TILE_SIZE - inset * 2;
  const barH = 3;
  const bx = px + inset;
  const by = py + TILE_SIZE - inset - barH;
  const frac = Math.max(0, Math.min(1, unit.hp / unitMaxHp(unit)));
  ctx.fillStyle = '#111827';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = frac > 0.5 ? '#22c55e' : frac > 0.25 ? '#eab308' : '#ef4444';
  ctx.fillRect(bx, by, barW * frac, barH);

  if (flashing) {
    ctx.fillStyle = FLASH_OVERLAY;
    ctx.fillRect(px + inset, py + inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);
  }
}

function drawStatus(ctx: CanvasRenderingContext2D, state: GameState, ui: UiState): void {
  const widthPx = boardWidthPx(state.map);
  const heightPx = boardHeightPx(state.map);
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, heightPx, widthPx, STATUS_H);

  let text: string;
  if (ui.k === 'over') {
    text = ui.result === 'p0' ? 'You win' : ui.result === 'p1' ? 'You lose' : 'Draw';
  } else if (ui.k === 'aiTurn') {
    text = `Turn ${state.turn}/50 · AI thinking…`;
  } else {
    text = `Turn ${state.turn}/50 · Your move`;
  }

  ctx.fillStyle = '#f9fafb';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 8, heightPx + STATUS_H / 2);
}
