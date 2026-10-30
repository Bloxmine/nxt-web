# Telegram format

Source: Appendix 1 (Communication protocol) v1.00 p. 6; Appendix 2 (Direct commands) p. 4.

## Byte 0: telegram type

| Value  | Meaning                        |
| ------ | ------------------------------ |
| `0x00` | Direct command, reply required |
| `0x01` | System command, reply required |
| `0x02` | Reply                          |
| `0x80` | Direct command, no reply       |
| `0x81` | System command, no reply       |

Bit 7 (`0x80`) set means "no reply wanted".

Byte 1 is the command (opcode). Bytes 2..N are parameters.

Every reply is `0x02, <opcode>, <status>, ...`. Status `0x00` is success.

## Sizes and encoding

- A telegram is at most **64 bytes**, including the type byte (Appendix 2 p. 4).
- All multi-byte values are **little-endian** (Appendix 2 p. 5).
- Single-byte values are unsigned unless stated (SBYTE = signed).
- Data types: UBYTE, SBYTE, UWORD (u16), SWORD (s16), ULONG (u32), SLONG (s32).
- File names are fixed **20-byte fields**: up to 15.3 characters (19 bytes) plus a null
  terminator; unused bytes are filled with nulls (Appendix 1 p. 6, p. 16).

## Bluetooth framing

Over Bluetooth each telegram is prefixed with a 2-byte little-endian length, counting the
telegram only (not the 2 length bytes). The prefix does not count toward the 64-byte
limit (Appendix 1 p. 22, Appendix 2 p. 4).

```
[len LSB] [len MSB] [type] [command] [byte 2] ...
```

Over USB telegrams are sent raw, with no prefix.

Appendix 1 p. 22 recommends sending Bluetooth commands without requesting a reply where
possible, because the radio has a ~30 ms penalty when switching direction.

## Error codes

### Direct commands (Appendix 2 p. 12)

| Code   | Meaning                                             |
| ------ | --------------------------------------------------- |
| `0x20` | Pending communication transaction in progress       |
| `0x40` | Specified mailbox queue is empty                    |
| `0xBD` | Request failed (i.e. specified file not found)      |
| `0xBE` | Unknown command opcode                              |
| `0xBF` | Insane packet                                       |
| `0xC0` | Data contains out-of-range values                   |
| `0xDD` | Communication bus error                             |
| `0xDE` | No free memory in communication buffer              |
| `0xDF` | Specified channel/connection is not valid           |
| `0xE0` | Specified channel/connection not configured or busy |
| `0xEC` | No active program                                   |
| `0xED` | Illegal size specified                              |
| `0xEE` | Illegal mailbox queue ID specified                  |
| `0xEF` | Attempted to access invalid field of a structure    |
| `0xF0` | Bad input or output specified                       |
| `0xFB` | Insufficient memory available                       |
| `0xFF` | Bad arguments                                       |

### System commands (Appendix 1 p. 16)

| Code   | Meaning               |
| ------ | --------------------- |
| `0x00` | Success               |
| `0x81` | No more handles       |
| `0x82` | No space              |
| `0x83` | No more files         |
| `0x84` | End of file expected  |
| `0x85` | End of file           |
| `0x86` | Not a linear file     |
| `0x87` | File not found        |
| `0x88` | Handle already closed |
| `0x89` | No linear space       |
| `0x8A` | Undefined error       |
| `0x8B` | File is busy          |
| `0x8C` | No write buffers      |
| `0x8D` | Append not possible   |
| `0x8E` | File is full          |
| `0x8F` | File exists           |
| `0x90` | Module not found      |
| `0x91` | Out of boundary       |
| `0x92` | Illegal file name     |
| `0x93` | Illegal handle        |

## File-name wildcards (Appendix 1 p. 16)

`Filename.Extension`, `*.[ext]`, `Filename.*`, `*.*`.
