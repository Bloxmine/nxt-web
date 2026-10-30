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
import type { RbtOrigin } from './export.js';

/** Opens an original NXT-G .rbt program as an editor Program. */
export function importRbt(bytes: Uint8Array, fileName = 'Program.rbt'): ImportResult {
  return convertRbt(decodeRbt(bytes, fileName));
}

/** What to keep to write an imported program back into its .rbt file (`exportRbt`). */
export function originOf(result: ImportResult, bytes: Uint8Array, fileName: string): RbtOrigin {
  return {
    fileName,
    bytes,
    blocks: result.origins,
    snapshot: JSON.parse(JSON.stringify(result.program)) as ImportResult['program'],
  };
}
export { importRbtx, unzip, type PackedFile, type RbtxResult } from './rbtx.js';
export { myBlockId } from './convert.js';
export {
  exportRbt,
  exportNotes,
  steeringRatio,
  steeringSlider,
  STEERING_TABLE,
  RbtExportError,
  type BlockOrigin,
  type RbtOrigin,
} from './export.js';
export { DataSpace } from './dataspace.js';
export { rewriteRsrc } from './rsrcWrite.js';
