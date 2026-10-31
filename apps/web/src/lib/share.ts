import { parseProject, serializeProject, type Program } from '@nxt/blocks';

/** The part of a share link that holds the program: `#p=<compressed, base64url>`. */
const PREFIX = '#p=';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * A link that opens this program in NXT Web Studio: the project, compressed, in the
 * address's #fragment (so it never reaches a server). Pictures and sounds are not included.
 */
export async function shareLink(program: Program, base: string): Promise<string> {
  const json = new TextEncoder().encode(serializeProject(program));
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  return `${base.replace(/#.*$/, '')}${PREFIX}${toBase64Url(packed)}`;
}

/** The program in a share link's #fragment, or null when there is none. Throws if damaged. */
export async function readShared(hash: string): Promise<Program | null> {
  if (!hash.startsWith(PREFIX)) return null;
  const packed = fromBase64Url(hash.slice(PREFIX.length));
  const json = await pipe(packed, new DecompressionStream('deflate-raw'));
  return parseProject(new TextDecoder().decode(json));
}
