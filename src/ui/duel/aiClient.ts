// Runs the Spellfall AI in a Web Worker so thinking never blocks the UI; falls back to the main thread.
import { act, type ActResult, type Difficulty } from '../../ai/next';
import type { PlayerView } from '../../rules';
import type { DuelAiRequest } from './ai.worker';

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, (r: ActResult) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result: ActResult }>) => {
      pending.get(e.data.id)?.(e.data.result);
      pending.delete(e.data.id);
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function runDuelAi(difficulty: Difficulty, view: PlayerView, rng: number): Promise<ActResult> {
  const w = getWorker();
  if (!w) return Promise.resolve(act(difficulty, view, rng, () => performance.now()));
  const id = nextId++;
  const req: DuelAiRequest = { id, difficulty, view, rng };
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage(req);
  });
}
