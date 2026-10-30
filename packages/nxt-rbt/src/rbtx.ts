import { emptyProgram, type Program } from '@nxt/blocks';
import { myBlockId, myBlockMissing, type ImportResult } from './convert.js';
import { importRbt } from './index.js';

/** A file packed in a Pack and Go archive. */
export interface PackedFile {
  name: string;
  bytes: Uint8Array;
}

/** A Pack and Go program with the files that came with it. */
export interface RbtxResult extends ImportResult {
  /** Sounds and pictures (.rso, .ric) the program uses. */
  files: PackedFile[];
}

// DecompressionStream is in browsers and Node 18+, but not in the ES library types.
interface Streams {
  DecompressionStream: new (format: string) => { readable: unknown; writable: unknown };
  Blob: new (parts: Uint8Array[]) => { stream(): { pipeThrough(t: unknown): unknown } };
  Response: new (body: unknown) => { arrayBuffer(): Promise<ArrayBuffer> };
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const g = globalThis as unknown as Streams;
  const stream = new g.Blob([data]).stream().pipeThrough(new g.DecompressionStream('deflate-raw'));
  return new Uint8Array(await new g.Response(stream).arrayBuffer());
}

/** Reads every file in a zip archive (stored or deflated entries). */
export async function unzip(bytes: Uint8Array): Promise<PackedFile[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a Pack and Go file (no zip directory found)');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files: PackedFile[] = [];
  for (let k = 0; k < count; k++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('The Pack and Go file is damaged');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extra = view.getUint16(p + 30, true);
    const comment = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = String.fromCharCode(...bytes.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extra + comment;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`Unsupported compression in ${name}`);
    files.push({
      name: name.split('/').pop()!,
      bytes: method === 8 ? await inflateRaw(data) : data.slice(),
    });
  }
  return files;
}

/** The main program's file name from rbtDistro.ini (the file placed in the profile root). */
function mainProgram(files: PackedFile[]): string | undefined {
  const ini = files.find((f) => f.name.toLowerCase() === 'rbtdistro.ini');
  if (ini) {
    const text = String.fromCharCode(...ini.bytes);
    for (const section of text.split(/\[file \d+\]/i)) {
      const name = /name="?([^"\r\n]+)"?/i.exec(section)?.[1];
      const path = /path="?([^"\r\n]+)"?/i.exec(section)?.[1] ?? '';
      if (name && /\.rbt$/i.test(name) && !/:::Blocks/i.test(path)) return name;
    }
  }
  return files.find((f) => /\.rbt$/i.test(f.name))?.name;
}

/**
 * Opens a Pack and Go (.rbtx) file from the NXT 2.0 software: a zip with the program,
 * the My Blocks it uses (each its own .rbt), its sounds and pictures, and rbtDistro.ini
 * saying where each file belongs.
 */
export async function importRbtx(bytes: Uint8Array): Promise<RbtxResult> {
  const files = await unzip(bytes);
  const mainName = mainProgram(files);
  const main = files.find((f) => f.name === mainName);
  if (!main) throw new Error('The Pack and Go file has no program (.rbt) in it');
  const result = importRbt(main.bytes, main.name);
  const warnings = [...result.warnings];
  let program: Program = result.program;
  const byName = new Map(
    files
      .filter((f) => /\.rbt$/i.test(f.name))
      .map((f) => [f.name.replace(/\.rbt$/i, '').toLowerCase(), f]),
  );

  // Load My Blocks, including My Blocks used inside My Blocks.
  const loaded = new Set<string>();
  const queue = [...result.myBlocks];
  while (queue.length) {
    const name = queue.shift()!;
    if (loaded.has(name)) continue;
    loaded.add(name);
    const file = byName.get(name.toLowerCase());
    if (!file) {
      warnings.push(`My Block "${name}" is not in the Pack and Go file; it was left empty.`);
      continue;
    }
    const sub = importRbt(file.bytes, file.name);
    for (const w of sub.warnings)
      if (!w.startsWith('My Block "')) warnings.push(`In My Block "${name}": ${w}`);
    queue.push(...sub.myBlocks);
    const variables = [...program.variables];
    for (const v of sub.program.variables) {
      if (!variables.some((x) => x.name === v.name)) variables.push(v);
    }
    const defs = new Map(program.myBlocks.map((m) => [m.id, m]));
    for (const m of sub.program.myBlocks) if (!defs.has(m.id)) defs.set(m.id, m);
    defs.set(myBlockId(name), { id: myBlockId(name), name, body: sub.program.body });
    program = {
      ...program,
      variables,
      myBlocks: [...defs.values()],
      wires: [...program.wires, ...sub.program.wires],
    };
  }
  const missing = new Set([...loaded].filter((n) => !byName.has(n.toLowerCase())));
  return {
    program: { ...emptyProgram(program.name), ...program },
    warnings: warnings.filter(
      (w) => ![...loaded].some((n) => !missing.has(n) && w === myBlockMissing(n)),
    ),
    myBlocks: [...loaded],
    files: files.filter((f) => /\.(rso|ric)$/i.test(f.name)),
  };
}
