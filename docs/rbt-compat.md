# Compatibility with classic NXT-G (.rbt) programs

Goal: open programs made with the original NXT 2.0 software and get the same program in
NXT Web Studio, block for block. File → Open accepts
`.rbt` files. The importer lives in `packages/nxt-rbt`.

There is no published specification for this format. Everything below was worked out from
real files; nothing was copied from LabVIEW or LEGO software. Where a value's meaning is
inferred rather than certain, the confidence table says so.

## Test corpus

`pnpm fetch:nxtprograms` downloads the NXT 2.0 programs published on
[nxtprograms.com](https://www.nxtprograms.com/index2.html) into
`fixtures/external/nxtprograms/` (36 `.rbt` files from 24 projects, including programs
unpacked from the projects' zip downloads). Their [usage policy](https://www.nxtprograms.com/copyright.html) allows personal
use but not redistribution, so the folder is git-ignored. Tests that need the files skip
when it is empty (as in CI).

**Status: all 36 programs import, validate and lower to IR.** The only remaining note is a
loop in ForkliftTest that is not connected to any beam (the original never runs it). Behaviour
checks against the projects' descriptions pass for BumperCar, GuitarTones, Drive_Test,
Explorer, ForkliftTest, CheckoutScan, DataLogLight, LightMeter, 5ButtonRemote/5ButtonSteer
and ColorRace.

### NXT 1.0 programs

The same script also downloads the site's NXT 1.0 projects into
`fixtures/external/nxtprograms1/` (84 `.rbt` files, made with NXT-G 1.x; also
git-ignored). **Status: 44 import without notes and run; all import without errors.**
NXT-G 1.x blocks not supported yet, with the programs that use them:

| Block           | Programs | Settings (by name)                                                     |
| --------------- | -------- | ---------------------------------------------------------------------- |
| Rotation Sensor | 22       | Connection, Threshold, Distance Type, Polarity, Direction, Reset       |
| Range           | 8        | A, B, Value, Polarity                                                  |
| Calibration     | 6        | Connection, SensorType, Maximum, Restore Default (no editor block yet) |
| Abort           | 4        | Abort (stops the program)                                              |
| File Access     | 3        | Mode, Type, Filename, File Size, Text In, Number In                    |
| Message Read    | 2        | Mailbox, MessageType, Timeout (200ms)                                  |
| Message Write   | 2        | Message Connection, Mailbox, MessageType, Timeout                      |

All their settings can be read by name; what each value means still has to be checked
against the programs, as was done for Math and Compare. Switches whose value came from
one of these blocks fall back to their default case (the importer says so).

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
| Random         | `DFDS`, by name      | A = minimum, B = maximum                                                            | High (checked against the game's three positions)   |

**NXT-G 1.x data blocks.** NXT 1.0 programs use the older whole-number blocks
`Numeric Operations`, `Numeric Comparison` and `Number To Text` (the NXT 2.0 ones are
`FP …`). Their plugs are 32-bit integers and their settings are read by name from the
type map (`A`, `B`, `Operation`, with the same operation numbers as the FP blocks); the
offsets of the FP layout give the same values. Checked on Whack-a-Brick, where the
results make sense in the game (brick drawn at x = position × 34 − 24, score + 1,
delay − 15, position = button). Saving back writes them as integers.

`DFDS` stores front-panel defaults sparsely: values equal to the default are left out, which
is why some fields are found by anchors rather than fixed offsets.

## Corpus notes

- **ClawStrike, ForkliftTest:** ultrasonic distances in centimetres (see above).
- **ForkliftTest:** one loop is not connected to any beam; the original never runs it, so it
  is left out (the importer says so).
- **Timer blocks:** the trigger value is not yet decoded; it only matters when the timer's
  yes/no output is used.

## Pack and Go (.rbtx)

An `.rbtx` is a plain zip (deflate). It holds the program's `.rbt`, one `.rbt` per My
Block, the `.rso`/`.ric` files it uses, and `rbtDistro.ini`, which lists every file with
its destination: `<PROFILE DIR>` for the program, `<PROFILE DIR>:::Blocks:::My Blocks` for
My Blocks and `<MINDSTORMS DIR>:::Sounds` for sounds. Checked against four SuGO programs
from sugobot.com (`pnpm fetch:nxtprograms` downloads them into the git-ignored
`fixtures/external/rbtx/`).

A My Block call is a block node whose template is the My Block's own file
(`Drive Timed.rbt`). The importer turns it into a My Block call; `importRbtx` loads the My
Block files (and My Blocks inside them). A plain `.rbt` keeps empty My Blocks and says so.

My Block parameters come along (see "My Block parameters" below). A parameter wired to a
plug the editor does not have (for example a sensor's port) is noted.

## Front-panel default data (DFDS)

Every block instance is a complete LabVIEW 7.1 VI. Its settings are the defaults of its
front-panel controls, stored in two resources:

- `DSTM` (type map): one cluster of type descriptors (`u16 size, u8 flags, u8 type`, then
  type-specific data). Besides the usual types it uses `0x60` Block (u32 byte size),
  `0x63` AlignedBlock (u32 byte size) and `0x64` RepeatedBlock (u16 count + element type).
- `DFDS` (default data): the flattened default of every descriptor flagged `0x20`, in
  type-map order (a flagged descriptor's children are not visited). With `0x08` as well,
  the default is zero and is **left out** of DFDS. Strings are `u32 length + bytes`,
  numbers big-endian, booleans one byte; blocks are raw bytes of their declared size.
- A front-panel control is a cluster `[udf, value, dfd, txd, old, ext]`; `dfd` is its
  default, i.e. the block's setting, found by the value's label ("Power", "Steering", …).
  Loop terminators keep their setting in a labelled top-level value (`MilliSeconds`,
  `Count`).

These rules decode all 1,326 block instances in the corpus to exactly their DFDS length,
and no stored default is ever all zero bytes. `packages/nxt-rbt/src/dataspace.ts`
implements them; writing a setting sets or clears the `0x08` flag and re-flattens.

## Settings tag versus defaults

Blocks with a configuration panel also keep a settings tag (`…BlockConfig` in `VITS`); it
is what the panel shows. The defaults are what the block runs with. They are related by
conversions, worked out from every block in the corpus:

| Block      | Tag                                                            | Defaults                                                                                                  |
| ---------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Move       | Power, Direction (Forward/Backward/Stop)                       | Power signed (backward negative, 0 for Stop), Direction boolean                                           |
| Move       | Steering −10…10 (slider position)                              | Steering = sign × [0, 2, 3, 5, 6, 7, 9, 12, 17, 33, 100][\|s\|] (table found in NXT-G's SetMoveConfig.vi) |
| Move/Motor | Goal Type 0 unlimited, 1 degrees, 2 rotations, 3 seconds; Goal | Goal Type 0 / 1 / 1 / 2 (Stop: 3); Goal 0 / degrees / rotations × 360 / ms                                |
| Move/Motor | Next 0 brake / 1 coast                                         | Stop After (brake)                                                                                        |
| Motor      | Direction, Wait                                                | Direction boolean (power stays positive); Wait and Stop After only with a goal                            |
| Sound      | Action, mode (Tone/Sound)                                      | Sound Mode 0 play / 1 stop, Type 1 tone / 0 file                                                          |
| Distance   | Polarity 1, Units 1                                            | Polarity true, Inches (F) true                                                                            |

Blocks without a tag (Display, Math, Compare, Range, Random, Text, Timer, Buttons, Touch,
File, Messages, loops and waits) only have defaults.

## Writing back to .rbt (File → Save back to NXT-G)

For a program opened from an `.rbt`, changed settings are written back into that file:
both the settings tag and the defaults of each changed block are rewritten, the embedded
VI and the outer resource file are rebuilt (`rsrcWrite.ts`; rebuilding any corpus file
without changes gives the identical bytes). Supported: Move, Motor, Sound (not the file
name), Display, wait and loop time and count, Math, Compare, Range (not inside/outside),
Random, Logic, Text, number Constant, Color Lamp, and the touch, ultrasonic, timer,
rotation and button settings of waits, loops, switches and sensor blocks.

Tested on the corpus: an unchanged program exports byte for byte; every supported setting
of every block, changed, exports and imports back with the new value while all other
blocks stay the same.

Not supported yet, and refused with a clear message: adding, deleting or moving blocks,
changing wires, beams, variables or My Blocks (that needs rewriting the block-diagram
heap and creating block VIs from NXT-G's own templates), and settings not listed above.
**Not yet checked in NXT-G itself** (see docs/hardware-tests.md).

## My Block parameters

A My Block's inputs and outputs are front-panel terminals on its diagram (heap class 22).
Each points at its wire (+8) and holds an index (+40); sorted by that index they follow
the VI's front-panel controls in type-map order, which gives their names and types. A
parameter is an output when its wire starts at a block output. Calls get one plug per
parameter (from their connector pane). The editor shows parameters as parameter blocks
inside the My Block (inputs first, outputs last).

## Analysis sources

The formats above were worked out from the corpus and from LEGO's own sample programs and
block VIs in the NXT 2.0 software installer (examined locally; none of its files are in
this repository).

## Next steps

1. Decode the remaining `DFDS` fields (Display X/Y, Range inside/outside, Timer trigger,
   Variable constant values) with more sample programs.
2. Fetch the zipped projects (`.rbtx` Pack-and-Go) to grow the corpus.
3. Light and Sound sensor blocks and NXT 2.0 Color Sensor blocks do not appear in this
   corpus; their importers fall back to defaults with a warning until samples are found.
4. Export back to `.rbt` (one-to-one round trip) once the compiler is done.
