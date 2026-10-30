import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { iconUrl } from '../lib/icons';
import { DEFAULT_ROBOT, loadRobot, saveRobot, WHEEL_PRESETS, type RobotSetup } from '../lib/robot';

/** Tools → Robot setup: wheel size, track width and sensor positions of your robot. */
export function RobotSetupDialog({
  onClose,
  onSaved,
}: {
  onClose(): void;
  onSaved?(robot: RobotSetup): void;
}) {
  const [robot, setRobot] = useState(loadRobot);
  const set = <K extends keyof RobotSetup>(k: K, v: RobotSetup[K]) =>
    setRobot((r) => ({ ...r, [k]: v }));
  const num = (
    k: 'wheelDiameter' | 'track' | 'lightOffset' | 'sonarOffset' | 'bumperOffset',
    label: string,
    step = 0.5,
  ) => (
    <label className="robot-field">
      {label}
      <input
        className="num-input"
        type="number"
        min={0}
        step={step}
        value={robot[k]}
        onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && set(k, e.target.valueAsNumber)}
      />
      cm
    </label>
  );
  return (
    <Dialog
      title="Robot setup"
      icon="wrench"
      width={480}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={() => setRobot(DEFAULT_ROBOT)}>
            Defaults
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              saveRobot(robot);
              onSaved?.(robot);
              onClose();
            }}
          >
            Save
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="robot-setup">
        <p style={{ marginTop: 0 }}>
          Tell the simulator and the calculator how your robot is built, so turns and distances
          match the real one.
        </p>
        <fieldset className="groupbox">
          <legend>Wheels</legend>
          <label className="robot-field">
            Wheel
            <select
              aria-label="Wheel preset"
              value={WHEEL_PRESETS.find(([, d]) => d === robot.wheelDiameter)?.[1] ?? ''}
              onChange={(e) => e.target.value && set('wheelDiameter', Number(e.target.value))}
            >
              <option value="">Custom</option>
              {WHEEL_PRESETS.map(([name, d]) => (
                <option key={name} value={d}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {num('wheelDiameter', 'Diameter', 0.1)}
          {num('track', 'Track (between the wheels)')}
          <label className="robot-field">
            Left wheel motor
            <select
              aria-label="Left wheel motor"
              value={robot.left}
              onChange={(e) => set('left', e.target.value as RobotSetup['left'])}
            >
              {['A', 'B', 'C'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            right
            <select
              aria-label="Right wheel motor"
              value={robot.right}
              onChange={(e) => set('right', e.target.value as RobotSetup['right'])}
            >
              {['A', 'B', 'C'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </fieldset>
        <fieldset className="groupbox">
          <legend>Sensors (distance in front of the wheels)</legend>
          {num('lightOffset', 'Light or color sensor')}
          {num('sonarOffset', 'Ultrasonic sensor')}
          {num('bumperOffset', 'Touch sensor bumper')}
        </fieldset>
        <p className="sim-muted">
          <img src={iconUrl('information')} alt="" style={{ width: 12, verticalAlign: -2 }} />{' '}
          Measure the track from the middle of one tyre to the middle of the other.
        </p>
      </div>
    </Dialog>
  );
}
