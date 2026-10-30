# Specification excerpts

Opcode values, packet layouts and the `.rxe` file structure must come from LEGO's
published developer documents, not from memory. The tables here are transcribed from those
documents; code comments cite them (for example `// docs/spec/direct-commands.md, PLAYTONE`).

| File                 | Source document                                                                       | Status |
| -------------------- | ------------------------------------------------------------------------------------- | ------ |
| `telegram.md`        | Bluetooth Developer Kit, Appendix 1 (Communication protocol) v1.00, pp. 6, 16, 22, 24 | Done   |
| `direct-commands.md` | Bluetooth Developer Kit, Appendix 2 (Direct commands) v1.00, pp. 4–12                 | Done   |
| `system-commands.md` | Bluetooth Developer Kit, Appendix 1 (Communication protocol) v1.00, pp. 7–21          | Done   |
| `usb.md`             | Appendix 1 p. 24, plus USB IDs cross-checked against nxt-python                       | Done   |
| `rxe.md`             | Executable File Specification v1.0 (firmware 1.03), file format chapter               | Done   |
| `vm-opcodes.md`      | Executable File Specification v1.0, instruction reference; Ultrasonic I2C Appendix 7  | Done   |

The Bluetooth Developer Kit is `bdk_download1.zip` and the Software Developer Kit is
`sdk_download1.zip`, both formerly on LEGO's MINDSTORMS downloads page. Copies of the
original PDFs are mirrored in several open-source NXT projects on GitHub.
