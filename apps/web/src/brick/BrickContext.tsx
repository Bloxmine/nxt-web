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

export interface BrickContextValue {
  state: TransportState;
  /** Link type of the current connection, e.g. "USB". */
  kind: string | null;
  client: NxtClient | null;
  summary: BrickSummary | null;
  error: string | null;
  connectUsb(): Promise<void>;
  connectBluetooth(): Promise<void>;
  disconnect(): Promise<void>;
  refresh(): Promise<void>;
  /** Stops the program, all motors and sound. */
  stopEverything(): Promise<void>;
  /** True while telegrams are being recorded (Tools → Record USB traffic). */
  recording: boolean;
  startRecording(): void;
  /** Stops recording and returns what was captured (null if nothing was recording). */
  stopRecording(note: string): Capture | null;
  /** Uploads a compiled program and optionally starts it. Resolves to false on failure. */
  downloadProgram(
    fileName: string,
    bytes: Uint8Array,
    start: boolean,
    onProgress?: (sent: number, total: number) => void,
  ): Promise<boolean>;
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
    () => run(async () => attach(await WebSerialTransport.request())),
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
    ) => {
      let ok = false;
      await run(async () => {
        const c = clientRef.current;
        if (!c) throw new Error('No brick connected');
        await c.stopProgram();
        await c.uploadFile(fileName, bytes, onProgress);
        if (start) await c.startProgram(fileName);
        ok = true;
      });
      return ok;
    },
    [run],
  );

  // Keep the brick awake while connected.
  useEffect(() => {
    if (state !== 'connected' || !client) return;
    const id = setInterval(() => void client.keepAlive().catch(() => {}), KEEP_ALIVE_MS);
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
