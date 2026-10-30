import type { ChallengeResult } from '@nxt/sim';

const KEY = 'nxt-web-studio:challenges';

/** Best result per challenge id, kept in this browser. */
export type BestScores = Record<string, { score: number; stars: number }>;

export function loadScores(): BestScores {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as BestScores;
  } catch {
    return {};
  }
}

/** Keeps a won run when it beats the best so far. */
export function recordScore(id: string, result: ChallengeResult): void {
  if (result.state !== 'won') return;
  const scores = loadScores();
  const best = scores[id];
  if (best && best.score >= result.score) return;
  scores[id] = { score: result.score, stars: Math.max(result.stars, best?.stars ?? 0) };
  try {
    localStorage.setItem(KEY, JSON.stringify(scores));
  } catch {
    // Scores are a nicety.
  }
}
