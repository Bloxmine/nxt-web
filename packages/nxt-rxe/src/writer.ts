import { layoutDataspace, type Dataspace } from './dataspace.js';

/** A clump: a batch of instructions the VM schedules as one unit. */
export interface Clump {
  /** How many upstream clumps must finish first; 0 = starts with the program. */
  fireCount: number;
  /** Clumps scheduled when this one finishes (with OP_FINCLUMP). */
  dependents: number[];
  /** Code words (see {@link CodeBuilder}). */
  code: number[];
}

/** Everything that goes into an .rxe file. */
export interface RxeProgram {
  dataspace: Dataspace;
  clumps: Clump[];
}

/** File format string and version for firmware 1.03 (spec: "File Header"). */
export const RXE_SIGNATURE = 'MindstormsNXT';
export const RXE_VERSION = 0x0005;

/** Writes an executable file in the layout of the Executable File Specification v1.0. */
export function writeRxe(program: RxeProgram): Uint8Array {
  const layout = layoutDataspace(program.dataspace);
  if (layout.toc.length > 16383) throw new Error('Too many dataspace items (16,383 maximum)');
  if (program.clumps.length > 255) throw new Error('Too many clumps (255 maximum)');
  if (layout.initialSize > 0x8000) throw new Error('The program needs more than 32 KB of RAM');

  const out: number[] = [];
  const u8 = (n: number) => out.push(n & 0xff);
  const u16 = (n: number) => out.push(n & 0xff, (n >>> 8) & 0xff);
  const pad = () => {
    if (out.length % 2) out.push(0xff);
  };

  // Header (38 bytes).
  for (const c of RXE_SIGNATURE) u8(c.charCodeAt(0));
  u8(0);
  out.push((RXE_VERSION >> 8) & 0xff, RXE_VERSION & 0xff); // big-endian
  const defaultsSize = layout.staticDefaults.length + layout.dynamicDefaults.length;
  u16(layout.toc.length);
  u16(layout.initialSize);
  u16(layout.staticSize);
  u16(defaultsSize);
  u16(layout.staticDefaults.length);
  u16(layout.dynamicDefaults.length);
  u16(layout.memMgrHead);
  u16(layout.memMgrTail);
  u16(layout.dopeVectorOffset);
  u16(program.clumps.length);
  const codeWords = program.clumps.reduce((n, c) => n + c.code.length, 0);
  u16(codeWords);

  // Dataspace: table of contents, then static and dynamic defaults.
  for (const [type, flags, descriptor] of layout.toc) {
    u8(type);
    u8(flags);
    u16(descriptor);
  }
  out.push(...layout.staticDefaults, ...layout.dynamicDefaults);
  pad();

  // Clump records, then the packed dependent lists.
  let start = 0;
  for (const c of program.clumps) {
    u8(c.fireCount);
    u8(c.dependents.length);
    u16(start);
    start += c.code.length;
  }
  for (const c of program.clumps) for (const d of c.dependents) u8(d);
  pad();

  // Codespace.
  for (const c of program.clumps) for (const w of c.code) u16(w);
  return Uint8Array.from(out);
}
