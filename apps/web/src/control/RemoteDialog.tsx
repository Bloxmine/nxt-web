import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBrick } from '../brick/BrickContext';
import { ConnectPrompt } from '../components/ConnectPrompt';
import { Dialog } from '../components/Dialog';
import { iconUrl } from '../lib/icons';
import { useSimulator } from '../sim/SimulatorContext';
import { BrickDriver, SimDriver, type MotorDriver } from './driver';
import { chordLabel, inputLabel, isTyping, keyName, readGamepad, sortChord } from './input';
import { ControlLoop, type LoopState } from './loop';
import {
  createProfile,
  describeAction,
  limitsOf,
  PORT_NAMES,
  PORTS,
  PRESETS,
  steeringRoles,
  type Binding,
  type PresetKey,
  type Profile,
} from './profile';
import { KeysTab, LimitBar, MotorsTab, SequencesTab, SteeringTab } from './SetupTabs';
import {
  exportProfile,
  importProfile,
  loadProfiles,
  saveProfiles,
  type SavedProfiles,
} from './store';

type Target = 'brick' | 'simulator';
type Tab = 'drive' | 'steering' | 'motors' | 'keys' | 'sequences';

/** The on-screen pad and joystick act like these extra inputs. */
const SCREEN_BINDINGS: Binding[] = (['forward', 'backward', 'left', 'right'] as const).map(
  (direction) => ({
    id: `screen-${direction}`,
    inputs: [`screen:${direction}`],
    action: { kind: 'drive', direction },
  }),
);

const EMPTY: LoopState = { outputs: null, positions: [null, null, null], error: null, busy: null };

/**
 * Remote control with your own controls: how the robot steers, motor limits, keys and
 * key combinations (or a gamepad) for motors and sequences, saved as profiles.
 */
export function RemoteDialog({ onClose }: { onClose(): void }) {
  const brick = useBrick();
  const simulator = useSimulator();
  const [saved, setSaved] = useState<SavedProfiles | null>(null);
  const [tab, setTab] = useState<Tab>('drive');
  const [target, setTarget] = useState<Target>(brick.client ? 'brick' : 'simulator');
  const [live, setLive] = useState<LoopState>(EMPTY);
  const [loop, setLoop] = useState<ControlLoop | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const keys = useRef(new Set<string>());
  /** Keys pressed and let go between two control steps still count once. */
  const tapped = useRef(new Set<string>());
  const screen = useRef(new Map<string, number>());
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadProfiles().then(setSaved);
  }, []);

  // Save a moment after the last change.
  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => void saveProfiles(saved), 300);
    return () => clearTimeout(id);
  }, [saved]);

  const profile = saved?.profiles.find((p) => p.id === saved.activeId) ?? null;
  const update = useCallback(
    (change: (p: Profile) => Profile) =>
      setSaved((s) =>
        s ? { ...s, profiles: s.profiles.map((p) => (p.id === s.activeId ? change(p) : p)) } : s,
      ),
    [],
  );

  // What the engine sees: the profile plus the on-screen controls.
  const engineProfile = useMemo(
    () => (profile ? { ...profile, bindings: [...profile.bindings, ...SCREEN_BINDINGS] } : null),
    [profile],
  );
  const profileRef = useRef(engineProfile);
  useEffect(() => {
    profileRef.current = engineProfile;
  }, [engineProfile]);

  const held = useCallback(() => {
    const out = new Map<string, number>();
    for (const k of keys.current) out.set(k, 1);
    for (const k of tapped.current) out.set(k, 1);
    tapped.current.clear();
    for (const [k, v] of screen.current) out.set(k, v);
    for (const pad of navigator.getGamepads?.() ?? [])
      if (pad) for (const [k, v] of readGamepad(pad)) out.set(k, Math.max(v, out.get(k) ?? 0));
    return out;
  }, []);

  // One control loop per target (and per brick connection or simulation).
  const client = brick.client;
  const sim = simulator.sim;
  const haveProfile = engineProfile !== null;
  useEffect(() => {
    if (!haveProfile) return;
    let driver: MotorDriver | null = null;
    let owner: object | null = null;
    if (target === 'brick' && client) {
      driver = new BrickDriver(client);
      owner = client;
    } else if (target === 'simulator' && sim) {
      driver = new SimDriver(sim);
      owner = sim;
    }
    if (!driver || !owner || !profileRef.current) return;
    const l = new ControlLoop(driver, profileRef.current, held, setLive, owner);
    l.start();
    setLoop(l);
    return () => {
      setLoop(null);
      setLive(EMPTY);
      void l.stop().then(() => driver.dispose());
    };
  }, [target, client, sim, haveProfile, held]);

  useEffect(() => {
    if (loop && engineProfile) loop.setProfile(engineProfile);
  }, [loop, engineProfile]);

  // Keys drive the robot while the Drive tab is open, unless you are typing somewhere.
  const bound = useMemo(() => new Set(profile?.bindings.flatMap((b) => b.inputs) ?? []), [profile]);
  useEffect(() => {
    if (tab !== 'drive') return;
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const k = keyName(e.code);
      if (!bound.has(k)) return;
      e.preventDefault();
      e.stopPropagation();
      keys.current.add(k);
      tapped.current.add(k);
    };
    const up = (e: KeyboardEvent) => {
      const k = keyName(e.code);
      keys.current.delete(k);
      if (bound.has(k)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const release = () => keys.current.clear();
    // Another window took the keyboard: nothing may keep running unseen.
    const lost = () => {
      release();
      loop?.engine.stopAll();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', lost);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', lost);
      release();
    };
  }, [tab, bound, loop]);

  if (!saved || !profile) {
    return (
      <Dialog title="Remote control" icon="joystick" width={900} modeless onClose={onClose}>
        <p className="sim-muted">Loading your controls…</p>
      </Dialog>
    );
  }

  const choose = (activeId: string) => setSaved({ ...saved, activeId });
  const add = (p: Profile) => setSaved({ profiles: [...saved.profiles, p], activeId: p.id });

  return (
    <Dialog
      title="Remote control"
      icon="joystick"
      width={900}
      modeless
      onClose={onClose}
      footer={
        <>
          <span className="sim-muted" style={{ marginRight: 'auto' }}>
            Your controls are saved in this browser. Export them to keep a copy or share them.
          </span>
          <button type="button" className="btn primary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="rc-profilebar">
        <label>
          Controls{' '}
          <select value={profile.id} onChange={(e) => choose(e.target.value)}>
            {saved.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <input
          type="text"
          className="text-input"
          aria-label="Name of these controls"
          value={profile.name}
          maxLength={60}
          onChange={(e) => update((p) => ({ ...p, name: e.target.value }))}
        />
        <select
          aria-label="New controls"
          value=""
          onChange={(e) => {
            if (e.target.value) add(createProfile(e.target.value as PresetKey));
          }}
        >
          <option value="">New…</option>
          {PRESETS.map((p) => (
            <option key={p.key} value={p.key} title={p.description}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          title="Make a copy of these controls"
          onClick={() =>
            add({
              ...(JSON.parse(JSON.stringify(profile)) as Profile),
              id: `p-${Date.now().toString(36)}`,
              name: `${profile.name} (copy)`,
            })
          }
        >
          <img src={iconUrl('page_copy')} alt="" /> Copy
        </button>
        <button
          type="button"
          className="btn"
          disabled={saved.profiles.length < 2}
          onClick={() => {
            if (!window.confirm(`Delete the controls “${profile.name}”?`)) return;
            const profiles = saved.profiles.filter((p) => p.id !== profile.id);
            setSaved({ profiles, activeId: profiles[0]!.id });
          }}
        >
          <img src={iconUrl('delete')} alt="" /> Delete
        </button>
        <button type="button" className="btn" onClick={() => exportProfile(profile)}>
          <img src={iconUrl('page_white_put')} alt="" /> Export
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          <img src={iconUrl('folder')} alt="" /> Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            importProfile(file)
              .then((p) => {
                add(p);
                setNotice(`Imported “${p.name}”.`);
              })
              .catch((err: unknown) => setNotice(err instanceof Error ? err.message : String(err)));
          }}
        />
      </div>
      {notice && (
        <div className="notice">
          <img src={iconUrl('information')} alt="" />
          <span style={{ flex: 1 }}>{notice}</span>
          <button type="button" className="btn" onClick={() => setNotice(null)}>
            OK
          </button>
        </div>
      )}

      <div className="dialog-tabs" role="tablist">
        {(
          [
            ['drive', 'Drive'],
            ['steering', 'Steering'],
            ['motors', 'Motors'],
            ['keys', 'Keys'],
            ['sequences', 'Sequences'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`dialog-tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel rc-panel" role="tabpanel">
        {live.error && (
          <div className="notice error" role="alert">
            <img src={iconUrl('exclamation')} alt="" /> {live.error}
          </div>
        )}
        {live.busy && (
          <div className="notice">
            <img src={iconUrl('hourglass')} alt="" /> {live.busy}
          </div>
        )}
        {tab === 'drive' && (
          <DriveTab
            profile={profile}
            live={live}
            loop={loop}
            target={target}
            setTarget={setTarget}
            screen={screen}
          />
        )}
        {tab !== 'drive' &&
          (() => {
            const props = { profile, update, loop, live, canCalibrate: !!loop };
            if (tab === 'steering') return <SteeringTab {...props} />;
            if (tab === 'motors') return <MotorsTab {...props} />;
            if (tab === 'keys') return <KeysTab {...props} />;
            return <SequencesTab {...props} />;
          })()}
      </div>
    </Dialog>
  );
}

function DriveTab({
  profile,
  live,
  loop,
  target,
  setTarget,
  screen,
}: {
  profile: Profile;
  live: LoopState;
  loop: ControlLoop | null;
  target: Target;
  setTarget(t: Target): void;
  screen: React.RefObject<Map<string, number>>;
}) {
  const brick = useBrick();
  const simulator = useSimulator();
  const [stick, setStick] = useState<[number, number]>([0, 0]);
  const out = live.outputs;
  const roles = steeringRoles(profile.steering);

  const setScreen = (forward: number, turn: number) => {
    setStick([forward, turn]);
    const inputs = screen.current;
    inputs.clear();
    if (forward > 0) inputs.set('screen:forward', forward);
    if (forward < 0) inputs.set('screen:backward', -forward);
    if (turn > 0) inputs.set('screen:right', turn);
    if (turn < 0) inputs.set('screen:left', -turn);
  };
  const hold = (f: number, t: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setScreen(f, t);
    },
    onPointerUp: () => setScreen(0, 0),
    onPointerCancel: () => setScreen(0, 0),
  });
  useEffect(() => {
    const inputs = screen.current;
    return () => inputs.clear();
  }, [screen]);

  const simBusy = target === 'simulator' && simulator.status === 'running';
  // The simulated robot is built in Tools → Robot setup; say when it doesn't fit.
  const simRobot = target === 'simulator' ? simulator.sim?.world.robot : undefined;
  const steering = profile.steering;
  let mismatch: string | null = null;
  if (simRobot && steering.kind === 'car' && !simRobot.steering)
    mismatch =
      'The simulated robot has two wheels, not steering. Choose Car under Tools → Robot setup to drive it like a car.';
  else if (simRobot?.steering && steering.kind === 'differential')
    mismatch =
      'The simulated robot is a car. Use car controls for it (New… → Car with a steering motor).';
  else if (
    simRobot?.steering &&
    steering.kind === 'car' &&
    steering.steer !== simRobot.steering.motor
  )
    mismatch = `The simulated car steers with motor ${PORT_NAMES[simRobot.steering.motor]}, these controls with motor ${PORT_NAMES[steering.steer]}. Make them the same (here under Steering, or in Tools → Robot setup).`;

  return (
    <div className="rc-drive">
      <div className="log-setup">
        <label>
          Drive{' '}
          <select value={target} onChange={(e) => setTarget(e.target.value as Target)}>
            <option value="brick">
              the brick ({brick.client ? 'connected' : 'not connected'})
            </option>
            <option value="simulator">the simulated robot</option>
          </select>
        </label>
        {out && (
          <label>
            Speed{' '}
            <input
              type="range"
              min={10}
              max={100}
              value={out.speed}
              aria-label="Speed"
              onChange={(e) => {
                loop?.setSpeed(e.target.valueAsNumber);
              }}
            />{' '}
            {out.speed}%
          </label>
        )}
        <button
          type="button"
          className="btn"
          disabled={!loop}
          onClick={() => loop?.engine.stopAll()}
        >
          <img src={iconUrl('control_stop')} alt="" /> Stop all
        </button>
      </div>

      {target === 'brick' && !brick.client && <ConnectPrompt what="drive it" />}
      {target === 'simulator' && !simulator.open && (
        <p className="notice">
          <img src={iconUrl('information')} alt="" />
          <span style={{ flex: 1 }}>
            The simulator window is closed, so you won’t see the robot.
          </span>
          <button type="button" className="btn" onClick={() => simulator.setOpen(true)}>
            Show simulator
          </button>
        </p>
      )}
      {mismatch && (
        <p className="notice">
          <img src={iconUrl('information')} alt="" /> {mismatch}
        </p>
      )}
      {simBusy && (
        <p className="notice">
          <img src={iconUrl('information')} alt="" /> A program is running in the simulator. Stop it
          to drive by hand.
        </p>
      )}

      <div className="rc-drive-body">
        {profile.steering.kind !== 'none' && (
          <div className="rc-pads">
            <div className="remote-pad" role="group" aria-label="Direction buttons">
              <span />
              <button type="button" aria-label="Forward" {...hold(1, 0)}>
                ▲
              </button>
              <span />
              <button type="button" aria-label="Left" {...hold(0, -1)}>
                ◀
              </button>
              <button type="button" aria-label="Stop" onClick={() => loop?.engine.stopAll()}>
                ■
              </button>
              <button type="button" aria-label="Right" {...hold(0, 1)}>
                ▶
              </button>
              <span />
              <button type="button" aria-label="Backward" {...hold(-1, 0)}>
                ▼
              </button>
              <span />
            </div>
            <div
              className="remote-stick"
              aria-hidden="true"
              onPointerDown={(e) => {
                const el = e.currentTarget;
                el.setPointerCapture(e.pointerId);
                const move = (cx: number, cy: number) => {
                  const r = el.getBoundingClientRect();
                  const f = Math.max(-1, Math.min(1, -((cy - r.top) / r.height) * 2 + 1));
                  const t = Math.max(-1, Math.min(1, ((cx - r.left) / r.width) * 2 - 1));
                  setScreen(Math.abs(f) < 0.1 ? 0 : f, Math.abs(t) < 0.1 ? 0 : t);
                };
                move(e.clientX, e.clientY);
                const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
                const onUp = () => {
                  el.removeEventListener('pointermove', onMove);
                  el.removeEventListener('pointerup', onUp);
                  el.removeEventListener('pointercancel', onUp);
                  setScreen(0, 0);
                };
                el.addEventListener('pointermove', onMove);
                el.addEventListener('pointerup', onUp);
                el.addEventListener('pointercancel', onUp);
              }}
            >
              <span
                className="remote-knob"
                style={{ left: `${50 + stick[1] * 40}%`, top: `${50 - stick[0] * 40}%` }}
              />
            </div>
          </div>
        )}

        <div className="rc-gauges">
          {PORTS.map((p) => {
            const power = out?.ports[p].power ?? 0;
            const pos = live.positions[p];
            const lim = limitsOf(profile, p);
            const name = profile.motors[p].name || roles.get(p) || '';
            return (
              <div key={p} className={`rc-gauge ${out?.atLimit[p] ? 'at-limit' : ''}`}>
                <div className="rc-gauge-title">
                  <strong>{PORT_NAMES[p]}</strong> {name}
                  {out?.atLimit[p] && <span className="rc-limit-flag">at limit</span>}
                </div>
                <span className="rc-power" aria-label={`Power ${power}%`}>
                  <span
                    className="rc-power-fill"
                    style={{
                      left: power < 0 ? `${50 + power / 2}%` : '50%',
                      width: `${Math.abs(power) / 2}%`,
                    }}
                  />
                </span>
                <div className="rc-gauge-numbers">
                  <span>{power}%</span>
                  <span>{pos === null || pos === undefined ? '—' : `${Math.round(pos)}°`}</span>
                </div>
                {lim && pos !== null && pos !== undefined && (
                  <LimitBar pos={pos} lim={lim} target={out?.targets[p] ?? null} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <h4 className="rc-heading">Your keys</h4>
      {profile.bindings.length === 0 ? (
        <p className="sim-muted">No keys yet: add some under Keys.</p>
      ) : (
        <ul className="rc-cheats">
          {profile.bindings
            .filter((b) => b.inputs.length)
            .map((b) => (
              <li key={b.id} className={out?.active.has(b.id) ? 'active' : ''}>
                <span className="rc-cheat-keys" title={chordLabel(b.inputs)}>
                  {sortChord(b.inputs).map((i) => (
                    <kbd key={i}>{inputLabel(i)}</kbd>
                  ))}
                </span>
                <span>{describeAction(b.action, profile)}</span>
              </li>
            ))}
        </ul>
      )}
      <p className="sim-muted">
        Keys work while this tab is open (not while typing in a box). Switching to another window
        stops the motors.
        {target === 'simulator' &&
          ' In the simulator, other motors than the wheels only show their positions here.'}
      </p>
    </div>
  );
}
