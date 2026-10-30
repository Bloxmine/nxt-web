# Compatibility with classic NXT-G (.rbt) programs

Goal: open programs made with the original NXT 2.0 software and get the same
program in NXT Web Studio, block for block. Eventually one-to-one.

## Test corpus

`pnpm fetch:nxtprograms` downloads the NXT 2.0 programs published on
[nxtprograms.com](https://www.nxtprograms.com/index2.html) into
`fixtures/external/nxtprograms/` (currently 15 `.rbt` files from 24 projects).

These files are © nxtprograms.com. Their [usage policy](https://www.nxtprograms.com/copyright.html)
allows downloading for personal use but not reproduction, so the folder is
git-ignored and the files must never be committed. Tests that need them skip
automatically when the folder is empty (for example in CI).

## What a .rbt file is

A LabVIEW resource container (`RSRC`, file type `LVIN`, creator `LBVW`), because
the original software was built on LabVIEW. There is no public specification;
everything here was worked out from sample files.

| Part                 | What it holds                                                     | Status              |
| -------------------- | ----------------------------------------------------------------- | ------------------- |
| Container index      | Resource types, ids and data offsets                              | Parsed (`@nxt/rbt`) |
| `VINS`               | One embedded VI instance per placed block (≈ blocks + structures) | Next                |
| `BDHP`               | Block diagram heap: block positions, beams, wires, structures     | To decode           |
| `DFDS`, `TRec`       | Default data and type records (block settings)                    | To decode           |
| `LIvi`/`LIbd`/`LIds` | Linker info: which block VIs are used                             | Names extracted     |

Layout of the container (big-endian):

```
0x00  "RSRC\r\n"  u16 version  "LVIN"  "LBVW"
0x10  u32 index offset  u32 index size  u32 data offset  u32 data size
index+0x34  u32 type count − 1, then 12-byte type entries:
            4cc type, u32 count − 1, u32 offset (from index+0x34)
entries:    20 bytes: i32 id, i32 name offset, u32 ?, u32 data offset, u32 ?
data:       u32 size, then bytes (at data offset + entry data offset)
```

## Blocks used by the corpus

From `linkedViNames()` over the 15 programs (number of programs using each):

| Original block                 | Programs | NXT Web Studio block               |
| ------------------------------ | -------- | ---------------------------------- |
| Move                           | 13       | Move                               |
| Loop (count/time/sensor)       | 12       | Loop                               |
| Motor                          | 8        | Motor                              |
| Sound                          | 8        | Sound                              |
| Touch sensor ("Bumper")        | 7        | Touch sensor / Wait / Switch       |
| Math ("Numeric Operations")    | 7        | Math                               |
| Compare                        | 7        | Compare                            |
| Variable                       | 7        | Variable                           |
| Ultrasonic ("Distance Sensor") | 5        | Ultrasonic sensor                  |
| Display                        | 5        | Display                            |
| Range                          | 4        | Range                              |
| NXT Buttons                    | 4        | NXT buttons                        |
| Light sensor                   | 3        | Light sensor                       |
| Rotation sensor                | 3        | Rotation sensor                    |
| Timer                          | 2        | Timer                              |
| Number to Text                 | 2        | Number to text                     |
| Logic                          | 1        | Logic                              |
| Text                           | 1        | Text                               |
| Color Lamp                     | 1        | **Missing** (NXT 2.0 color sensor) |

## Plan

1. **Instances:** decode each `VINS` entry into its block type and settings.
2. **Diagram:** decode `BDHP` into beams, block order, loop/switch nesting,
   parallel beams and data wires.
3. **Mapping:** convert to our `Program` model; report anything unsupported per
   block instead of failing the whole file.
4. **Corpus tests:** for every corpus file, import must succeed with no
   unsupported blocks, and lowering to IR must succeed. Track a pass rate.
5. **Missing blocks:** add the Color sensor and Color lamp blocks.
6. **Round-trip:** compiled output of an imported program should behave like the
   original's `.rxe` on a brick (hardware check).
