/// <reference lib="webworker" />
import { act, type Difficulty } from '../../ai/next';
import type { PlayerView } from '../../rules';

export interface DuelAiRequest {
  id: number;
  difficulty: Difficulty;
  view: PlayerView;
  rng: number;
}

self.onmessage = (e: MessageEvent<DuelAiRequest>) => {
  const { id, difficulty, view, rng } = e.data;
  self.postMessage({ id, result: act(difficulty, view, rng) });
};
