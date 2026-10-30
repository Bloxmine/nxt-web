/** Connection state of a transport. */
export type TransportState = 'disconnected' | 'connecting' | 'connected';

/** Called whenever a transport's connection state changes. */
export type TransportStateListener = (state: TransportState) => void;

/**
 * A byte pipe to one NXT brick.
 *
 * The protocol layer only ever talks to this interface, so WebUSB, Web Serial
 * (Bluetooth) and the mock brick are interchangeable. Implementations deal in
 * whole telegrams: any link-level framing (such as the Bluetooth length prefix)
 * is added and removed inside the implementation.
 */
export interface Transport {
  /** Current connection state. */
  readonly state: TransportState;

  /** Opens the link to the brick. */
  connect(): Promise<void>;

  /** Closes the link. Safe to call when already disconnected. */
  disconnect(): Promise<void>;

  /** Sends one telegram to the brick. */
  send(bytes: Uint8Array): Promise<void>;

  /** Waits for the next telegram from the brick. */
  receive(): Promise<Uint8Array>;

  /** Subscribes to state changes. Returns an unsubscribe function. */
  onStateChange(listener: TransportStateListener): () => void;
}
