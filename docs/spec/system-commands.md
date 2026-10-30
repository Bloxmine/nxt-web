# System commands

Source: Bluetooth Developer Kit, Appendix 1 "Communication protocol" v1.00, pp. 7–21.

Byte 0 is `0x01` (reply wanted) or `0x81` (no reply). Replies start `0x02, <opcode>,
<status>`. File names are 20-byte null-padded ASCIIZ fields. Sizes are ULONG
little-endian. Appendix 1 says replies "should not be disabled" for most of these.

| Opcode | Name                        | Request bytes 2..                                     | Reply bytes 3..                                                                                |
| ------ | --------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `0x80` | OPEN READ                   | 2–21 file name                                        | 3 handle; 4–7 file size                                                                        |
| `0x81` | OPEN WRITE                  | 2–21 file name; 22–25 file size                       | 3 handle                                                                                       |
| `0x82` | READ                        | 2 handle; 3–4 bytes to read (UWORD)                   | 3 handle; 4–5 bytes read; 6..N data                                                            |
| `0x83` | WRITE                       | 2 handle; 3..N data                                   | 3 handle; 4–5 bytes written                                                                    |
| `0x84` | CLOSE                       | 2 handle                                              | 3 handle                                                                                       |
| `0x85` | DELETE                      | 2–21 file name                                        | 3–22 deleted file name                                                                         |
| `0x86` | FIND FIRST                  | 2–21 name or wildcard                                 | 3 handle; 4–23 file name; 24–27 file size                                                      |
| `0x87` | FIND NEXT                   | 2 handle                                              | 3 handle; 4–23 file name; 24–27 file size                                                      |
| `0x88` | GET FIRMWARE VERSION        | —                                                     | 3 protocol minor; 4 protocol major; 5 firmware minor; 6 firmware major                         |
| `0x89` | OPEN WRITE LINEAR           | 2–21 file name; 22–25 file size                       | 3 handle                                                                                       |
| `0x8A` | OPEN READ LINEAR (internal) | 2–21 file name                                        | 3–6 pointer to linear memory                                                                   |
| `0x8B` | OPEN WRITE DATA             | 2–21 file name; 22–25 file size                       | 3 handle                                                                                       |
| `0x8C` | OPEN APPEND DATA            | 2–21 file name                                        | 3 handle; 4–7 available file size                                                              |
| `0x90` | REQUEST FIRST MODULE        | 2–21 module name / wildcard                           | 3 handle; 4–23 name; 24–27 module ID; 28–31 size; 32–33 IO-map size                            |
| `0x91` | REQUEST NEXT MODULE         | 2 handle                                              | as REQUEST FIRST MODULE                                                                        |
| `0x92` | CLOSE MODULE HANDLE         | 2 handle                                              | 3 handle                                                                                       |
| `0x94` | READ IO MAP                 | 2–5 module ID; 6–7 offset; 8–9 byte count             | 3–6 module ID; 7–8 bytes read; 9..N data                                                       |
| `0x95` | WRITE IO MAP                | 2–5 module ID; 6–7 offset; 8–9 byte count; 10..N data | 3–6 module ID; 7–8 bytes written                                                               |
| `0x97` | BOOT                        | 2–20 `"Let's dance: SAMBA"` + null (USB only)         | 3–6 `"Yes\0"`                                                                                  |
| `0x98` | SET BRICK NAME              | 2–17 new name (15 chars + null)                       | —                                                                                              |
| `0x9B` | GET DEVICE INFO             | —                                                     | 3–17 name (14 chars + null); 18–24 BT address; 25–28 BT signal strength; 29–32 free user flash |
| `0xA0` | DELETE USER FLASH           | —                                                     | (timeout up to ~3 s)                                                                           |
| `0xA1` | POLL COMMAND LENGTH         | 2 buffer (0 poll, 1 high speed)                       | 2 buffer; 3 status; 4 byte count                                                               |
| `0xA2` | POLL COMMAND                | 2 buffer; 3 command length                            | 2 buffer; 3 status; 4 length; 5–64 command                                                     |
| `0xA4` | BLUETOOTH FACTORY RESET     | — (not over Bluetooth)                                | —                                                                                              |

Notes:

- OPEN READ, OPEN WRITE and FIND FIRST/NEXT handles must be closed with CLOSE when done.
  On an error the firmware closes the handle itself.
- FIND FIRST returns "File not found" (`0x87`) when nothing matches.
- `.rxe` programs should be uploaded with OPEN WRITE LINEAR, since the VM runs them in place
  from flash. (Not stated explicitly in Appendix 1; to be confirmed on hardware.)
- The firmware buffers 256 bytes (one flash page) before writing it, taking ~6 ms
  (Appendix 1 p. 6).
- The GET DEVICE INFO name field is 15 bytes (3–17); the 7-byte Bluetooth address is
  followed by four signal-strength bytes and four free-flash bytes. A reply is 33 bytes.
