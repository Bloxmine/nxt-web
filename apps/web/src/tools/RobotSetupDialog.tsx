import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { iconUrl } from '../lib/icons';
import {
  CAR_ROBOT,
  DEFAULT_ROBOT,
  loadRobot,
  saveRobot,
  WHEEL_PRESETS,
  type RobotSetup,
} from '../lib/robot';

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
    k:
      | 'wheelDiameter'
      | 'track'
      | 'lightOffset'
      | 'sonarOffset'
      | 'bumperOffset'
      | 'wheelbase'
      | 'steerLock'
      | 'steerAngle',
    label: string,
    step = 0.5,
    unit = 'cm',
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
      {unit}
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
          <button
            type="button"
            className="btn"
            onClick={() => setRobot(robot.kind === 'car' ? CAR_ROBOT : DEFAULT_ROBOT)}
          >
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
        <div className="robot-kinds" role="radiogroup" aria-label="Kind of robot">
          {(
            [
              ['wheels', 'Two-wheel robot', 'Steers by turning its wheels at different speeds.'],
              ['car', 'Car', 'A motor turns the front wheels; the others drive.'],
            ] as const
          ).map(([kind, title, text]) => (
            <label key={kind} className={`robot-kind ${robot.kind === kind ? 'active' : ''}`}>
              <input
                type="radio"
                name="robot-kind"
                checked={robot.kind === kind}
                onChange={() =>
                  // Switching kind starts from that kind's measurements, keeping the wheel.
                  setRobot((r) => ({
                    ...(kind === 'car' ? CAR_ROBOT : DEFAULT_ROBOT),
                    wheelDiameter: r.wheelDiameter,
                  }))
                }
              />
              <strong>{title}</strong>
              <span>{text}</span>
            </label>
          ))}
        </div>
        {robot.kind === 'car' && (
          <fieldset className="groupbox">
            <legend>Steering</legend>
            <label className="robot-field">
              Steering motor
              <select
                aria-label="Steering motor"
                value={robot.steer}
                onChange={(e) => set('steer', e.target.value as RobotSetup['steer'])}
              >
                {['A', 'B', 'C'].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            {num('wheelbase', 'Wheelbase (rear to front axle)')}
            {num('steerLock', 'Motor turn to full lock', 5, '°')}
            {num('steerAngle', 'Wheel angle at full lock', 1, '°')}
            {(robot.steer === robot.left || robot.steer === robot.right) && (
              <p className="notice">
                <img src={iconUrl('error')} alt="" /> The steering motor also drives a wheel.
              </p>
            )}
            <p className="sim-muted">
              At full lock the front wheels hit their end and the steering motor stops, as on a real
              car. Turning the motor forwards steers right.
            </p>
          </fieldset>
        )}
        <fieldset className="groupbox">
          <legend>{robot.kind === 'car' ? 'Rear wheels' : 'Wheels'}</legend>
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
          <legend>
            Sensors (distance in front of the {robot.kind === 'car' ? 'rear axle' : 'wheels'})
          </legend>
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
