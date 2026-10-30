# Display module IO map (screen contents)

The brick's screen can be read over USB or Bluetooth with the READ IO MAP system command
(`0x94`, see [system-commands.md](system-commands.md)) on the display module. The IO map
layout is not in the Bluetooth Developer Kit; it comes from the firmware's
`c_display.iom`. The values below are transcribed from two independent sources that
were taken from the firmware sources:

- NBC/NXC API documentation, "Display module IOMAP offsets" and "NXT firmware module
  IDs" (https://bricxcc.sourceforge.net/nbc/doc/nbcapi/group___display_i_o_m_a_p.html,
  https://bricxcc.sourceforge.net/nbc/doc/nbcapi/group___module_i_d_constants.html)
- nxt-python, `nxt/command/screenshot.py` (https://github.com/schodet/nxt-python)

| Item                  | Value                                        |
| --------------------- | -------------------------------------------- |
| Display module ID     | `0x000A0001`                                 |
| Screen size           | 100 × 64 pixels                              |
| Normal screen buffer  | offset 119, 800 bytes (`Normal[8][100]`)     |
| Pop-up screen buffer  | offset 919, 800 bytes                        |
| Contrast              | offset 1719                                  |
| Bytes per READ IO MAP | 32 is what nxt-python uses (fits one packet) |

## Buffer layout

The buffer is 8 rows ("lines") of 100 bytes. Byte `line * 100 + x` holds the pixels of
column `x` for screen rows `line * 8` to `line * 8 + 7`: bit 0 is the top row of the
eight, bit 7 the bottom one. A set bit is a dark pixel. Row 0 is the top of the screen.
