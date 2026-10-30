// Byte-level tests. Expected bytes are derived from the layouts in docs/spec/;
// replace or extend with real captures in fixtures/ once hardware is tested.
import { describe, expect, it } from 'vitest';
import * as nxt from './index.js';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('direct command encoders', () => {
  it('PLAYTONE 440 Hz for 500 ms', () => {
    expect(nxt.encodePlayTone(440, 500)).toEqual(bytes(0x00, 0x03, 0xb8, 0x01, 0xf4, 0x01));
  });

  it('PLAYTONE without reply sets bit 7', () => {
    expect(nxt.encodePlayTone(440, 500, false)[0]).toBe(0x80);
  });

  it('rejects out-of-range tone frequencies', () => {
    expect(() => nxt.encodePlayTone(100, 10)).toThrow(RangeError);
  });

  it('GETBATTERYLEVEL', () => {
    expect(nxt.encodeGetBatteryLevel()).toEqual(bytes(0x00, 0x0b));
  });

  it('SETOUTPUTSTATE motor B at -75 regulated, 360 degrees', () => {
    const t = nxt.encodeSetOutputState(1, {
      power: -75,
      mode: nxt.OutputMode.MotorOn | nxt.OutputMode.Regulated,
      regulationMode: nxt.RegulationMode.MotorSpeed,
      turnRatio: 0,
      runState: nxt.RunState.Running,
      tachoLimit: 360,
    });
    expect(t).toEqual(
      bytes(0x00, 0x04, 0x01, 0xb5, 0x05, 0x01, 0x00, 0x20, 0x68, 0x01, 0x00, 0x00),
    );
  });

  it('SETINPUTMODE port 1 touch sensor, boolean', () => {
    expect(nxt.encodeSetInputMode(0, nxt.SensorType.Switch, nxt.SensorMode.Boolean)).toEqual(
      bytes(0x00, 0x05, 0x00, 0x01, 0x20),
    );
  });

  it('STARTPROGRAM pads the file name to 20 bytes', () => {
    const t = nxt.encodeStartProgram('a.rxe');
    expect(t.length).toBe(22);
    expect(Array.from(t.slice(0, 7))).toEqual([0x00, 0x00, 0x61, 0x2e, 0x72, 0x78, 0x65]);
    expect(Array.from(t.slice(7))).toEqual(new Array(15).fill(0));
  });

  it('rejects file names longer than 19 characters', () => {
    expect(() => nxt.encodeStartProgram('abcdefghijklmnop.rxe')).toThrow(RangeError);
  });

  it('LSWRITE', () => {
    expect(nxt.encodeLsWrite(3, bytes(0x02, 0x42), 1)).toEqual(
      bytes(0x00, 0x0f, 0x03, 0x02, 0x01, 0x02, 0x42),
    );
  });

  it('MESSAGEWRITE includes the null terminator in the size', () => {
    expect(nxt.encodeMessageWrite(0, 'hi')).toEqual(
      bytes(0x00, 0x09, 0x00, 0x03, 0x68, 0x69, 0x00),
    );
  });
});

describe('direct reply decoders', () => {
  it('GETBATTERYLEVEL 8000 mV', () => {
    expect(nxt.decodeGetBatteryLevel(bytes(0x02, 0x0b, 0x00, 0x40, 0x1f))).toBe(8000);
  });

  it('GETOUTPUTSTATE with negative counts', () => {
    const reply = new Uint8Array(25);
    reply.set([0x02, 0x06, 0x00, 0x02, 0x9c, 0x07, 0x01, 0x00, 0x20]);
    reply.set([0x68, 0x01, 0x00, 0x00], 9); // tacho limit 360
    reply.set([0xff, 0xff, 0xff, 0xff], 13); // tacho count -1
    reply.set([0x10, 0x00, 0x00, 0x00], 17);
    reply.set([0x00, 0x00, 0x01, 0x00], 21);
    expect(nxt.decodeGetOutputState(reply)).toEqual({
      port: 2,
      power: -100,
      mode: 7,
      regulationMode: 1,
      turnRatio: 0,
      runState: 0x20,
      tachoLimit: 360,
      tachoCount: -1,
      blockTachoCount: 16,
      rotationCount: 65536,
    });
  });

  it('GETINPUTVALUES', () => {
    const reply = bytes(
      0x02,
      0x07,
      0x00,
      0x01,
      0x01,
      0x00,
      0x05,
      0x80,
      0x10,
      0x02,
      0x20,
      0x03,
      0xd6,
      0xff,
      0,
      0,
    );
    expect(nxt.decodeGetInputValues(reply)).toEqual({
      port: 1,
      valid: true,
      calibrated: false,
      sensorType: nxt.SensorType.LightActive,
      sensorMode: nxt.SensorMode.PercentFullScale,
      raw: 0x210,
      normalized: 0x320,
      scaled: -42,
      calibratedValue: 0,
    });
  });

  it('throws a protocol error on short replies', () => {
    expect(() => nxt.decodeGetBatteryLevel(bytes(0x02, 0x0b, 0x00))).toThrow(nxt.NxtProtocolError);
  });
});

describe('system commands', () => {
  it('GET FIRMWARE VERSION example from Appendix 1 p. 11', () => {
    // "Byte 3: 0x02, Byte 4: 0x01, Byte 5: 0x03, Byte 6: 0x01 => protocol 1.2, firmware 1.3"
    const v = nxt.decodeGetFirmwareVersion(bytes(0x02, 0x88, 0x00, 0x02, 0x01, 0x03, 0x01));
    expect(v).toEqual({ protocol: { major: 1, minor: 2 }, firmware: { major: 1, minor: 3 } });
  });

  it('formats firmware 1.31 like the brick does', () => {
    expect(nxt.formatVersion({ major: 1, minor: 31 })).toBe('1.31');
    expect(nxt.formatVersion({ major: 1, minor: 5 })).toBe('1.05');
  });

  it('GET DEVICE INFO', () => {
    const reply = new Uint8Array(33);
    reply.set([0x02, 0x9b, 0x00]);
    reply.set([0x4e, 0x58, 0x54], 3); // "NXT"
    reply.set([0x00, 0x16, 0x53, 0x0a, 0x0b, 0x0c, 0x00], 18);
    reply.set([0x00, 0x80, 0x00, 0x00], 29); // 32768 bytes free
    expect(nxt.decodeGetDeviceInfo(reply)).toEqual({
      name: 'NXT',
      bluetoothAddress: '00:16:53:0A:0B:0C',
      bluetoothSignalStrength: 0,
      freeFlashBytes: 32768,
    });
  });

  it('OPEN WRITE LINEAR with size', () => {
    const t = nxt.encodeOpenWriteLinear('p.rxe', 1000);
    expect(t.length).toBe(26);
    expect(Array.from(t.slice(0, 2))).toEqual([0x01, 0x89]);
    expect(Array.from(t.slice(22))).toEqual([0xe8, 0x03, 0x00, 0x00]);
  });

  it('describes status codes from both tables', () => {
    expect(nxt.describeStatus(0x87, true)).toBe('File not found');
    expect(nxt.describeStatus(0xec, false)).toBe('No active program');
  });
});
