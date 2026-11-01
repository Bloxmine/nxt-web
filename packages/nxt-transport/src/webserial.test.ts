import { describe, expect, it } from 'vitest';
import { SERIAL_PORT_PROFILE, WebSerialTransport } from './webserial.js';

function fakeSerial() {
  const calls: (SerialPortRequestOptions | undefined)[] = [];
  const serial = {
    requestPort: (options?: SerialPortRequestOptions) => {
      calls.push(options);
      return Promise.resolve({} as SerialPort);
    },
  } as unknown as Serial;
  return { serial, calls };
}

describe('WebSerialTransport.request', () => {
  it('lists only Bluetooth serial-port devices by default', async () => {
    const { serial, calls } = fakeSerial();
    await WebSerialTransport.request(serial);
    expect(calls).toEqual([{ filters: [{ bluetoothServiceClassId: SERIAL_PORT_PROFILE }] }]);
  });

  it('lists every port when asked', async () => {
    const { serial, calls } = fakeSerial();
    await WebSerialTransport.request(serial, { anyPort: true });
    expect(calls).toEqual([{}]);
  });
});
