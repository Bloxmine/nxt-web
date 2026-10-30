# VM instructions, port properties and system calls

Source: _LEGO MINDSTORMS NXT Executable File Specification_ v1.0, "Instruction Reference"
and its appendix (pp. 31–63). File layout and encoding are in [rxe.md](rxe.md).

## Instructions

Arguments are dataspace item ids unless marked _imm_ (immediate value).

| Op   | Name             | Arguments                                         | Notes                                |
| ---- | ---------------- | ------------------------------------------------- | ------------------------------------ |
| 0x00 | OP_ADD           | dest, a, b                                        |                                      |
| 0x01 | OP_SUB           | dest, a, b                                        | a − b                                |
| 0x02 | OP_NEG           | dest, src                                         |                                      |
| 0x03 | OP_MUL           | dest, a, b                                        |                                      |
| 0x04 | OP_DIV           | dest, a, b                                        | b = 0 → 0                            |
| 0x05 | OP_MOD           | dest, a, b                                        | b = 0 → a                            |
| 0x06 | OP_AND           | dest, a, b                                        | bitwise                              |
| 0x07 | OP_OR            | dest, a, b                                        | bitwise                              |
| 0x08 | OP_XOR           | dest, a, b                                        | bitwise                              |
| 0x09 | OP_NOT           | dest, src                                         | Boolean: 1 or 0                      |
| 0x11 | OP_CMP           | dest, a, b                                        | comparison code in flags             |
| 0x12 | OP_TST           | dest, src                                         | compares with 0                      |
| 0x15 | OP_INDEX         | dest, array, index                                | index may be NOT_A_DS_ID (0)         |
| 0x16 | OP_REPLACE       | dest, src, index, newval                          |                                      |
| 0x17 | OP_ARRSIZE       | dest, array                                       |                                      |
| 0x18 | OP_ARRBUILD      | _imm_ size, dest, src1 … srcN                     | arrays are concatenated              |
| 0x19 | OP_ARRSUBSET     | dest, src, index, count                           |                                      |
| 0x1A | OP_ARRINIT       | dest, value, count                                |                                      |
| 0x1B | OP_MOV           | dest, src                                         |                                      |
| 0x1C | OP_SET           | dest, _imm_ value                                 | 16-bit unsigned immediate            |
| 0x1D | OP_FLATTEN       | dest (string), src                                |                                      |
| 0x1E | OP_UNFLATTEN     | dest, error, src (string), default                |                                      |
| 0x1F | OP_NUMTOSTRING   | dest, src                                         |                                      |
| 0x20 | OP_STRINGTONUM   | dest, indexPast, src, index, default              |                                      |
| 0x21 | OP_STRCAT        | _imm_ size, dest, src1 … srcN                     |                                      |
| 0x22 | OP_STRSUBSET     | dest, src, index, count                           |                                      |
| 0x23 | OP_STRTOBYTEARR  | dest, src                                         | drops the 0 byte                     |
| 0x24 | OP_BYTEARRTOSTR  | dest, src                                         | adds the 0 byte                      |
| 0x25 | OP_JMP           | _imm_ offset                                      | signed                               |
| 0x26 | OP_BRCMP         | _imm_ offset, a, b                                | jumps if a ⟨cmp⟩ b                   |
| 0x27 | OP_BRTST         | _imm_ offset, src                                 | jumps if src ⟨cmp⟩ 0                 |
| 0x28 | OP_SYSCALL       | _imm_ id, params (cluster)                        |                                      |
| 0x29 | OP_STOP          | confirm                                           | NOT_A_DS_ID = true; ends the program |
| 0x2A | OP_FINCLUMP      | _imm_ start, _imm_ end                            | −1, −1 = no dependents               |
| 0x2B | OP_FINCLUMPIMMED | _imm_ clump                                       |                                      |
| 0x2C | OP_ACQUIRE       | mutex                                             |                                      |
| 0x2D | OP_RELEASE       | mutex                                             |                                      |
| 0x2E | OP_SUBCALL       | _imm_ clump, callerId                             |                                      |
| 0x2F | OP_SUBRET        | callerId                                          |                                      |
| 0x30 | OP_SETIN         | src, port, _imm_ property                         |                                      |
| 0x31 | OP_SETOUT        | _imm_ size, port or port list, (_imm_ prop, src)… |                                      |
| 0x32 | OP_GETIN         | dest, port, _imm_ property                        |                                      |
| 0x33 | OP_GETOUT        | dest, port, _imm_ property                        |                                      |
| 0x35 | OP_GETTICK       | dest                                              | ms since the brick started           |

Reserved: 0x0A–0x10, 0x13, 0x14, 0x34. Comparison codes: 0 `<`, 1 `>`, 2 `<=`, 3 `>=`,
4 `==`, 5 `!=`.

## Input port properties (OP_SETIN / OP_GETIN)

| Id  | Property     | Type  |                                                                  |
| --- | ------------ | ----- | ---------------------------------------------------------------- |
| 0   | TYPE         | UBYTE | set INVALID_DATA to 1 after changing, then wait until it reads 0 |
| 1   | MODE         | UBYTE | ″                                                                |
| 2   | ADRAW        | UWORD | read-only                                                        |
| 3   | NORMRAW      | UWORD | read-only                                                        |
| 4   | SCALED_VAL   | SWORD |                                                                  |
| 5   | INVALID_DATA | UBYTE |                                                                  |

Types: 0x00 none, 0x01 switch, 0x02 temperature, 0x03 reflection, 0x04 angle, 0x05 light
active, 0x06 light inactive, 0x07 sound dB, 0x08 sound dBA, 0x09 custom, 0x0A lowspeed,
0x0B lowspeed 9V, 0x0C highspeed. Modes: 0x00 raw, 0x20 boolean, 0x40 transition count,
0x60 period count, 0x80 percent of full scale, 0xA0 °C, 0xC0 °F, 0xE0 angle steps.

## Output port properties (OP_SETOUT / OP_GETOUT)

| Id  | Property     | Type  | Id  | Property         | Type  |
| --- | ------------ | ----- | --- | ---------------- | ----- |
| 0x0 | FLAGS        | UBYTE | 0x8 | REG_MODE         | UBYTE |
| 0x1 | MODE         | UBYTE | 0x9 | OVERLOAD         | UBYTE |
| 0x2 | SPEED        | SBYTE | 0xA | REG_P_VAL        | UBYTE |
| 0x3 | ACTUAL_SPEED | SBYTE | 0xB | REG_I_VAL        | UBYTE |
| 0x4 | TACH_COUNT   | SLONG | 0xC | REG_D_VAL        | UBYTE |
| 0x5 | TACH_LIMIT   | ULONG | 0xD | BLOCK_TACH_COUNT | SLONG |
| 0x6 | RUN_STATE    | UBYTE | 0xE | ROTATION_COUNT   | SLONG |
| 0x7 | TURN_RATIO   | SBYTE |     |                  |       |

FLAGS: 0x01 update mode, 0x02 update speed, 0x04 update tacho limit, 0x08 reset count,
0x10 update PID, 0x20 reset block count, 0x40 reset rotation count. MODE: 0x01 motor on,
0x02 brake, 0x04 regulated (0 = coast). REG_MODE: 0 idle, 1 speed, 2 sync. RUN_STATE: 0x00
idle, 0x10 ramp up, 0x20 running, 0x40 ramp down. TURN_RATIO −100…100 with two synced ports
(A+B, B+C or A+C; the first is "left").

## System calls (OP_SYSCALL)

Each call takes one cluster; its first field is the return value. Those the compiler uses:

| Id   | Call                 | Parameter cluster                                                                             |
| ---- | -------------------- | --------------------------------------------------------------------------------------------- |
| 0x00 | NXTFileOpenRead      | status UWORD, handle UBYTE, filename string, length ULONG                                     |
| 0x01 | NXTFileOpenWrite     | status UWORD, handle UBYTE, filename string, length ULONG                                     |
| 0x02 | NXTFileOpenAppend    | status UWORD, handle UBYTE, filename string, length ULONG                                     |
| 0x03 | NXTFileRead          | status UWORD, handle UBYTE, buffer string, length ULONG                                       |
| 0x04 | NXTFileWrite         | status UWORD, handle UBYTE, buffer string, length ULONG                                       |
| 0x05 | NXTFileClose         | status UWORD, handle UBYTE                                                                    |
| 0x06 | NXTFileResolveHandle | status UWORD, handle UBYTE, write? UBYTE, filename string                                     |
| 0x08 | NXTFileDelete        | status UWORD, filename string                                                                 |
| 0x09 | NXTSoundPlayFile     | status SBYTE, filename string, loop UBYTE, volume UBYTE (0–4)                                 |
| 0x0A | NXTSoundPlayTone     | status SBYTE, frequency UWORD, duration UWORD, loop UBYTE, volume UBYTE                       |
| 0x0B | NXTSoundGetState     | state UBYTE, flags UBYTE (0 idle, 1 pending, 2 running)                                       |
| 0x0C | NXTSoundSetState     | state UBYTE, state UBYTE (4 = stop), flags UBYTE                                              |
| 0x0D | NXTDrawText          | status SBYTE, location (X SWORD, Y SWORD), text string, options ULONG                         |
| 0x0E | NXTDrawPoint         | status SBYTE, location (X, Y), options ULONG                                                  |
| 0x0F | NXTDrawLine          | status SBYTE, start (X, Y), end (X, Y), options ULONG                                         |
| 0x10 | NXTDrawCircle        | status SBYTE, center (X, Y), radius UBYTE, options ULONG                                      |
| 0x12 | NXTDrawPicture       | status UBYTE, location (X, Y), filename string, variables SLONG[], options ULONG              |
| 0x14 | NXTReadButton        | status SBYTE, index UBYTE (1 right, 2 left, 3 enter), pressed UBYTE, count UBYTE, reset UBYTE |
| 0x15 | NXTCommLSWrite       | status SBYTE, port UBYTE, buffer UBYTE[], return length UBYTE                                 |
| 0x16 | NXTCommLSRead        | status SBYTE, port UBYTE, buffer UBYTE[], buffer length UBYTE                                 |
| 0x17 | NXTCommLSCheckStatus | status SBYTE (32 = busy), port UBYTE, bytes ready UBYTE                                       |
| 0x18 | NXTRandomNumber      | result SWORD                                                                                  |
| 0x19 | NXTGetStartTick      | result ULONG                                                                                  |
| 0x1A | NXTMessageWrite      | status SBYTE, queue UBYTE (0–9; slaves write 10–19), message string                           |
| 0x1B | NXTMessageRead       | status SBYTE (64 = empty), queue UBYTE, remove UBYTE, message string                          |
| 0x1C | NXTCommBTCheckStatus | status SBYTE (32 = busy), connection UBYTE                                                    |
| 0x1D | NXTCommBTWrite       | status SBYTE, connection UBYTE, buffer UBYTE[] (up to 256)                                    |

Drawing: y = 0 is the bottom row; text y is rounded down to a multiple of 8 (line 1 = y 56).
Options bit 0 clears the screen first. File status codes are u16: 0 success, 0x8500 end of
file, 0x8700 not found, 0x8F00 exists (the full list is on p. 52).

Ultrasonic sensor (I2C, _Appendix 7_): port type LOWSPEED_9V, mode raw; write
`02 42` with return length 1 to read the distance in cm ("measurement byte 0").
