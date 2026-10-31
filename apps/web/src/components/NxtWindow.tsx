import { SensorMode, SensorType, type InputPort, type OutputPort } from '@nxt/protocol';
import { useState } from 'react';
import { useBrick } from '../brick/BrickContext';
import { friendlyError } from '../brick/errors';
import { isLinux } from '../lib/udev';
import { UdevHelp } from './UdevHelp';
import { usePolling } from '../brick/usePolling';
import { formatBattery, formatBytes } from '../lib/format';
import { iconUrl } from '../lib/icons';
import { ConnectPrompt } from './ConnectPrompt';
import { Dialog } from './Dialog';
import { BrickScreen } from '../tools/BrickScreen';
import { FileManager } from '../tools/FileManager';
import { HealthPanel } from '../tools/HealthPanel';
import { RemotePanel } from '../tools/RemotePanel';

export type NxtTab = 'communications' | 'files' | 'monitor' | 'screen' | 'remote' | 'health';
type Tab = NxtTab;

/** Connection, brick info, files on the brick and a live sensor/motor monitor. */
export function NxtWindow({
  onClose,
  initialTab = 'communications',
}: {
  onClose(): void;
  initialTab?: NxtTab;
}) {
  const brick = useBrick();
  const [tab, setTab] = useState<Tab>(initialTab);
  const connected = brick.state === 'connected';

  return (
    <Dialog
      title="NXT Window"
      icon="monitor_window"
      width={640}
      modeless
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      {brick.error && (
        <div className="notice error" role="alert">
          <img src={iconUrl('exclamation')} alt="" />
          <span style={{ flex: 1 }}>{brick.error}</span>
          <button type="button" className="btn" onClick={brick.clearError}>
            OK
          </button>
        </div>
      )}
      {brick.error?.startsWith('Permission denied') && isLinux() && <UdevHelp compact />}
      <div className="dialog-tabs" role="tablist">
        {(
          [
            ['communications', 'Communications'],
            ['files', 'Files'],
            ['monitor', 'Monitor'],
            ['screen', 'Screen'],
            ['remote', 'Remote control'],
            ['health', 'Health check'],
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
      <div className="panel" role="tabpanel">
        {tab === 'communications' && <Communications />}
        {tab === 'files' && <FileManager />}
        {tab === 'monitor' && (connected ? <Monitor /> : <NotConnected />)}
        {tab === 'screen' && <BrickScreen />}
        {tab === 'remote' && <RemotePanel />}
        {tab === 'health' && <HealthPanel />}
      </div>
    </Dialog>
  );
}

function NotConnected() {
  return <ConnectPrompt what="see its sensors and motors live" />;
}

function Communications() {
  const brick = useBrick();
  const connected = brick.state === 'connected';
  const s = brick.summary;
  const hasUsb = 'usb' in navigator;
  const hasSerial = 'serial' in navigator;

  return (
    <>
      <fieldset className="groupbox">
        <legend>Connection</legend>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn primary"
            disabled={!hasUsb || brick.state === 'connecting'}
            onClick={() => void brick.connectUsb()}
          >
            <img src={iconUrl('connect')} alt="" />
            Connect via USB
          </button>
          <button
            type="button"
            className="btn"
            disabled={!hasSerial || brick.state === 'connecting'}
            onClick={() => void brick.connectBluetooth()}
            title="Experimental: pair the brick with your computer first, then pick its serial port"
          >
            <img src={iconUrl('bluetooth')} alt="" />
            Bluetooth (experimental)
          </button>
          <button
            type="button"
            className="btn"
            disabled={!connected}
            onClick={() => void brick.disconnect()}
          >
            <img src={iconUrl('disconnect')} alt="" />
            Disconnect
          </button>
        </div>
        <p style={{ margin: '8px 0 0', color: 'var(--text-muted)' }}>
          {brick.state === 'connecting'
            ? 'Connecting…'
            : connected
              ? `Connected via ${brick.kind}.`
              : 'Plug the brick in with a USB cable and switch it on.'}
        </p>
        {!connected && isLinux() && (
          <details className="udev-details">
            <summary>First time on Linux? Install the USB permission rule</summary>
            <UdevHelp compact />
          </details>
        )}
      </fieldset>
      <fieldset className="groupbox">
        <legend>Brick</legend>
        {s ? (
          <table className="info-table">
            <tbody>
              <tr>
                <th>Name</th>
                <td>
                  {s.name} <RenameButton current={s.name} />
                </td>
              </tr>
              <tr>
                <th>Battery</th>
                <td>{formatBattery(s.batteryMillivolts)}</td>
              </tr>
              <tr>
                <th>Firmware version</th>
                <td>{s.firmware}</td>
              </tr>
              <tr>
                <th>Protocol version</th>
                <td>{s.protocol}</td>
              </tr>
              <tr>
                <th>Free flash memory</th>
                <td>{formatBytes(s.freeFlashBytes)}</td>
              </tr>
              <tr>
                <th>Bluetooth address</th>
                <td>{s.bluetoothAddress}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p style={{ margin: 0 }}>
            {connected ? 'Reading brick information…' : 'No brick connected.'}
          </p>
        )}
        {connected && (
          <button
            type="button"
            className="btn"
            style={{ marginTop: 8 }}
            onClick={() => void brick.refresh()}
          >
            <img src={iconUrl('arrow_refresh')} alt="" />
            Refresh
          </button>
        )}
      </fieldset>
    </>
  );
}

function RenameButton({ current }: { current: string }) {
  const brick = useBrick();
  return (
    <button
      type="button"
      className="btn"
      style={{ minWidth: 0, marginLeft: 6 }}
      onClick={async () => {
        const name = window.prompt(
          'New brick name (up to 15 characters, letters and digits):',
          current,
        );
        if (!name || !brick.client) return;
        try {
          await brick.client.setBrickName(name.slice(0, 15));
          await brick.refresh();
        } catch (e) {
          window.alert(friendlyError(e));
        }
      }}
    >
      Rename…
    </button>
  );
}

type SensorChoice =
  'none' | 'touch' | 'lightActive' | 'lightAmbient' | 'soundDb' | 'soundDba' | 'ultrasonic';

// Sensor type and mode values from docs/spec/direct-commands.md.
const SENSOR_SETUP: Record<SensorChoice, { type: number; mode: number; unit: string }> = {
  none: { type: SensorType.NoSensor, mode: SensorMode.Raw, unit: '' },
  touch: { type: SensorType.Switch, mode: SensorMode.Boolean, unit: '' },
  lightActive: { type: SensorType.LightActive, mode: SensorMode.PercentFullScale, unit: '%' },
  lightAmbient: { type: SensorType.LightInactive, mode: SensorMode.PercentFullScale, unit: '%' },
  soundDb: { type: SensorType.SoundDb, mode: SensorMode.PercentFullScale, unit: '%' },
  soundDba: { type: SensorType.SoundDba, mode: SensorMode.PercentFullScale, unit: '%' },
  ultrasonic: { type: SensorType.LowSpeed9V, mode: SensorMode.Raw, unit: ' cm' },
};

const SENSOR_LABELS: Record<SensorChoice, string> = {
  none: 'None',
  touch: 'Touch',
  lightActive: 'Light (floodlight on)',
  lightAmbient: 'Light (ambient)',
  soundDb: 'Sound (dB)',
  soundDba: 'Sound (dBA)',
  ultrasonic: 'Ultrasonic',
};

function Monitor() {
  const brick = useBrick();
  const client = brick.client;
  const [sensors, setSensors] = useState<SensorChoice[]>(['none', 'none', 'none', 'none']);
  const [values, setValues] = useState<(number | null)[]>([null, null, null, null]);
  const [tacho, setTacho] = useState<(number | null)[]>([null, null, null]);
  const [power, setPower] = useState([50, 50, 50]);
  const [frequency, setFrequency] = useState(440);
  const [battery, setBattery] = useState<number | null>(brick.summary?.batteryMillivolts ?? null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  usePolling(
    async () => {
      if (!client) return;
      const nextValues = [...values];
      for (let p = 0; p < 4; p++) {
        if (sensors[p] === 'none') {
          nextValues[p] = null;
          continue;
        }
        if (sensors[p] === 'ultrasonic') {
          nextValues[p] = await client.readUltrasonic(p as InputPort);
          continue;
        }
        const v = await client.getInputValues(p as InputPort);
        nextValues[p] = v.scaled;
      }
      const nextTacho = [];
      for (let p = 0; p < 3; p++)
        nextTacho.push((await client.getOutputState(p as OutputPort)).rotationCount);
      setValues(nextValues);
      setTacho(nextTacho);
      setTick((t) => t + 1);
      if (tick % 20 === 0) setBattery(await client.getBatteryLevel());
    },
    250,
    client !== null,
  );

  return (
    <>
      {error && <div className="notice error">{error}</div>}
      <fieldset className="groupbox">
        <legend>Sensors</legend>
        <div className="monitor-grid">
          {[0, 1, 2, 3].map((p) => (
            <div key={p} className="gauge">
              <label>
                Port {p + 1}{' '}
                <select
                  aria-label={`Sensor on port ${p + 1}`}
                  value={sensors[p]}
                  onChange={(e) => {
                    const choice = e.target.value as SensorChoice;
                    const setup = SENSOR_SETUP[choice];
                    setSensors((s) => s.map((x, i) => (i === p ? choice : x)));
                    void act(() =>
                      choice === 'ultrasonic'
                        ? client!.readUltrasonic(p as InputPort, true)
                        : client!.setInputMode(p as InputPort, setup.type, setup.mode),
                    );
                  }}
                >
                  {Object.entries(SENSOR_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <div className="value" aria-live="polite">
                {values[p] === null || values[p] === undefined
                  ? '—'
                  : sensors[p] === 'touch'
                    ? values[p]
                      ? 'Pressed'
                      : 'Released'
                    : `${values[p]}${SENSOR_SETUP[sensors[p]!].unit}`}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset className="groupbox">
        <legend>Motors</legend>
        <div className="monitor-grid">
          {(['A', 'B', 'C'] as const).map((name, p) => (
            <div key={name} className="gauge">
              <strong>Motor {name}</strong>
              <div className="value">{tacho[p] ?? '—'}°</div>
              <input
                type="range"
                min={-100}
                max={100}
                value={power[p]}
                aria-label={`Motor ${name} power`}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  setPower((s) => s.map((x, i) => (i === p ? v : x)));
                }}
              />
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <button
                  type="button"
                  className="btn"
                  style={{ minWidth: 0 }}
                  onClick={() => void act(() => client!.runMotor(p as OutputPort, power[p]!))}
                >
                  <img src={iconUrl('control_play')} alt="" />
                  {power[p]}
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ minWidth: 0 }}
                  onClick={() => void act(() => client!.stopMotor(p as OutputPort))}
                >
                  <img src={iconUrl('control_stop')} alt="" />
                  Stop
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ minWidth: 0 }}
                  title="Reset rotation count"
                  onClick={() => void act(() => client!.resetMotorPosition(p as OutputPort, false))}
                >
                  0
                </button>
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset className="groupbox">
        <legend>Sound and battery</legend>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="num-input"
            type="number"
            min={200}
            max={14000}
            value={frequency}
            aria-label="Tone frequency"
            onChange={(e) =>
              !Number.isNaN(e.target.valueAsNumber) && setFrequency(e.target.valueAsNumber)
            }
          />
          Hz
          <button
            type="button"
            className="btn"
            onClick={() => void act(() => client!.playTone(frequency, 300))}
          >
            <img src={iconUrl('sound')} alt="" />
            Play tone
          </button>
          <span style={{ marginLeft: 'auto' }}>
            Battery: <strong>{battery === null ? '—' : formatBattery(battery)}</strong>
          </span>
        </div>
      </fieldset>
    </>
  );
}
