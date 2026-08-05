import type { Action, GameState, UnitId } from '../sim/index';
import { newGame, reduce, replay } from '../sim/index';
import { chooseTurn } from '../ai/ai';
import type { ViewState } from './canvas';
import { CANVAS_HEIGHT, CANVAS_WIDTH, draw } from './canvas';
import type { UiState } from './ui';
import { mergeCandidates, onCancel, onMerge, onTileClick, pixelToTile } from './ui';
import { parseSavedGame, serializeGame } from './replay';

const FLASH_MS = 180;
const AI_STEP_MS = 400;

const canvas = document.getElementById('board') as HTMLCanvasElement;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const rawCtx = canvas.getContext('2d');
if (!rawCtx) throw new Error('main: 2D canvas context unavailable');
const ctx: CanvasRenderingContext2D = rawCtx;

let seed: number = Date.now() >>> 0;
let state: GameState = newGame(seed);
let ui: UiState = { k: 'idle' };
let flashes: { unitId: UnitId; until: number }[] = [];
let actionLog: Action[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const mergeBtn = document.getElementById('merge-btn') as HTMLButtonElement | null;
const actionHint = document.getElementById('action-hint');

// The panel is derived from (state, ui) on every render, same as the canvas —
// no separate panel state to keep in sync.
function renderPanel(): void {
  const locked = ui.k === 'aiTurn' || ui.k === 'over';
  const candidates = locked ? [] : mergeCandidates(state, ui);

  if (mergeBtn) {
    mergeBtn.disabled = candidates.length === 0;
    mergeBtn.textContent = ui.k === 'merging' ? 'Cancel merge' : 'Merge';
  }

  if (actionHint) {
    actionHint.textContent =
      ui.k === 'aiTurn' ? 'AI is moving…'
      : ui.k === 'over' ? 'Game over.'
      : ui.k === 'merging' ? 'Click a highlighted ally to merge into this unit.'
      : ui.k === 'idle' ? 'Select a unit. Move is automatic; attack follows a move.'
      : candidates.length > 0 ? 'Merge is available with an adjacent same-type ally.'
      : 'No merge available for this unit.';
  }
}

function render(): void {
  const view: ViewState = { ui, flashes };
  draw(ctx, state, view);
  renderPanel();
}

function applyAction(action: Action): void {
  const before = state;
  state = reduce(state, action);
  actionLog.push(action);

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

// Fourth input path — gated on 'aiTurn' identically to the other three.
mergeBtn?.addEventListener('click', () => {
  if (ui.k === 'aiTurn') return;
  ui = ui.k === 'merging' ? onCancel(ui) : onMerge(state, ui);
  render();
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
  seed = Date.now() >>> 0;
  state = newGame(seed);
  ui = { k: 'idle' };
  flashes = [];
  actionLog = [];
  render();
});

const replayText = document.getElementById('replay-text') as HTMLTextAreaElement | null;
const importError = document.getElementById('import-error');

document.getElementById('export-btn')?.addEventListener('click', () => {
  if (!replayText) return;
  replayText.value = serializeGame(seed, actionLog);
  if (importError) importError.textContent = '';
  replayText.select();
});

document.getElementById('import-btn')?.addEventListener('click', () => {
  if (ui.k === 'aiTurn' || !replayText) return;
  try {
    const saved = parseSavedGame(replayText.value);
    state = replay(saved.seed, saved.log);
    seed = saved.seed;
    actionLog = saved.log;
    flashes = [];
    ui = state.result ? { k: 'over', result: state.result } : { k: 'idle' };
    if (importError) importError.textContent = '';
    render();
  } catch (err) {
    if (importError) importError.textContent = err instanceof Error ? err.message : String(err);
  }
});

function loop(): void {
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
