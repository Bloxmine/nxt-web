import { describe, expect, it } from 'vitest';
import type { Transport, TransportState } from './index.js';

describe('Transport interface', () => {
  it('can be implemented by a minimal in-memory object', async () => {
    const sent: Uint8Array[] = [];
    let state: TransportState = 'disconnected';
    const transport: Transport = {
      get state() {
        return state;
      },
      connect: async () => {
        state = 'connected';
      },
      disconnect: async () => {
        state = 'disconnected';
      },
      send: async (bytes) => {
        sent.push(bytes);
      },
      receive: async () => new Uint8Array(),
      onStateChange: () => () => {},
    };

    await transport.connect();
    await transport.send(new Uint8Array([1, 2, 3]));

    expect(transport.state).toBe('connected');
    expect(sent).toEqual([new Uint8Array([1, 2, 3])]);
  });
});
