import { DIRECT_STATUS_MESSAGES, SYSTEM_STATUS_MESSAGES } from './constants.js';

/** Human-readable text for a reply status byte. */
export function describeStatus(status: number, system: boolean): string {
  const table = system ? SYSTEM_STATUS_MESSAGES : DIRECT_STATUS_MESSAGES;
  return (
    table[status] ??
    (system ? DIRECT_STATUS_MESSAGES : SYSTEM_STATUS_MESSAGES)[status] ??
    `Unknown error 0x${status.toString(16).padStart(2, '0')}`
  );
}

/** The brick replied with a non-zero status byte. */
export class NxtStatusError extends Error {
  constructor(
    readonly opcode: number,
    readonly status: number,
    readonly system: boolean,
  ) {
    super(describeStatus(status, system));
    this.name = 'NxtStatusError';
  }
}

/** A reply did not have the expected shape. */
export class NxtProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NxtProtocolError';
  }
}
