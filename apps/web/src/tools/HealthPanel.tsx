import type { InputPort, OutputPort } from '@nxt/protocol';
import { useState } from 'react';
import { useBrick } from '../brick/BrickContext';
import { friendlyError } from '../brick/errors';
import { usePolling } from '../brick/usePolling';
import { formatBattery, formatBytes } from '../lib/format';
import { ConnectPrompt } from '../components/ConnectPrompt';
import { iconUrl } from '../lib/icons';
import { LineChart, SERIES_COLORS } from './LineChart';

/** Battery readings kept for the session, so reopening the tab keeps the history. */
const batteryHistory: [number, number][] = [];
const started = performance.now();

interface Check {
  name: string;
  ok: boolean | null;
  detail: string;
}

/**
 * Health check: brick details, battery history, and tests that spin each motor and read
 * each sensor port.
 */
export function HealthPanel() {
  const brick = useBrick();
  const client = brick.client;
  const s = brick.summary;
  const [history, setHistory] = useState<[number, number][]>(() => [...batteryHistory]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  usePolling(
    async () => {
      if (!client) return;
      const mv = await client.getBatteryLevel();
      batteryHistory.push([(performance.now() - started) / 1000, mv / 1000]);
      if (batteryHistory.length > 720) batteryHistory.shift();
      setHistory([...batteryHistory]);
    },
    5000,
    client !== null,
  );

  const runTests = async () => {
    if (!client) return;
    setRunning(true);
    setError(null);
    const results: Check[] = [];
    try {
      const mv = await client.getBatteryLevel();
      results.push({
        name: 'Battery',
        ok: mv > 6800,
        detail: `${formatBattery(mv)}${mv <= 6800 ? ': low, motors may be weak' : ''}`,
      });
      setChecks([...results]);
      for (let p = 0; p < 3; p++) {
        const port = p as OutputPort;
        await client.resetMotorPosition(port, false);
        const before = (await client.getOutputState(port)).rotationCount;
        await client.runMotor(port, 50);
        await new Promise((r) => setTimeout(r, 700));
        await client.stopMotor(port);
        await new Promise((r) => setTimeout(r, 200));
        const turned = (await client.getOutputState(port)).rotationCount - before;
        results.push({
          name: `Motor ${'ABC'[p]}`,
          ok: Math.abs(turned) > 90,
          detail:
            Math.abs(turned) > 90
              ? `turned ${turned}°`
              : `turned ${turned}°: no motor, or it is blocked`,
        });
        setChecks([...results]);
      }
      for (let p = 0; p < 4; p++) {
        const v = await client.getInputValues(p as InputPort);
        results.push({
          name: `Port ${p + 1}`,
          ok: null,
          detail: `raw ${v.raw} (0–1023)${v.raw > 1000 ? ': nothing plugged in, or a touch sensor not pressed' : ''}`,
        });
        setChecks([...results]);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setRunning(false);
    }
  };

  if (!client) return <ConnectPrompt what="check its motors, sensors and battery" />;
  return (
    <>
      {error && <div className="notice error">{error}</div>}
      <fieldset className="groupbox">
        <legend>Brick</legend>
        {s ? (
          <table className="info-table">
            <tbody>
              <tr>
                <th>Firmware</th>
                <td>
                  {s.firmware} (protocol {s.protocol})
                  {Number(s.firmware) < 1.28 &&
                    ' — NXT 2.0 color sensor needs firmware 1.28 or later'}
                </td>
              </tr>
              <tr>
                <th>Free flash</th>
                <td>{formatBytes(s.freeFlashBytes)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p>Reading…</p>
        )}
        <LineChart
          title="Battery (V), every 5 s while this tab is open"
          unit=" V"
          color={SERIES_COLORS[0]!}
          points={history}
          height={110}
        />
      </fieldset>
      <fieldset className="groupbox">
        <legend>Tests</legend>
        <p style={{ marginTop: 0 }}>
          Spins each motor at half power for 0.7 s (lift the robot first), then reads each sensor
          port.
        </p>
        <button
          type="button"
          className="btn primary"
          disabled={running}
          onClick={() => void runTests()}
        >
          <img src={iconUrl('heart')} alt="" /> {running ? 'Testing…' : 'Run health check'}
        </button>
        {checks.length > 0 && (
          <table className="info-table" style={{ marginTop: 8 }}>
            <tbody>
              {checks.map((c) => (
                <tr key={c.name}>
                  <th>{c.name}</th>
                  <td>
                    {c.ok !== null && (
                      <img src={iconUrl(c.ok ? 'tick' : 'error')} alt={c.ok ? 'OK' : 'Problem'} />
                    )}{' '}
                    {c.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </fieldset>
    </>
  );
}
