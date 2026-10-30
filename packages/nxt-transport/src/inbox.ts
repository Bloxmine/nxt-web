import { TransportClosedError, TransportTimeoutError } from './transport.js';

// Timers exist in every JS runtime but are not part of the ES library types,
// and this file must type-check without DOM or Node types.
type TimerId = number | object;
const timers = globalThis as unknown as {
  setTimeout(callback: () => void, ms: number): TimerId;
  clearTimeout(id: TimerId): void;
};

interface Waiter {
  resolve: (packet: Uint8Array) => void;
  reject: (error: Error) => void;
  timer: TimerId;
}

/**
 * FIFO of received telegrams with timed waits. Shared by all transports so a
 * timed-out wait never swallows a later telegram.
 */
export class PacketInbox {
  private readonly packets: Uint8Array[] = [];
  private readonly waiters: Waiter[] = [];

  /** Adds a received telegram, handing it to the oldest waiter if there is one. */
  push(packet: Uint8Array): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      timers.clearTimeout(waiter.timer);
      waiter.resolve(packet);
    } else {
      this.packets.push(packet);
    }
  }

  /** Returns the next telegram, waiting up to `timeoutMs` for one to arrive. */
  next(timeoutMs: number): Promise<Uint8Array> {
    const ready = this.packets.shift();
    if (ready) return Promise.resolve(ready);

    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: timers.setTimeout(() => {
          const i = this.waiters.indexOf(waiter);
          if (i >= 0) this.waiters.splice(i, 1);
          reject(new TransportTimeoutError(timeoutMs));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  /** Drops queued telegrams. */
  clear(): void {
    this.packets.length = 0;
  }

  /** Rejects every waiter and drops queued telegrams. */
  close(error: Error = new TransportClosedError()): void {
    this.clear();
    for (const waiter of this.waiters.splice(0)) {
      timers.clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }
}
