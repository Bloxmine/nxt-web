import type { InputPort, OutputPort } from '@nxt/protocol';
import { useEffect, useRef, useState } from 'react';
import { useBrick } from '../brick/BrickContext';
import { friendlyError } from '../brick/errors';
import { LIVE_SENSORS, readSensor, setUpSensor, type LiveSensor } from '../brick/sensors';
import { Dialog } from '../components/Dialog';
import { iconUrl } from '../lib/icons';
import { useSimulator } from '../sim/SimulatorContext';
import { LineChart, SERIES_COLORS } from './LineChart';

type Source = 'brick' | 'simulator';
interface Channel {
  key: string;
  title: string;
  unit: string;
  color: string;
  points: [number, number][];
}

const RATES = [50, 100, 250, 500, 1000];
const SIM_NAMES: Record<string, string> = {
  touch: 'Touch',
  lightActive: 'Light (lamp on)',
  lightAmbient: 'Light (ambient)',
  soundDb: 'Sound dB',
  soundDba: 'Sound dBA',
  ultrasonic: 'Ultrasonic',
  colorFull: 'Color (1–6)',
  colorRed: 'Color, red light',
  colorGreen: 'Color, green light',
  colorBlue: 'Color, blue light',
  colorNone: 'Color, ambient',
};

/** Records sensor readings over time, charts them and saves them as CSV (Tools → Data logging). */
export function DataLogDialog({ onClose }: { onClose(): void }) {
  const brick = useBrick();
  const sim = useSimulator();
  const [source, setSource] = useState<Source>(brick.client ? 'brick' : 'simulator');
  const [ports, setPorts] = useState<(LiveSensor | 'off')[]>([
    'off',
    'off',
    'lightActive',
    'ultrasonic',
  ]);
  const [motors, setMotors] = useState([false, true, true]);
  const [rate, setRate] = useState(250);
  const [recording, setRecording] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [showTable, setShowTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<() => void>(() => {});

  useEffect(() => () => stop.current(), []);

  const start = async () => {
    setError(null);
    const client = brick.client;
    const simulation = sim.sim;
    if (source === 'brick' && !client) return setError('Connect a brick first (NXT window).');
    if (source === 'simulator' && (!simulation || simulation.status !== 'running'))
      return setError('The simulator is not running a program.');
    const chosen: Channel[] = [];
    const readers: (() => Promise<number>)[] = [];
    for (let p = 0; p < 4; p++) {
      const port = p as InputPort;
      if (source === 'brick') {
        const kind = ports[p];
        if (!kind || kind === 'off') continue;
        try {
          await setUpSensor(client!, port, kind);
        } catch (e) {
          return setError(friendlyError(e));
        }
        chosen.push({
          key: `s${p}`,
          title: `Port ${p + 1}: ${LIVE_SENSORS[kind].label}`,
          unit: LIVE_SENSORS[kind].unit,
          color: SERIES_COLORS[p]!,
          points: [],
        });
        readers.push(() => readSensor(client!, port, kind));
      } else {
        const kind = simulation!.sensors[p];
        if (!kind) continue;
        chosen.push({
          key: `s${p}`,
          title: `Port ${p + 1}: ${SIM_NAMES[kind] ?? kind}`,
          unit: kind === 'ultrasonic' ? 'cm' : '',
          color: SERIES_COLORS[p]!,
          points: [],
        });
        readers.push(async () => simulation!.readSensor(port));
      }
    }
    motors.forEach((on, m) => {
      if (!on) return;
      chosen.push({
        key: `m${m}`,
        title: `Motor ${'ABC'[m]} rotation`,
        unit: '°',
        color: SERIES_COLORS[4 + m]!,
        points: [],
      });
      readers.push(
        source === 'brick'
          ? async () => (await client!.getOutputState(m as OutputPort)).rotationCount
          : async () => simulation!.motorDegrees(m as OutputPort),
      );
    });
    if (chosen.length === 0) return setError('Choose at least one sensor or motor.');
    setChannels(chosen);
    setRecording(true);
    const t0 = source === 'brick' ? performance.now() : simulation!.time;
    let busy = false;
    let stopped = false;
    const id = setInterval(async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const values = await Promise.all(readers.map((r) => r()));
        const t = ((source === 'brick' ? performance.now() : simulation!.time) - t0) / 1000;
        setChannels((cs) =>
          cs.map((c, i) => ({ ...c, points: [...c.points, [t, values[i]!] as [number, number]] })),
        );
      } catch (e) {
        setError(friendlyError(e));
        stopped = true;
        setRecording(false);
      } finally {
        busy = false;
      }
    }, rate);
    stop.current = () => {
      stopped = true;
      clearInterval(id);
      setRecording(false);
    };
  };

  const saveCsv = () => {
    const times = [...new Set(channels.flatMap((c) => c.points.map((p) => p[0])))].sort(
      (a, b) => a - b,
    );
    const rows = [
      ['time (s)', ...channels.map((c) => `${c.title}${c.unit ? ` (${c.unit})` : ''}`)].join(','),
      ...times.map((t) =>
        [t.toFixed(3), ...channels.map((c) => c.points.find((p) => p[0] === t)?.[1] ?? '')].join(
          ',',
        ),
      ),
    ];
    const url = URL.createObjectURL(new Blob([rows.join('\r\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `datalog-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const samples = channels[0]?.points.length ?? 0;

  return (
    <Dialog
      title="Data logging"
      icon="chart_line"
      width={600}
      modeless
      onClose={onClose}
      footer={
        <>
          {recording ? (
            <button type="button" className="btn primary" onClick={() => stop.current()}>
              <img src={iconUrl('control_stop')} alt="" /> Stop
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => void start()}>
              <img src={iconUrl('control_play')} alt="" /> Record
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={samples === 0 || recording}
            onClick={saveCsv}
          >
            <img src={iconUrl('diskette')} alt="" /> Save CSV
          </button>
          <button
            type="button"
            className="btn"
            disabled={samples === 0}
            onClick={() => setShowTable((v) => !v)}
          >
            {showTable ? 'Charts' : 'Table'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {error && (
        <div className="notice error" role="alert">
          <img src={iconUrl('exclamation')} alt="" />
          <span style={{ flex: 1 }}>{error}</span>
          {source === 'simulator' && !sim.sim?.status.startsWith('run') && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                sim.setOpen(true);
                sim.run();
                setError(null);
              }}
            >
              <img src={iconUrl('control_play')} alt="" /> Run in simulator
            </button>
          )}
        </div>
      )}
      <div className="log-setup">
        <label>
          Source{' '}
          <select
            value={source}
            disabled={recording}
            onChange={(e) => setSource(e.target.value as Source)}
          >
            <option value="brick">Brick ({brick.client ? 'connected' : 'not connected'})</option>
            <option value="simulator">Simulator</option>
          </select>
        </label>
        <label>
          Every{' '}
          <select
            value={rate}
            disabled={recording}
            onChange={(e) => setRate(Number(e.target.value))}
          >
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r} ms
              </option>
            ))}
          </select>
        </label>
        {samples > 0 && <span className="sim-muted">{samples} readings</span>}
      </div>
      {source === 'brick' ? (
        <div className="log-ports">
          {[0, 1, 2, 3].map((p) => (
            <label key={p}>
              Port {p + 1}
              <select
                value={ports[p]}
                disabled={recording}
                onChange={(e) =>
                  setPorts((s) =>
                    s.map((x, i) => (i === p ? (e.target.value as LiveSensor | 'off') : x)),
                  )
                }
              >
                <option value="off">—</option>
                {Object.entries(LIVE_SENSORS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : (
        <p className="sim-muted">
          The simulator's sensors are the ones the running program set up.
        </p>
      )}
      <div className="log-ports">
        {['A', 'B', 'C'].map((m, i) => (
          <label key={m} className="check">
            <input
              type="checkbox"
              checked={motors[i]}
              disabled={recording}
              onChange={(e) => setMotors((s) => s.map((x, k) => (k === i ? e.target.checked : x)))}
            />
            Motor {m}
          </label>
        ))}
      </div>
      {showTable ? (
        <div className="list-box" style={{ maxHeight: 320, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Time (s)</th>
                {channels.map((c) => (
                  <th key={c.key}>{c.title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {channels[0]?.points.map((p, i) => (
                <tr key={i}>
                  <td>{p[0].toFixed(2)}</td>
                  {channels.map((c) => (
                    <td key={c.key}>{c.points[i]?.[1]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="log-charts">
          {channels.map((c) => (
            <LineChart
              key={c.key}
              title={c.title}
              unit={c.unit}
              color={c.color}
              points={c.points}
            />
          ))}
        </div>
      )}
    </Dialog>
  );
}
