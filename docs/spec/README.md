# Specification excerpts

Opcode values, packet layouts and the `.rxe` file structure must come from LEGO's
published developer documents, not from memory. Put the relevant tables here and cite
them from code comments (for example `// docs/spec/direct-commands.md, PLAYTONE`).

Documents needed:

| File (to add)        | Source document                                                | Needed in |
| -------------------- | -------------------------------------------------------------- | --------- |
| `direct-commands.md` | Bluetooth Developer Kit: direct commands appendix              | Phase 1   |
| `system-commands.md` | Bluetooth Developer Kit: communication protocol appendix       | Phase 1   |
| `usb.md`             | Hardware Developer Kit: USB IDs, endpoints, packet size        | Phase 1   |
| `rxe.md`             | Executable File Specification: header, dataspace, clumps, code | Phase 3   |
| `vm-opcodes.md`      | Executable File Specification: instruction set, syscalls       | Phase 3   |

If one of these is missing when its phase starts, stop and ask for it.
