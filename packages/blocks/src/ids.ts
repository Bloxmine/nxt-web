let counter = 0;

/** A short id that is unique within a session and unlikely to clash across sessions. */
export function newId(prefix = 'b'): string {
  counter = (counter + 1) % 0x10000;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}
