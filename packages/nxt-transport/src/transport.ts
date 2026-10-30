/** Connection state of a transport. */
export type TransportState = 'disconnected' | 'connecting' | 'connected';

/** Called whenever a transport's connection state changes. */
export type TransportStateListener = (state: TransportState) => void;

/**
 * A byte pipe to one NXT brick.
 *
 * The protocol layer only ever talks to this interface, so WebUSB, Web Serial
 * (Bluetooth) and the mock brick are interchangeable. Implementations deal in
 * whole telegrams: link-level framing (such as the Bluetooth length prefix,
 * docs/spec/telegram.md) is added and removed inside the implementation.
 */
export interface Transport {
  /** Short human-readable link type, e.g. "USB" or "Bluetooth". */
  readonly kind: string;

  /** Current connection state. */
  readonly state: TransportState;

  /** Opens the link to the brick. */
  connect(): Promise<void>;

  /** Closes the link. Safe to call when already disconnected. */
  disconnect(): Promise<void>;

  /** Sends one telegram to the brick. */
  send(bytes: Uint8Array): Promise<void>;

  /**
   * Waits for the next telegram from the brick.
   * Rejects with {@link TransportTimeoutError} after `timeoutMs`, and with
   * {@link TransportClosedError} if the link closes while waiting.
   */
  receive(timeoutMs: number): Promise<Uint8Array>;

  /** Throws away any telegrams received but not yet read. */
  drain(): void;

  /** Subscribes to state changes. Returns an unsubscribe function. */
  onStateChange(listener: TransportStateListener): () => void;
}

/** No telegram arrived within the timeout. */
export class TransportTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`No reply from the brick within ${timeoutMs} ms`);
    this.name = 'TransportTimeoutError';
  }
}

/** The link is closed (never opened, unplugged, or disconnected). */
export class TransportClosedError extends Error {
  constructor(message = 'Not connected to a brick') {
    super(message);
    this.name = 'TransportClosedError';
  }
}
