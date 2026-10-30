/**
 * Constants from the LEGO MINDSTORMS NXT Executable File Specification v1.0
 * (firmware 1.03). See docs/spec/rxe.md for the tables these come from.
 */

/** DSTOC type codes. */
export const TC = {
  VOID: 0,
  UBYTE: 1,
  SBYTE: 2,
  UWORD: 3,
  SWORD: 4,
  ULONG: 5,
  SLONG: 6,
  ARRAY: 7,
  CLUSTER: 8,
  MUTEX: 9,
} as const;
export type ScalarTypeCode = 1 | 2 | 3 | 4 | 5 | 6;

/** Instruction opcodes. */
export const OP = {
  ADD: 0x00,
  SUB: 0x01,
  NEG: 0x02,
  MUL: 0x03,
  DIV: 0x04,
  MOD: 0x05,
  AND: 0x06,
  OR: 0x07,
  XOR: 0x08,
  NOT: 0x09,
  CMP: 0x11,
  TST: 0x12,
  INDEX: 0x15,
  REPLACE: 0x16,
  ARRSIZE: 0x17,
  ARRBUILD: 0x18,
  ARRSUBSET: 0x19,
  ARRINIT: 0x1a,
  MOV: 0x1b,
  SET: 0x1c,
  FLATTEN: 0x1d,
  UNFLATTEN: 0x1e,
  NUMTOSTRING: 0x1f,
  STRINGTONUM: 0x20,
  STRCAT: 0x21,
  STRSUBSET: 0x22,
  STRTOBYTEARR: 0x23,
  BYTEARRTOSTR: 0x24,
  JMP: 0x25,
  BRCMP: 0x26,
  BRTST: 0x27,
  SYSCALL: 0x28,
  STOP: 0x29,
  FINCLUMP: 0x2a,
  FINCLUMPIMMED: 0x2b,
  ACQUIRE: 0x2c,
  RELEASE: 0x2d,
  SUBCALL: 0x2e,
  SUBRET: 0x2f,
  SETIN: 0x30,
  SETOUT: 0x31,
  GETIN: 0x32,
  GETOUT: 0x33,
  GETTICK: 0x35,
} as const;

/** Comparison codes (stored in the Flags field of OP_CMP, OP_TST, OP_BRCMP, OP_BRTST). */
export const CMP = { LT: 0, GT: 1, LTEQ: 2, GTEQ: 3, EQ: 4, NEQ: 5 } as const;
export type ComparisonCode = (typeof CMP)[keyof typeof CMP];

/** Reserved "no dataspace item" argument. */
export const NOT_A_DS_ID = 0xffff;

/** Input port properties (OP_SETIN / OP_GETIN). */
export const IO_IN = {
  TYPE: 0,
  MODE: 1,
  ADRAW: 2,
  NORMRAW: 3,
  SCALED_VAL: 4,
  INVALID_DATA: 5,
} as const;

/** Output port properties (OP_SETOUT / OP_GETOUT). */
export const IO_OUT = {
  FLAGS: 0x0,
  MODE: 0x1,
  SPEED: 0x2,
  ACTUAL_SPEED: 0x3,
  TACH_COUNT: 0x4,
  TACH_LIMIT: 0x5,
  RUN_STATE: 0x6,
  TURN_RATIO: 0x7,
  REG_MODE: 0x8,
  OVERLOAD: 0x9,
  REG_P_VAL: 0xa,
  REG_I_VAL: 0xb,
  REG_D_VAL: 0xc,
  BLOCK_TACH_COUNT: 0xd,
  ROTATION_COUNT: 0xe,
} as const;

/** Output FLAGS bits. */
export const UF = {
  UPDATE_MODE: 0x01,
  UPDATE_SPEED: 0x02,
  UPDATE_TACHO_LIMIT: 0x04,
  UPDATE_RESET_COUNT: 0x08,
  UPDATE_PID_VALUES: 0x10,
  UPDATE_RESET_BLOCK_COUNT: 0x20,
  UPDATE_RESET_ROTATION_COUNT: 0x40,
} as const;

/** Output MODE bits. */
export const OUT_MODE = { COAST: 0x00, MOTORON: 0x01, BRAKE: 0x02, REGULATED: 0x04 } as const;
/** Output REG_MODE values. */
export const OUT_REGMODE = { IDLE: 0, SPEED: 1, SYNC: 2 } as const;
/** Output RUN_STATE values. */
export const OUT_RUNSTATE = { IDLE: 0x00, RAMPUP: 0x10, RUNNING: 0x20, RAMPDOWN: 0x40 } as const;

/** Sensor TYPE values (firmware 1.03). */
export const SENSOR_TYPE = {
  NO_SENSOR: 0x00,
  SWITCH: 0x01,
  TEMPERATURE: 0x02,
  REFLECTION: 0x03,
  ANGLE: 0x04,
  LIGHT_ACTIVE: 0x05,
  LIGHT_INACTIVE: 0x06,
  SOUND_DB: 0x07,
  SOUND_DBA: 0x08,
  CUSTOM: 0x09,
  LOWSPEED: 0x0a,
  LOWSPEED_9V: 0x0b,
  HIGHSPEED: 0x0c,
  /**
   * NXT 2.0 color sensor types. Not in the v1.0 specification (firmware 1.03 has no
   * color sensor); values from the NXT 2.0 firmware (1.28+) as published in the
   * NBC/NXC documentation. Needs a hardware check (docs/hardware-tests.md).
   */
  COLORFULL: 0x0d,
  COLORRED: 0x0e,
  COLORGREEN: 0x0f,
  COLORBLUE: 0x10,
  COLORNONE: 0x11,
} as const;

/** Sensor MODE values. */
export const SENSOR_MODE = {
  RAW: 0x00,
  BOOLEAN: 0x20,
  TRANSITIONCNT: 0x40,
  PERIODCOUNTER: 0x60,
  PCTFULLSCALE: 0x80,
  CELSIUS: 0xa0,
  FAHRENHEIT: 0xc0,
  ANGLESTEP: 0xe0,
} as const;

/** System call ids (OP_SYSCALL). */
export const SYSCALL = {
  FileOpenRead: 0x00,
  FileOpenWrite: 0x01,
  FileOpenAppend: 0x02,
  FileRead: 0x03,
  FileWrite: 0x04,
  FileClose: 0x05,
  FileResolveHandle: 0x06,
  FileRename: 0x07,
  FileDelete: 0x08,
  SoundPlayFile: 0x09,
  SoundPlayTone: 0x0a,
  SoundGetState: 0x0b,
  SoundSetState: 0x0c,
  DrawText: 0x0d,
  DrawPoint: 0x0e,
  DrawLine: 0x0f,
  DrawCircle: 0x10,
  DrawRect: 0x11,
  DrawPicture: 0x12,
  SetScreenMode: 0x13,
  ReadButton: 0x14,
  CommLSWrite: 0x15,
  CommLSRead: 0x16,
  CommLSCheckStatus: 0x17,
  RandomNumber: 0x18,
  GetStartTick: 0x19,
  MessageWrite: 0x1a,
  MessageRead: 0x1b,
  CommBTCheckStatus: 0x1c,
  CommBTWrite: 0x1d,
  KeepAlive: 0x1f,
  IOMapRead: 0x20,
  IOMapWrite: 0x21,
} as const;

/** Sound module state values (NXTSoundSetState). */
export const SOUND_STATE = { IDLE: 0x00, FILE: 0x02, TONE: 0x03, STOP: 0x04 } as const;

/** Size in bytes of a scalar type code. */
export function scalarSize(tc: number): number {
  switch (tc) {
    case TC.UBYTE:
    case TC.SBYTE:
      return 1;
    case TC.UWORD:
    case TC.SWORD:
      return 2;
    case TC.ULONG:
    case TC.SLONG:
    case TC.MUTEX:
      return 4;
    default:
      throw new Error(`Type code ${tc} is not a scalar`);
  }
}
