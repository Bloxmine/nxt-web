# Sound (.rso) and picture (.ric) files

LEGO did not publish these formats in the developer kits we have. The layouts below come
from community documentation; anything not confirmed there is marked.

## .rso sound files

Source: [MultimediaWiki, "RSO"](https://wiki.multimedia.cx/index.php/RSO), consistent with
the SoX RSO patch notes (8 kHz mono only works reliably).

| Bytes | Field (big-endian u16)                             |
| ----- | -------------------------------------------------- |
| 0–1   | Codec: 0x0100 unsigned 8-bit PCM, 0x0101 IMA ADPCM |
| 2–3   | Length of the sample data (header excluded)        |
| 4–5   | Sample rate (Hz)                                   |
| 6–7   | Loop flag                                          |
| 8…    | Samples                                            |

`@nxt/media` reads and writes 8-bit PCM. ADPCM files are recognised but not decoded.

## .ric picture files

Source: the RIC macros in the NBC/NXC API documentation
([bricxcc.sourceforge.net/nbc/doc/nbcapi/group___r_i_c_macros.html](https://bricxcc.sourceforge.net/nbc/doc/nbcapi/group___r_i_c_macros.html)).

A file is a list of instructions. Each is `u16 length` (bytes that follow the length
field), `u16 opcode`, then little-endian u16 arguments:

| Op  | Name        | Arguments after the opcode                            |
| --- | ----------- | ----------------------------------------------------- |
| 0   | Description | options, width, height                                |
| 1   | Sprite      | address, rows, bytes per row, bitmap (padded to even) |
| 2   | VarMap      | address, count, count × (domain, range)               |
| 3   | CopyBits    | options, sprite address, src x, y, w, h, dest x, y    |
| 4   | Pixel       | options, x, y, value                                  |
| 5   | Line        | options, x1, y1, x2, y2                               |
| 6   | Rect        | options, x, y, width, height                          |
| 7   | Circle      | options, x, y, radius                                 |
| 8   | NumBox      | options, x, y, value                                  |
| 9   | Ellipse     | options, x, y, rx, ry (enhanced firmware)             |
| 10  | Polygon     | options, count, count × (x, y) (enhanced firmware)    |

Arguments with bit 0x1000 set refer to drawing parameters (`RICArg`); these are not
supported by the renderer.

**To be confirmed on a brick** (the macros do not say): sprite bit order (we use most
significant bit = leftmost pixel, first row = top) and that CopyBits' destination is
the bottom-left corner, with y counted upwards like the rest of the screen API.
