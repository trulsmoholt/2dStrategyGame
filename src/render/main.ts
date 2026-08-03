import type { Action, GameState, UnitId } from '../sim/index';
import { newGame, reduce } from '../sim/index';
import { chooseTurn } from '../ai/ai';
import type { ViewState } from './canvas';
import { CANVAS_HEIGHT, CANVAS_WIDTH, draw } from './canvas';
import type { UiState } from './ui';
import { onCancel, onTileClick, pixelToTile } from './ui';

const FLASH_MS = 180;
const AI_STEP_MS = 400;

const canvas = document.getElementById('board') as HTMLCanvasElement;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const rawCtx = canvas.getContext('2d');
if (!rawCtx) throw new Error('main: 2D canvas context unavailable');
const ctx: CanvasRenderingContext2D = rawCtx;

let state: GameState = newGame(Date.now() >>> 0);
let ui: UiState = { k: 'idle' };
let flashes: { unitId: UnitId; until: number }[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function render(): void {
  const view: ViewState = { ui, flashes };
  draw(ctx, state, view);
}

function applyAction(action: Action): void {
  const before = state;
  state = reduce(state, action);

  const now = Date.now();
  for (const prevUnit of before.units) {
    const nextUnit = state.units.find(u => u.id === prevUnit.id);
    if (nextUnit && nextUnit.hp < prevUnit.hp) {
      flashes.push({ unitId: prevUnit.id, until: now + FLASH_MS });
    }
  }
  flashes = flashes.filter(f => f.until > now);
}

async function runAiTurn(): Promise<void> {
  ui = { k: 'aiTurn' };
  render();
  for (const action of chooseTurn(state)) {
    applyAction(action);
    render();
    await sleep(AI_STEP_MS);
    if (state.result) break;
  }
  ui = state.result ? { k: 'over', result: state.result } : { k: 'idle' };
  render();
}

function handleTileClick(x: number, y: number): void {
  if (ui.k === 'aiTurn') return;
  const { ui: nextUi, action } = onTileClick(state, ui, { x, y });
  ui = nextUi;
  if (action) {
    applyAction(action);
    ui = state.result ? { k: 'over', result: state.result } : { k: 'idle' };
  }
  render();
}

function handleCancel(): void {
  if (ui.k === 'aiTurn') return;
  ui = onCancel(ui);
  render();
}

canvas.addEventListener('click', event => {
  const rect = canvas.getBoundingClientRect();
  const tile = pixelToTile(event.clientX - rect.left, event.clientY - rect.top);
  handleTileClick(tile.x, tile.y);
});

canvas.addEventListener('contextmenu', event => {
  event.preventDefault();
  handleCancel();
});

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') handleCancel();
});

document.getElementById('end-turn')?.addEventListener('click', () => {
  if (ui.k === 'aiTurn' || ui.k === 'over') return;
  applyAction({ t: 'endTurn' });
  if (state.result) {
    ui = { k: 'over', result: state.result };
    render();
    return;
  }
  render();
  if (state.current === 1) void runAiTurn();
});

document.getElementById('new-game')?.addEventListener('click', () => {
  state = newGame(Date.now() >>> 0);
  ui = { k: 'idle' };
  flashes = [];
  render();
});

function loop(): void {
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
