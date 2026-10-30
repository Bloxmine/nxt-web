import type { OutputPort } from '@nxt/protocol';
import { useEffect, useRef, useState } from 'react';
import { useBrick } from '../brick/BrickContext';
import { friendlyError } from '../brick/errors';
import { iconUrl } from '../lib/icons';
import { useSimulator } from '../sim/SimulatorContext';

type Target = 'brick' | 'simulator';
const KEYS: Record<string, [number, number]> = {
  ArrowUp: [1, 0],
  w: [1, 0],
  ArrowDown: [-1, 0],
  s: [-1, 0],
  ArrowLeft: [0, -1],
  a: [0, -1],
  ArrowRight: [0, 1],
  d: [0, 1],
};

/** Left and right wheel powers for a forward amount and a turn amount (each −1…1). */
export function mix(forward: number, turn: number, speed: number): [number, number] {
  const left = Math.max(-1, Math.min(1, forward + turn));
  const right = Math.max(-1, Math.min(1, forward - turn));
  return [Math.round(left * speed), Math.round(right * speed)];
}

/**
 * Drive a robot by hand: arrow keys or WASD, the on-screen pad, or the joystick area.
 * Works on a connected brick (direct commands) or the simulated robot.
 */
export function RemotePanel() {
  const brick = useBrick();
  const sim = useSimulator();
  const [target, setTarget] = useState<Target>(brick.client ? 'brick' : 'simulator');
  const [ports, setPorts] = useState<[OutputPort, OutputPort]>([1, 2]);
  const [speed, setSpeed] = useState(60);
  const [stick, setStick] = useState<[number, number]>([0, 0]);
  const [error, setError] = useState<string | null>(null);
  const keys = useRef(new Set<string>());
  const sent = useRef<string>('0,0');
  const [left, right] = mix(stick[0], stick[1], speed);

  // Send the wheel powers when they change (at most every 80 ms on a brick).
  useEffect(() => {
    const key = `${left},${right}`;
    if (key === sent.current) return;
    if (target === 'simulator') {
      sent.current = key;
      sim.sim?.driveManually(left, right);
      return;
    }
    const client = brick.client;
    if (!client) return;
    const id = setTimeout(() => {
      sent.current = key;
      const go = (port: OutputPort, power: number) =>
        power === 0 ? client.stopMotor(port) : client.runMotor(port, power);
      void Promise.all([go(ports[0], left), go(ports[1], right)]).catch((e: unknown) =>
        setError(friendlyError(e)),
      );
    }, 80);
    return () => clearTimeout(id);
  }, [left, right, target, ports, brick.client, sim.sim]);

  // The simulated robot only moves when its world is stepped.
  useEffect(() => {
    if (target !== 'simulator') return;
    let last = performance.now();
    let id = requestAnimationFrame(function loop(now) {
      const s = sim.sim;
      if (s && s.status !== 'running') s.stepWorld(Math.min(50, now - last));
      last = now;
      id = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, [target, sim.sim]);

  // Stop when the panel closes.
  useEffect(
    () => () => {
      sim.sim?.driveManually(0, 0);
      void brick.client?.stopMotor(ports[0]).catch(() => {});
      void brick.client?.stopMotor(ports[1]).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const fromKeys = () => {
    let f = 0;
    let t = 0;
    for (const k of keys.current) {
      const v = KEYS[k];
      if (v) {
        f += v[0];
        t += v[1];
      }
    }
    setStick([Math.sign(f), Math.sign(t) * (f === 0 ? 1 : 0.5)]);
  };

  const hold = (f: number, t: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setStick([f, t]);
    },
    onPointerUp: () => setStick([0, 0]),
    onPointerCancel: () => setStick([0, 0]),
  });

  return (
    <div
      className="remote"
      tabIndex={0}
      aria-label="Remote control: use the arrow keys or W A S D to drive"
      onKeyDown={(e) => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (!KEYS[k]) return;
        e.preventDefault();
        keys.current.add(k);
        fromKeys();
      }}
      onKeyUp={(e) => {
        keys.current.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
        fromKeys();
      }}
      onBlur={() => {
        keys.current.clear();
        setStick([0, 0]);
      }}
    >
      {error && <div className="notice error">{error}</div>}
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
        {target === 'brick' && (
          <>
            <label>
              Left{' '}
              <select
                value={ports[0]}
                onChange={(e) => setPorts([Number(e.target.value) as OutputPort, ports[1]])}
              >
                {['A', 'B', 'C'].map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Right{' '}
              <select
                value={ports[1]}
                onChange={(e) => setPorts([ports[0], Number(e.target.value) as OutputPort])}
              >
                {['A', 'B', 'C'].map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label>
          Speed{' '}
          <input
            type="range"
            min={10}
            max={100}
            value={speed}
            onChange={(e) => setSpeed(e.target.valueAsNumber)}
          />{' '}
          {speed}%
        </label>
      </div>
      {target === 'simulator' && !sim.sim && (
        <p className="sim-muted">
          Open the simulator (Simulator → Show simulator) to see the robot.
        </p>
      )}
      <div className="remote-body">
        <div className="remote-pad" role="group" aria-label="Direction buttons">
          <span />
          <button type="button" aria-label="Forward" {...hold(1, 0)}>
            ▲
          </button>
          <span />
          <button type="button" aria-label="Turn left" {...hold(0, -1)}>
            ◀
          </button>
          <button type="button" aria-label="Stop" onClick={() => setStick([0, 0])}>
            ■
          </button>
          <button type="button" aria-label="Turn right" {...hold(0, 1)}>
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
            const update = (cx: number, cy: number) => {
              const r = el.getBoundingClientRect();
              const fx = -((cy - r.top) / r.height) * 2 + 1;
              const tx = ((cx - r.left) / r.width) * 2 - 1;
              setStick([Math.max(-1, Math.min(1, fx)), Math.max(-1, Math.min(1, tx))]);
            };
            update(e.clientX, e.clientY);
            const move = (ev: PointerEvent) => update(ev.clientX, ev.clientY);
            const up = () => {
              el.removeEventListener('pointermove', move);
              el.removeEventListener('pointerup', up);
              setStick([0, 0]);
            };
            el.addEventListener('pointermove', move);
            el.addEventListener('pointerup', up);
          }}
        >
          <span
            className="remote-knob"
            style={{ left: `${50 + stick[1] * 40}%`, top: `${50 - stick[0] * 40}%` }}
          />
        </div>
        <div className="remote-readout">
          <img src={iconUrl('joystick')} alt="" />
          <div>
            Left <strong>{left}%</strong>
          </div>
          <div>
            Right <strong>{right}%</strong>
          </div>
          <p className="sim-muted">Click here, then use the arrow keys or W A S D.</p>
        </div>
      </div>
    </div>
  );
}
