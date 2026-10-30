import { PacketInbox } from './inbox.js';
import type { TransportState, TransportStateListener } from './transport.js';
import { TransportClosedError } from './transport.js';

/** Shared state handling and inbox for transport implementations. */
export abstract class BaseTransport {
  protected readonly inbox = new PacketInbox();
  private readonly listeners = new Set<TransportStateListener>();
  private currentState: TransportState = 'disconnected';

  get state(): TransportState {
    return this.currentState;
  }

  receive(timeoutMs: number): Promise<Uint8Array> {
    if (this.currentState !== 'connected') return Promise.reject(new TransportClosedError());
    return this.inbox.next(timeoutMs);
  }

  drain(): void {
    this.inbox.clear();
  }

  onStateChange(listener: TransportStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected setState(state: TransportState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    if (state === 'disconnected') this.inbox.close();
    for (const listener of this.listeners) listener(state);
  }

  protected assertConnected(): void {
    if (this.currentState !== 'connected') throw new TransportClosedError();
  }
}
