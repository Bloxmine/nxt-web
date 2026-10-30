/**
 * @nxt/rxe — NXT executable (.rxe) files
 *
 * Builds the dataspace, assembles clump code and writes files following the LEGO
 * MINDSTORMS NXT Executable File Specification v1.0 (docs/spec/rxe.md). `readRxe` parses
 * files back, for tests and the simulator's VM.
 */
export * from './opcodes.js';
export { CodeBuilder, decodeInstructionWord, instructionWord, type Label } from './code.js';
export {
  Dataspace,
  T,
  layoutDataspace,
  stringBytes,
  type DataspaceLayout,
  type DsDefault,
  type DsItem,
  type DsType,
} from './dataspace.js';
export { RXE_SIGNATURE, RXE_VERSION, writeRxe, type Clump, type RxeProgram } from './writer.js';
export { initialValues, readRxe, type ClumpRecord, type RxeFile, type TocEntry } from './reader.js';
