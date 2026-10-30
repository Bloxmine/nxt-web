/** Telegram type byte. Source: docs/spec/telegram.md, "Byte 0". */
export const TelegramType = {
  DirectReply: 0x00,
  SystemReply: 0x01,
  Reply: 0x02,
  DirectNoReply: 0x80,
  SystemNoReply: 0x81,
} as const;

/** Direct command opcodes. Source: docs/spec/direct-commands.md. */
export const DirectOpcode = {
  StartProgram: 0x00,
  StopProgram: 0x01,
  PlaySoundFile: 0x02,
  PlayTone: 0x03,
  SetOutputState: 0x04,
  SetInputMode: 0x05,
  GetOutputState: 0x06,
  GetInputValues: 0x07,
  ResetInputScaledValue: 0x08,
  MessageWrite: 0x09,
  ResetMotorPosition: 0x0a,
  GetBatteryLevel: 0x0b,
  StopSoundPlayback: 0x0c,
  KeepAlive: 0x0d,
  LsGetStatus: 0x0e,
  LsWrite: 0x0f,
  LsRead: 0x10,
  GetCurrentProgramName: 0x11,
  MessageRead: 0x13,
} as const;

/** System command opcodes. Source: docs/spec/system-commands.md. */
export const SystemOpcode = {
  OpenRead: 0x80,
  OpenWrite: 0x81,
  Read: 0x82,
  Write: 0x83,
  Close: 0x84,
  Delete: 0x85,
  FindFirst: 0x86,
  FindNext: 0x87,
  GetFirmwareVersion: 0x88,
  OpenWriteLinear: 0x89,
  OpenWriteData: 0x8b,
  OpenAppendData: 0x8c,
  SetBrickName: 0x98,
  GetDeviceInfo: 0x9b,
} as const;

/** SETOUTPUTSTATE mode bits. Source: docs/spec/direct-commands.md. */
export const OutputMode = {
  MotorOn: 0x01,
  Brake: 0x02,
  Regulated: 0x04,
} as const;

/** Output regulation modes. Source: docs/spec/direct-commands.md. */
export const RegulationMode = {
  Idle: 0x00,
  MotorSpeed: 0x01,
  MotorSync: 0x02,
} as const;

/** Output run states. Source: docs/spec/direct-commands.md. */
export const RunState = {
  Idle: 0x00,
  RampUp: 0x10,
  Running: 0x20,
  RampDown: 0x40,
} as const;

/** Sensor types for SETINPUTMODE. Source: docs/spec/direct-commands.md. */
export const SensorType = {
  NoSensor: 0x00,
  Switch: 0x01,
  Temperature: 0x02,
  Reflection: 0x03,
  Angle: 0x04,
  LightActive: 0x05,
  LightInactive: 0x06,
  SoundDb: 0x07,
  SoundDba: 0x08,
  Custom: 0x09,
  LowSpeed: 0x0a,
  LowSpeed9V: 0x0b,
} as const;

/** Sensor modes for SETINPUTMODE. Source: docs/spec/direct-commands.md. */
export const SensorMode = {
  Raw: 0x00,
  Boolean: 0x20,
  TransitionCount: 0x40,
  PeriodCounter: 0x60,
  PercentFullScale: 0x80,
  Celsius: 0xa0,
  Fahrenheit: 0xc0,
  AngleSteps: 0xe0,
} as const;

/** Output ports A–C are 0–2; 0xFF addresses all of them (SETOUTPUTSTATE only). */
export type OutputPort = 0 | 1 | 2;
/** Input ports 1–4 are 0–3. */
export type InputPort = 0 | 1 | 2 | 3;
/** Special SETOUTPUTSTATE port value meaning all outputs. */
export const ALL_OUTPUTS = 0xff;

/** Maximum telegram size including the type byte (docs/spec/telegram.md). */
export const MAX_TELEGRAM_LENGTH = 64;
/** Size of a file-name field: 19 characters plus a null terminator. */
export const FILE_NAME_FIELD_LENGTH = 20;

/** Direct-command status codes. Source: docs/spec/telegram.md, Appendix 2 p. 12. */
export const DIRECT_STATUS_MESSAGES: Readonly<Record<number, string>> = {
  0x20: 'Pending communication transaction in progress',
  0x40: 'Specified mailbox queue is empty',
  0xbd: 'Request failed (file not found)',
  0xbe: 'Unknown command opcode',
  0xbf: 'Insane packet',
  0xc0: 'Data contains out-of-range values',
  0xdd: 'Communication bus error',
  0xde: 'No free memory in communication buffer',
  0xdf: 'Specified channel/connection is not valid',
  0xe0: 'Specified channel/connection not configured or busy',
  0xec: 'No active program',
  0xed: 'Illegal size specified',
  0xee: 'Illegal mailbox queue ID specified',
  0xef: 'Attempted to access invalid field of a structure',
  0xf0: 'Bad input or output specified',
  0xfb: 'Insufficient memory available',
  0xff: 'Bad arguments',
};

/** System-command status codes. Source: docs/spec/telegram.md, Appendix 1 p. 16. */
export const SYSTEM_STATUS_MESSAGES: Readonly<Record<number, string>> = {
  0x81: 'No more handles',
  0x82: 'No space',
  0x83: 'No more files',
  0x84: 'End of file expected',
  0x85: 'End of file',
  0x86: 'Not a linear file',
  0x87: 'File not found',
  0x88: 'Handle already closed',
  0x89: 'No linear space',
  0x8a: 'Undefined error',
  0x8b: 'File is busy',
  0x8c: 'No write buffers',
  0x8d: 'Append not possible',
  0x8e: 'File is full',
  0x8f: 'File exists',
  0x90: 'Module not found',
  0x91: 'Out of boundary',
  0x92: 'Illegal file name',
  0x93: 'Illegal handle',
};

/** Status codes the client checks for by value. */
export const Status = {
  Success: 0x00,
  NoActiveProgram: 0xec,
  NoMoreFiles: 0x83,
  FileNotFound: 0x87,
  FileExists: 0x8f,
} as const;

/** Largest WRITE payload: a 64-byte telegram minus type, opcode and handle. */
export const MAX_WRITE_CHUNK = MAX_TELEGRAM_LENGTH - 3;
