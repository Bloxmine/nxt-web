export * from './rsrc.js';
export {
  decodeRbt,
  RbtFormatError,
  type RbtProgram,
  type RbtInstance,
  type RbtNode,
  type RbtDiagram,
  type RbtWire,
  type RbtTerminal,
} from './decode.js';
export { convertRbt, type ImportResult } from './convert.js';
export { parseViTags } from './vitags.js';

import { convertRbt, type ImportResult } from './convert.js';
import { decodeRbt } from './decode.js';

/** Opens an original NXT-G .rbt program as an editor Program. */
export function importRbt(bytes: Uint8Array, fileName = 'Program.rbt'): ImportResult {
  return convertRbt(decodeRbt(bytes, fileName));
}
export { importRbtx, unzip, type PackedFile, type RbtxResult } from './rbtx.js';
export { myBlockId } from './convert.js';
