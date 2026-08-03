import { describe, expect, it } from 'vitest';
import type { GameMap, GameState, Terrain, Unit } from '../../sim/index';
import { seedRng } from '../../sim/index';
import { BOARD_PX, CANVAS_HEIGHT, CANVAS_WIDTH, STATUS_H, draw } from '../canvas';
import type { ViewState } from '../canvas';

// A minimal stand-in for CanvasRenderingContext2D: no jsdom/canvas package
// dependency, just enough surface for draw() to run and be inspected.
function fakeCtx() {
  const calls: { fillRect: number; fillText: string[] } = { fillRect: 0, fillText: [] };
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    globalAlpha: 1,
    fillRect() { calls.fillRect++; },
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillText(text: string) { calls.fillText.push(text); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function flatMap(width: number, height: number): GameMap {
  const tiles: Terrain[] = new Array(width * height).fill('plain');
  return { width, height, tiles };
}

function makeUnit(partial: Partial<Unit> & { id: number; owner: 0 | 1 }): Unit {
  return { type: 'melee', pos: { x: 0, y: 0 }, hp: 10, hasActed: false, ...partial };
}

function stateWith(units: Unit[]): GameState {
  return { map: flatMap(16, 16), units, current: 0, turn: 1, rng: seedRng(1), result: null };
}

describe('draw', () => {
  it('exposes the documented canvas dimensions', () => {
    expect(CANVAS_WIDTH).toBe(512);
    expect(BOARD_PX).toBe(512);
    expect(CANVAS_HEIGHT).toBe(BOARD_PX + STATUS_H);
  });

  it('paints every terrain tile plus the status strip, and does not throw, for each UI state', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 1, y: 1 }, hasActed: false });
    const theirs = makeUnit({ id: 1, owner: 1, pos: { x: 2, y: 1 }, hp: 4 });
    const state = stateWith([mine, theirs]);

    const uiStates: ViewState['ui'][] = [
      { k: 'idle' },
      { k: 'selected', unitId: 0, reachable: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
      { k: 'aiming', unitId: 0, dest: { x: 2, y: 2 }, targets: [1], reachable: [{ x: 1, y: 1 }] },
      { k: 'aiTurn' },
      { k: 'over', result: 'p0' },
    ];

    for (const ui of uiStates) {
      const { ctx, calls } = fakeCtx();
      const view: ViewState = { ui, flashes: [{ unitId: 1, until: Date.now() + 1000 }] };
      expect(() => draw(ctx, state, view)).not.toThrow();
      // 16*16 terrain tiles + at least 2 units (rect + hp bar background + hp bar fill) + status strip
      expect(calls.fillRect).toBeGreaterThan(16 * 16);
      expect(calls.fillText.length).toBeGreaterThan(0);   // glyphs + status text
    }
  });

  it('status text reflects the result banner when the game is over', () => {
    const state = stateWith([]);
    for (const [result, expected] of [['p0', 'You win'], ['p1', 'You lose'], ['draw', 'Draw']] as const) {
      const { ctx, calls } = fakeCtx();
      draw(ctx, state, { ui: { k: 'over', result }, flashes: [] });
      expect(calls.fillText).toContain(expected);
    }
  });
});
