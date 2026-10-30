import { CHALLENGES, scenarioById } from '@nxt/sim';
import { Dialog } from '../components/Dialog';
import { iconUrl } from '../lib/icons';
import { loadScores } from './scores';

const LEVELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/** Simulator → Challenges: tasks on the mats, with the best score so far. */
export function ChallengesDialog({
  onPlay,
  onClose,
}: {
  onPlay(id: string): void;
  onClose(): void;
}) {
  const scores = loadScores();
  return (
    <Dialog title="Challenges" icon="cup_gold" width={760} onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        Write a program, then play it in the simulator. Finish to earn a star, finish quickly for a
        second and without bumping into anything for a third.
      </p>
      <div className="challenge-list">
        {CHALLENGES.map((c) => {
          const best = scores[c.id];
          return (
            <div key={c.id} className="challenge-card">
              <h3>
                {c.name}
                <span className="stars" aria-label={`${best?.stars ?? 0} stars`}>
                  {'★'.repeat(best?.stars ?? 0)}
                  {'☆'.repeat(3 - (best?.stars ?? 0))}
                </span>
              </h3>
              <p>{c.description}</p>
              <span className="meta">
                {LEVELS[c.level]} · {scenarioById(c.mat).name} · {c.timeLimit} s
                {best && ` · best ${best.score}`}
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onPlay(c.id);
                  onClose();
                }}
              >
                <img src={iconUrl('flag_finish')} alt="" /> Play
              </button>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
