# Compatibility with classic NXT-G (.rbt) programs

Goal: open programs made with the original NXT 2.0 software and get the same program in
NXT Web Studio, block for block. File → Open (or dropping a file on the window) accepts
`.rbt` files. The importer lives in `packages/nxt-rbt`.

There is no published specification for this format. Everything below was worked out from
real files; nothing was copied from LabVIEW or LEGO software. Where a value's meaning is
inferred rather than certain, the confidence table says so.

## Test corpus

`pnpm fetch:nxtprograms` downloads the NXT 2.0 programs published on
[nxtprograms.com](https://www.nxtprograms.com/index2.html) into
`fixtures/external/nxtprograms/` (15 `.rbt` files from 24 projects; the others come as
zips). Their [usage policy](https://www.nxtprograms.com/copyright.html) allows personal
use but not redistribution, so the folder is git-ignored. Tests that need the files skip
when it is empty (as in CI).

**Status: all 15 programs import, validate and lower to IR.** Behaviour checks against
the projects' published descriptions (BumperCar, GuitarTones, Drive_Test, Explorer,
ForkliftTest) pass. Remaining notes per file are listed at the end.

## File structure

An `.rbt` is a LabVIEW 7 resource container ("RSRC", file type `LVIN`, creator `LBVW`).
All numbers are big-endian unless noted.

### Container

```
0x00  "RSRC\r\n"  u16 version  "LVIN"  "LBVW"
0x10  u32 index offset  u32 index size  u32 data offset  u32 data size
index+0x34  u32 type count − 1, then 12-byte type entries:
            4cc type, u32 count − 1, u32 offset (from index+0x34)
entries:    20 bytes: i32 id, i32 name offset, u32 ?, u32 data offset, u32 ?
data:       u32 size, then bytes (at data offset + entry data offset)
```

### Resources used

| Resource | Meaning                                                                  |
| -------- | ------------------------------------------------------------------------ |
| `BDHP`   | Block diagram heap of the program: beams, blocks, structures, wires      |
| `LIbd`   | Block-diagram linker info: which heap node uses which block instance     |
| `LIvi`   | VI linker info: each block instance's connector pane (plug names, types) |
| `VINS`   | Block instances. Entry _n_ is a complete embedded VI (another RSRC)      |

Inside each instance VI:

| Resource | Meaning                                                                |
| -------- | ---------------------------------------------------------------------- |
| `VITS`   | VI tags: template path and, for some blocks, a typed settings cluster  |
| `DFDS`   | Front-panel default data: settings of blocks that have no settings tag |
| `TITL`   | The label shown under the block                                        |

### Type descriptors and flattened data (`VITS`, `LIvi`)

```
u16 size (whole descriptor)  u8 flags  u8 type  …type-specific…  [label]
```

Flag `0x40` = ends with a Pascal-string label. Types: `0x01–0x0A` numbers (I8 I16 I32 I64
U8 U16 U32 U64 SGL DBL), `0x15/16/17` enum U8/U16/U32 (u16 count + names), `0x21`
boolean, `0x30` string, `0x32` path, `0x40` array, `0x50` cluster (u16 count + fields),
`0xF0` connector pane, `0xF1` type definition (u32 id, Pascal name, pad to even, inner type).
Flattened data follows the type in order: numbers big-endian, strings as u32 length + bytes,
booleans one byte, paths as `PTH0`, u32 length, u16 type, u16 count, Pascal strings.

### VI tags (`VITS`)

`u32 count`, then per tag: `u32 name length`, name, `u32 size` (including itself), type
descriptor, flattened data. Tags seen:

| Tag                         | Content                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `_OriginalInstancePath`     | Block template, e.g. `<vilib>/LEGO/Blocks/Move/Move.vi`                             |
| `MerlotMoveBlockConfig`     | Goal, Power, Steering, Goal Type, Next, Direction, motor ports                      |
| `MerlotMotorBlockConfig`    | Connection, Direction, Action, Power, Distance, Wait, Next, Distance Type, Regulate |
| `MerlotSoundBlockConfig`    | (mode) Tone/Sound, Volume, Action, Filename, Tone, Duration, Wait, Repeat           |
| `DistanceSensorBlockConfig` | Plug Selector, Polarity, Comparison, Units                                          |
| `ColorLampBlockConfig`      | Port, Floodlight, Lamp Color                                                        |
| `VarName`                   | Variable block's variable name                                                      |

### Diagram heap (`BDHP`)

After a 56-byte header, a run of blocks: used block = `u32 size` (even), `u32 ?`,
`u32 class`, body; free block = `u32 size | 1`. Objects point at each other by the offset of
their body (block + 12). Every body starts with `u32 flags, u32 owner`.

| Class | Object                              | Notes                                                              |
| ----- | ----------------------------------- | ------------------------------------------------------------------ |
| 27    | Diagram                             | Owner: none (top level), a loop, or a switch                       |
| 49    | Block node                          | Rect at +16; instance via `LIbd`                                   |
| 51    | Block terminal                      | +0 flags (bit 0 = output, 0x200 = on hub); +36 connector slot      |
| 33    | Loop                                | Body diagram is its child                                          |
| 44    | Switch                              | +52 → case list (`u32 n`, then diagram pointers in case order)     |
| 34/45 | Loop/switch tunnel                  | Same object for the inner and outer side                           |
| 36/37 | Loop iteration / condition terminal |                                                                    |
| 46    | Switch selector                     |                                                                    |
| 23    | Wire                                | +20 style (`0x18` = sequence beam, `0x05` = data), +21 type code   |
| 21    | Connection                          | +8 → wire, +12 → terminal; owner class 29 = inner side of a tunnel |
| 29    | Diagram terminals                   | Holder of a diagram's inner tunnel ends                            |

### Connector panes (`LIvi`)

Per instance: `LVIN`, Pascal name `Instance n …`, pad to even, `u32 1`, `i32 −1`, then a
`0xF0` descriptor: `u16 size, u8 flags, 0xF0, u16 slot count, u16 ?, u16 entry per slot`
(0 = unused; high byte usage flags, low byte paired slot), then **one type descriptor per
slot** (empty 4-byte descriptor for unused slots). A node terminal's slot indexes this list,
which gives plug names such as `Power`, `Sequence Flow` (beam in) and `Sequence Flow 2`
(beam out).

## How the original's structures map

| Original                           | Stored as                                                        | Imported as                  |
| ---------------------------------- | ---------------------------------------------------------------- | ---------------------------- |
| Sequence beam                      | Wires of style `0x18` between `Sequence Flow` terminals          | Block order                  |
| Parallel beam                      | Start block's beam output going to several blocks                | `program.parallel`           |
| Wait for time                      | Loop with `LoopTermTimeWait` (or empty loop with `LoopTermTime`) | Wait (time)                  |
| Wait for sensor                    | Loop whose only block is a sensor wired to the loop condition    | Wait (sensor)                |
| Loop forever / count / time        | Loop + `LoopCntCount` / `LoopTermCount` / `LoopTermTime`         | Loop                         |
| Loop until sensor / logic          | Hidden sensor (or wire) into the loop condition terminal         | Loop                         |
| Sensor switch                      | Hidden sensor block wired into the switch selector               | Switch (condition)           |
| Logic switch / value switch        | Data wire into the selector; cases in case-list order            | Switch (logic / value cases) |
| Data wire through a loop or switch | Wire → tunnel → wire                                             | One wire                     |

Boolean switches store their cases as [true, false] (checked against Explorer's documented
behaviour). Loop and wait times are stored in milliseconds (u32 at 0xCC of the terminator's
`DFDS`). Durations: Goal Type / Distance Type 0 = unlimited, 1 = degrees, 2 = rotations,
3 = seconds.

## Block settings and confidence

| Block          | Source               | Fields                                                                              | Confidence                                          |
| -------------- | -------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| Move           | settings tag         | ports, direction, steering, power, duration, next                                   | High                                                |
| Motor          | settings tag         | port, direction, power, regulation, duration, wait, next                            | High                                                |
| Sound          | settings tag         | tone/file, frequency, duration, volume, wait, repeat, stop                          | High                                                |
| Ultrasonic     | settings tag         | port, compare (1 = "<"), value, units (0 = cm)                                      | High (units checked against a variable named "cm")  |
| Color Lamp     | settings tag         | port, on/off, color (0 red, 1 green, 2 blue)                                        | High                                                |
| Variable       | `VarName` tag + plug | name, read/write (direction of Value plug), type (plug type)                        | High; written constants default to 0                |
| Display        | `DFDS`               | text (u32 length + text at 0xC0), image name                                        | Medium; X/Y position not decoded                    |
| Touch          | `DFDS`               | port (u32 at 0xC0), action                                                          | Port high; action medium                            |
| NXT Buttons    | `DFDS`               | button (u16 at 0xC0: 1 right, 2 left, 3 enter), action (u16 at 0xC4)                | Medium                                              |
| Rotation       | `DFDS`               | port (u32 at 0xC0), degrees (u32 at 0xC4)                                           | Medium                                              |
| Timer          | `DFDS`               | timer number                                                                        | Low; trigger value not decoded                      |
| Math           | `DFDS`               | B (float after two range triples), operation (u16 after B; 0 add 1 sub 2 mul 3 div) | Medium                                              |
| Compare        | `DFDS`               | B, operation (u16 before three u32 3s; 0 < 1 > 2 =)                                 | Medium                                              |
| Logic          | `DFDS`               | operation (u16 before three u32 4s; 0 and 1 or 2 xor 3 not)                         | Medium                                              |
| Range          | `DFDS`               | low, high, test value (floats)                                                      | Medium; inside/outside not decoded (inside assumed) |
| Text           | `DFDS`               | A, B, C (u32 length + text each)                                                    | High                                                |
| Number to Text | —                    | (no settings)                                                                       | High                                                |

`DFDS` stores front-panel defaults sparsely: values equal to the default are left out, which
is why some fields are found by anchors rather than fixed offsets.

## Corpus notes

- **ClawStrike, ForkliftTest:** ultrasonic distances in centimetres (see above).
- **ForkliftTest:** one loop is not connected to any beam; the original never runs it, so it
  is left out (the importer says so).
- **Timer blocks:** the trigger value is not yet decoded; it only matters when the timer's
  yes/no output is used.

## Next steps

1. Decode the remaining `DFDS` fields (Display X/Y, Range inside/outside, Timer trigger,
   Variable constant values) with more sample programs.
2. Fetch the zipped projects (`.rbtx` Pack-and-Go) to grow the corpus.
3. Light and Sound sensor blocks and NXT 2.0 Color Sensor blocks do not appear in this
   corpus; their importers fall back to defaults with a warning until samples are found.
4. Export back to `.rbt` (one-to-one round trip) once the compiler is done.
