import { SensorMode, SensorType, type InputPort, type NxtClient } from '@nxt/protocol';

/** Sensors the live tools (data logging, calibration) can read from a real brick. */
export type LiveSensor =
  | 'touch'
  | 'lightActive'
  | 'lightAmbient'
  | 'soundDb'
  | 'soundDba'
  | 'ultrasonic'
  | 'colorFull'
  | 'colorRed';

export const LIVE_SENSORS: Record<
  LiveSensor,
  { label: string; unit: string; type: number; mode: number }
> = {
  touch: { label: 'Touch', unit: '', type: SensorType.Switch, mode: SensorMode.Boolean },
  lightActive: {
    label: 'Light (lamp on)',
    unit: '%',
    type: SensorType.LightActive,
    mode: SensorMode.PercentFullScale,
  },
  lightAmbient: {
    label: 'Light (ambient)',
    unit: '%',
    type: SensorType.LightInactive,
    mode: SensorMode.PercentFullScale,
  },
  soundDb: {
    label: 'Sound dB',
    unit: '%',
    type: SensorType.SoundDb,
    mode: SensorMode.PercentFullScale,
  },
  soundDba: {
    label: 'Sound dBA',
    unit: '%',
    type: SensorType.SoundDba,
    mode: SensorMode.PercentFullScale,
  },
  ultrasonic: {
    label: 'Ultrasonic',
    unit: 'cm',
    type: SensorType.LowSpeed9V,
    mode: SensorMode.Raw,
  },
  // NXT 2.0 color sensor types (firmware 1.28+, see docs/spec/rxe.md "Beyond v1.0").
  colorFull: { label: 'Color (1–6)', unit: '', type: 0x0d, mode: SensorMode.Raw },
  colorRed: {
    label: 'Color sensor, red light',
    unit: '%',
    type: 0x0e,
    mode: SensorMode.PercentFullScale,
  },
};

/** Configures a port for a sensor. */
export async function setUpSensor(
  client: NxtClient,
  port: InputPort,
  kind: LiveSensor,
): Promise<void> {
  const s = LIVE_SENSORS[kind];
  if (kind === 'ultrasonic') await client.readUltrasonic(port, true);
  else await client.setInputMode(port, s.type, s.mode);
}

/** One reading in the sensor's NXT-G units. */
export async function readSensor(
  client: NxtClient,
  port: InputPort,
  kind: LiveSensor,
): Promise<number> {
  if (kind === 'ultrasonic') return client.readUltrasonic(port);
  return (await client.getInputValues(port)).scaled;
}
