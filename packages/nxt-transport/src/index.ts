// Pure entry point: no DOM or browser APIs. Browser transports live in
// '@nxt/transport/browser' so core packages can depend on this one safely.
export type { Transport, TransportState, TransportStateListener } from './transport.js';
export { TransportClosedError, TransportTimeoutError } from './transport.js';
export { PacketInbox } from './inbox.js';
export { MockTransport, type MockResponder } from './mock.js';
export { BluetoothDeframer, frameBluetooth } from './framing.js';
export {
  RecordingTransport,
  replayCapture,
  toHex,
  fromHex,
  type Capture,
  type CapturedTelegram,
} from './recording.js';
