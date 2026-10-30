# .rxe executable file format

Source: _LEGO MINDSTORMS NXT Executable File Specification_, v1.0 (2006), for NXT firmware
1.03 ("Executable File Format", pp. 13–30). The PDF is mirrored in open-source NXT projects
(for example `doc/NXT/Executable File Specification.pdf` in Chris00/ocaml-mindstorm).
Instructions, port properties and system calls are in [vm-opcodes.md](vm-opcodes.md).

Version 1.0 describes integers only. The NXT 2.0 firmware (1.28+) adds floating point and
the color sensor; no specification for those additions was found, see "Beyond v1.0" below.

All multi-byte fields are **little-endian** except the version number in the header. Every
segment starts on an even byte offset (pad with one byte; the original software uses 0xFF).

## Segments

| Segment       | Bytes    | Contents                                            |
| ------------- | -------- | --------------------------------------------------- |
| File header   | 38       | Format string, dataspace header, counts             |
| Dataspace     | variable | DSTOC, static default data, dynamic default data    |
| Clump records | variable | n × 4-byte records, then the packed dependent lists |
| Codespace     | variable | Code words (u16), no padding between instructions   |

## File header

| Offset | Size | Field                                                                      |
| ------ | ---- | -------------------------------------------------------------------------- |
| 0      | 16   | `MindstormsNXT\0` then version `0x0005` **big-endian** (`... 54 00 00 05`) |
| 16     | 2    | DSTOC record count (max 16,383)                                            |
| 18     | 2    | Initial size: RAM for static + dynamic data                                |
| 20     | 2    | Static size (multiple of 4)                                                |
| 22     | 2    | Default data size (static + dynamic default streams)                       |
| 24     | 2    | Dynamic default offset (= size of the static default stream)               |
| 26     | 2    | Dynamic default size                                                       |
| 28     | 2    | Memory manager head (DV index)                                             |
| 30     | 2    | Memory manager tail (DV index)                                             |
| 32     | 2    | Dope vector offset (in RAM, from the start of the dataspace)               |
| 34     | 2    | Clump count (max 255)                                                      |
| 36     | 2    | Code word count                                                            |

## Dataspace table of contents (DSTOC)

4-byte records: `u8 type, u8 flags, u16 data descriptor`. Flags `0x01` = fill with zeros
(no default in the stream).

| Code | Type       | Data descriptor                                                         |
| ---- | ---------- | ----------------------------------------------------------------------- |
| 0    | TC_VOID    | —                                                                       |
| 1    | TC_UBYTE   | Offset in RAM (top level) or inside an array element (sub-type)         |
| 2    | TC_SBYTE   | ″                                                                       |
| 3    | TC_UWORD   | ″                                                                       |
| 4    | TC_SWORD   | ″                                                                       |
| 5    | TC_ULONG   | ″                                                                       |
| 6    | TC_SLONG   | ″                                                                       |
| 7    | TC_ARRAY   | Offset of the array's u16 dope vector index; next record = element type |
| 8    | TC_CLUSTER | Number of fields; the field records follow                              |
| 9    | TC_MUTEX   | Offset of the 32-bit mutex record                                       |

- Arrays are addressed by their top-level record only; element records are not addressable.
- Cluster fields are addressable on their own; a whole cluster is addressed by its record.
- Text is an array of UBYTE ending in a 0 byte.
- Booleans are UBYTE: 0 false, anything else true.

## Default data

**Static stream**: values for top-level items in DSTOC order, tightly packed (no
alignment), only for records without flag 0x01. Arrays always store their u16 DV index.
Mutexes store `FF FF FF FF`.

**Dynamic stream**: a byte image copied to RAM at the dope vector offset: the dope vector
array (DVA) first, then each array's elements, each array on a 4-byte boundary.

Dope vector (5 × u16): offset in RAM (0xFFFF for empty), element size, element count,
back pointer (unused), link index. DV 0 is the root (it describes the DVA itself:
offset = DV offset, element size 10, count = number of DVs, link 0xFFFF). Non-root DVs form
a linked list in order of ascending offset; the last link is 0xFFFF; header fields give the
head and tail.

## Clump records

`u8 fire count, u8 dependent count, u16 code start (code word index)`, one per clump,
then all dependent lists (u8 clump indexes) packed in clump order. Clumps with fire count 0
start when the program starts. Subroutine clumps end with OP_SUBRET, others with
OP_FINCLUMP / OP_FINCLUMPIMMED.

## Instruction encoding

Instructions are one or more code words. **Bit numbering in the spec runs from the most
significant bit of each byte**, so for the first word read as a little-endian u16:

```
word = opcode | flags << 8 | size << 12
  opcode  bits 0–7 of the word (first byte)
  flags   low nibble of the second byte: bit 3 = short encoding, bits 0–2 = comparison code
  size    high nibble of the second byte: instruction size in bytes; 0xE = size in next word
```

Example from the spec: `OP_ADD 0, 1, 2` is bytes `00 80 00 00 01 00 02 00` (word 0x8000:
opcode 0, size 8). `OP_FINCLUMP -1, -1` is `2A 60 FF FF FF FF`.

Variable-length instructions (OP_ARRBUILD, OP_STRCAT, OP_SETOUT) always have size nibble
0xE and their total size in bytes as the first argument.

Short encoding (flags bit 3 set) exists for MOV, ACQUIRE, RELEASE and SUBCALL; this
project's compiler does not use it.

Arguments are dataspace item ids (DSTOC indexes, 14 bits) or immediates, depending on the
instruction. `NOT_A_DS_ID` = 0xFFFF.

## Example (spec p. 28): the 84-byte "add two numbers" program

```
4D69 6E64 7374 6F72 6D73 4E58 5400 0005 0300 1600 0C00 0F00 0500 0A00 0000 0000
0C00 0100 0700 0601 0000 0600 0400 0100 0800 8813 0000 010C 000A 0001 00FF FFFF
FFFF 0000 0000 0080 0000 0100 0200 2A60 FFFF FFFF
```

`packages/nxt-rxe/src/rxe.test.ts` rebuilds this file and checks it byte for byte.

## Beyond v1.0 (to be confirmed on hardware)

| Item                               | Value used                                                                     | Source                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Branch offsets (JMP, BRCMP, BRTST) | Signed code-word count from the first word of the branch instruction           | Not stated in the spec; consistent with its "adjust the program counter" wording and with other NXT compilers |
| Color sensor types                 | COLORFULL 0x0D, COLORRED 0x0E, COLORGREEN 0x0F, COLORBLUE 0x10, COLORNONE 0x11 | NXT 2.0 firmware (1.28+), as published in the NBC/NXC documentation; not in v1.0                              |
| Floating point                     | Not used: numbers are 32-bit integers                                          | v1.0 has no floats; NXT-G 2.0 programs that rely on fractions behave differently                              |
