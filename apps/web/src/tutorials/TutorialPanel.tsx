import { SCENARIOS } from '@nxt/sim';
import { Fragment, useState, type ReactNode } from 'react';
import { Dialog } from '../components/Dialog';
import { useEditor } from '../editor/EditorContext';
import { iconUrl } from '../lib/icons';
import { useSimulator } from '../sim/SimulatorContext';
import { TUTORIALS, type Tutorial } from './content';

const KEY = 'nxt-web-studio:tutorials';

/** Furthest step reached per tutorial (remembered per browser). */
export function loadProgress(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function saveProgress(key: string, step: number): void {
  try {
    const p = loadProgress();
    p[key] = Math.max(p[key] ?? 0, step);
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Progress is a convenience only.
  }
}

/** Instruction text: paragraphs separated by blank lines, **bold**. */
function rich(text: string): ReactNode {
  return text
    .split('\n\n')
    .map((para, i) => (
      <p key={i}>
        {para
          .split(/\*\*(.+?)\*\*/)
          .map((part, k) =>
            k % 2 ? <strong key={k}>{part}</strong> : <Fragment key={k}>{part}</Fragment>,
          )}
      </p>
    ));
}

/** Help → Tutorials: pick a tutorial (shows how far you got). */
export function TutorialPicker({
  onStart,
  onClose,
}: {
  onStart(t: Tutorial, step: number): void;
  onClose(): void;
}) {
  const progress = loadProgress();
  return (
    <Dialog title="Tutorials" icon="help" width={520} onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        Step-by-step lessons. Each step checks your program (and the simulator) and ticks itself off
        when it is done.
      </p>
      <ul className="pick-list tutorials">
        {TUTORIALS.map((t) => {
          const reached = progress[t.key] ?? 0;
          const done = reached >= t.steps.length - 1;
          return (
            <li key={t.key} onClick={() => onStart(t, done ? 0 : reached)}>
              <img src={iconUrl(done ? 'tick' : 'star')} alt="" />
              <strong>{t.title}</strong>
              <span>
                {t.summary} · {t.level} · {done ? 'done' : `${reached}/${t.steps.length} steps`}
              </span>
              <button type="button" className="btn" style={{ minWidth: 0 }}>
                {done ? 'Again' : reached > 0 ? 'Continue' : 'Start'}
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/** The current tutorial step, floating over the editor. */
export function TutorialPanel({
  tutorial,
  initialStep,
  onClose,
}: {
  tutorial: Tutorial;
  initialStep: number;
  onClose(): void;
}) {
  const { state } = useEditor();
  const sim = useSimulator();
  const [index, setIndex] = useState(initialStep);
  const [showHint, setShowHint] = useState(false);
  /** Steps finished in this session (earlier progress counts as finished). */
  const [finished, setFinished] = useState<ReadonlySet<number>>(
    () => new Set(Array.from({ length: initialStep }, (_, i) => i)),
  );
  const step = tutorial.steps[index]!;
  void sim.tick; // re-check as the simulation runs
  const done = (() => {
    try {
      return step.check ? step.check({ program: state.program, sim: sim.sim }) : true;
    } catch {
      return false;
    }
  })();
  const last = index === tutorial.steps.length - 1;
  const mat = step.mat ? SCENARIOS.find((s) => s.id === step.mat) : undefined;
  const go = (to: number) => {
    if (done) setFinished((f) => new Set(f).add(index));
    setIndex(to);
    setShowHint(false);
    saveProgress(tutorial.key, to);
  };

  return (
    <aside className="tutorial" aria-label={`Tutorial: ${tutorial.title}`}>
      <div className="title-bar">
        <img src={iconUrl('help')} alt="" />
        {tutorial.title}
        <span className="doc">
          — step {index + 1} of {tutorial.steps.length}
        </span>
        <button
          type="button"
          className="dialog-close"
          style={{ marginLeft: 'auto' }}
          aria-label="Close tutorial"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="tutorial-progress" aria-hidden="true">
        {tutorial.steps.map((_, i) => (
          <span
            key={i}
            className={i === index ? 'now' : finished.has(i) ? 'past' : i < index ? 'skipped' : ''}
          />
        ))}
      </div>
      <div className="tutorial-body">
        <h3>{step.title}</h3>
        {rich(step.text)}
        {showHint && step.hint && <p className="tutorial-hint">{step.hint}</p>}
        {step.check && (
          <p className={`tutorial-status ${done ? 'done' : ''}`} role="status">
            <img src={iconUrl(done ? 'tick' : 'hourglass')} alt="" />
            {done ? 'Done!' : 'Waiting for you…'}
          </p>
        )}
      </div>
      <div className="tutorial-actions">
        <button type="button" className="btn" disabled={index === 0} onClick={() => go(index - 1)}>
          Back
        </button>
        {step.hint && !done && (
          <button type="button" className="btn" onClick={() => setShowHint(true)}>
            Hint
          </button>
        )}
        {mat && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              sim.setScenario(mat.id);
              sim.setOpen(true);
            }}
          >
            <img src={iconUrl('map')} alt="" /> Use the {mat.name} mat
          </button>
        )}
        <span style={{ flex: 1 }} />
        {last ? (
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              saveProgress(tutorial.key, tutorial.steps.length - 1);
              onClose();
            }}
          >
            Finish
          </button>
        ) : (
          <button
            type="button"
            className={`btn ${done ? 'primary glow' : ''}`}
            onClick={() => go(index + 1)}
            title={done ? 'Next step' : 'You can skip ahead, but this step is not done yet'}
          >
            Next
          </button>
        )}
      </div>
    </aside>
  );
}
