import { ALL_OUTPUTS, NxtClient, type BrickSummary } from '@nxt/protocol';
import {
  RecordingTransport,
  type Capture,
  type Transport,
  type TransportState,
} from '@nxt/transport';
import { WebSerialTransport, WebUsbTransport } from '@nxt/transport/browser';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { friendlyError } from './errors';

/** What a download did: also which pictures/sounds it sent, and which it couldn't find. */
export interface DownloadResult {
  ok: boolean;
  sent: string[];
  /** Used by the program but neither on the brick nor made in this browser. */
  missing: string[];
}

export interface BrickContextValue {
  state: TransportState;
  /** Link type of the current connection, e.g. "USB". */
  kind: string | null;
  client: NxtClient | null;
  summary: BrickSummary | null;
  error: string | null;
  connectUsb(): Promise<void>;
  /** Bluetooth serial ports only, or with `anyPort` every serial port (for /dev/rfcomm0). */
  connectBluetooth(anyPort?: boolean): Promise<void>;
  disconnect(): Promise<void>;
  refresh(): Promise<void>;
  /** Stops the program, all motors and sound. */
  stopEverything(): Promise<void>;
  /** True while telegrams are being recorded (Tools → Record USB traffic). */
  recording: boolean;
  startRecording(): void;
  /** Stops recording and returns what was captured (null if nothing was recording). */
  stopRecording(note: string): Capture | null;
  /**
   * Uploads a compiled program and optionally starts it. First sends the pictures and
   * sounds it uses (`needed`, file names) that are not on the brick yet, or differ in
   * size, from `available`.
   */
  downloadProgram(
    fileName: string,
    bytes: Uint8Array,
    start: boolean,
    onProgress?: (sent: number, total: number) => void,
    media?: { needed: string[]; available: ReadonlyMap<string, Uint8Array> },
  ): Promise<DownloadResult>;
  clearError(): void;
}

const BrickContext = createContext<BrickContextValue | null>(null);

export function useBrick(): BrickContextValue {
  const value = useContext(BrickContext);
  if (!value) throw new Error('useBrick must be used inside BrickProvider');
  return value;
}

const KEEP_ALIVE_MS = 60_000;

export function BrickProvider({ children }: { children: ReactNode }) {
  const [transport, setTransport] = useState<Transport | null>(null);
  const [state, setState] = useState<TransportState>('disconnected');
  const [summary, setSummary] = useState<BrickSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // While recording, every telegram goes through a RecordingTransport wrapper.
  const [recorder, setRecorder] = useState<RecordingTransport | null>(null);
  const client = useMemo(
    () => (transport ? new NxtClient(recorder ?? transport) : null),
    [transport, recorder],
  );
  const clientRef = useRef(client);
  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  const refresh = useCallback(async () => {
    const c = clientRef.current;
    if (!c) return;
    try {
      setSummary(await c.getSummary());
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  const attach = useCallback(
    async (t: Transport) => {
      await transport?.disconnect();
      setError(null);
      t.onStateChange((s) => {
        setState(s);
        if (s === 'disconnected') setSummary(null);
      });
      setTransport(t);
      setRecorder(null);
      await t.connect();
      setState(t.state);
      clientRef.current = new NxtClient(t);
      await refresh();
    },
    [transport, refresh],
  );

  const run = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      const message = friendlyError(e);
      if (message) setError(message);
    }
  }, []);

  const connectUsb = useCallback(
    () =>
      run(async () => {
        // Reuse a brick the site already has permission for, so no picker is needed.
        const [paired] = await WebUsbTransport.paired();
        await attach(paired ?? (await WebUsbTransport.request()));
      }),
    [attach, run],
  );

  const connectBluetooth = useCallback(
    (anyPort = false) =>
      run(async () => attach(await WebSerialTransport.request(navigator.serial, { anyPort }))),
    [attach, run],
  );

  const disconnect = useCallback(async () => {
    await transport?.disconnect();
    setSummary(null);
  }, [transport]);

  const stopEverything = useCallback(
    () =>
      run(async () => {
        const c = clientRef.current;
        if (!c) return;
        await c.stopProgram();
        await c.stopMotor(ALL_OUTPUTS, true);
        await c.stopSound();
      }),
    [run],
  );

  const downloadProgram = useCallback(
    async (
      fileName: string,
      bytes: Uint8Array,
      start: boolean,
      onProgress?: (sent: number, total: number) => void,
      media?: { needed: string[]; available: ReadonlyMap<string, Uint8Array> },
    ) => {
      const result: DownloadResult = { ok: false, sent: [], missing: [] };
      await run(async () => {
        const c = clientRef.current;
        if (!c) throw new Error('No brick connected');
        await c.stopProgram();
        if (media && media.needed.length > 0) {
          const onBrick = new Map(
            (await c.listFiles('*.*')).map((f) => [f.name.toLowerCase(), f.size]),
          );
          for (const name of media.needed) {
            const local = media.available.get(name.toLowerCase());
            const size = onBrick.get(name.toLowerCase());
            if (local && size !== local.length) {
              await c.uploadFile(name, local);
              result.sent.push(name);
            } else if (!local && size === undefined) {
              result.missing.push(name);
            }
          }
        }
        await c.uploadFile(fileName, bytes, onProgress);
        if (start) await c.startProgram(fileName);
        result.ok = true;
      });
      return result;
    },
    [run],
  );

  // Keep the brick awake while connected, and keep the battery reading fresh.
  useEffect(() => {
    if (state !== 'connected' || !client) return;
    const id = setInterval(() => {
      void client.keepAlive().catch(() => {});
      void client
        .getBatteryLevel()
        .then((mv) => setSummary((s) => (s ? { ...s, batteryMillivolts: mv } : s)))
        .catch(() => {});
    }, KEEP_ALIVE_MS);
    return () => clearInterval(id);
  }, [state, client]);

  const value: BrickContextValue = {
    state,
    kind: transport?.kind ?? null,
    client: state === 'connected' ? client : null,
    summary,
    error,
    connectUsb,
    connectBluetooth,
    disconnect,
    refresh,
    stopEverything,
    downloadProgram,
    recording: recorder !== null,
    startRecording: () => {
      if (transport) setRecorder(new RecordingTransport(transport));
    },
    stopRecording: (note: string) => {
      const capture = recorder?.capture(note) ?? null;
      setRecorder(null);
      return capture;
    },
    clearError: () => setError(null),
  };
  return <BrickContext.Provider value={value}>{children}</BrickContext.Provider>;
}
