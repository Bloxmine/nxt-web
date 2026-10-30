# NXT Web Studio — working agreements

Browser-based visual programming for the NXT brick. Full roadmap in [PLAN.md](PLAN.md);
code layout and dependency rules in [docs/architecture.md](docs/architecture.md).

## Commands

- `pnpm dev`: run the app at http://localhost:5173
- `pnpm check`: lint, format check, typecheck, test and build (what CI runs)
- `pnpm --filter @nxt/protocol test`: test one package

## Decisions already made

- React + Tailwind (v4) for UI, MIT licence, Bluetooth (Web Serial) included in v1 as experimental.
- Hosting target not chosen yet; keep the build host-agnostic (relative paths, no server).
- TypeScript is pinned to 6.0 because typescript-eslint does not support 7 yet.
- Packages are consumed as source (`exports` → `src/index.ts`); there is no per-package build.
- Do not swap any choice in PLAN.md's "Tech stack" table without asking.
- The editor is a classic sequence-beam editor in the style of the original NXT 2.0
  software (layout, colours, data hubs, wires, parallel beams), with a 2000s look.
  Blockly is planned later as an optional "modern" mode; both lower to the same IR.
- Blocks use original artwork (FatCow icons, CC BY 3.0 – keep the credit in the About
  dialog and NOTICE). No LEGO logos, artwork or screenshots in the repo.
- Opening original `.rbt` programs one-to-one is a goal: see docs/rbt-compat.md.
  Third-party sample programs live only in git-ignored `fixtures/external/`.

## How to work

1. Work one phase at a time, in order. Do not start a phase until the previous one's acceptance criteria are met or the human waives them.
2. Before coding a phase, restate its goal and plan in a few lines, and list anything that needs a decision.
3. Prefer small commits with clear messages; keep `main` green (lint, typecheck, test, build).
4. Write tests with the code, not after. Anything touching bytes needs a fixture or golden test.
5. Do not invent protocol details. Take opcodes, packet layouts, and file formats from the documents in `docs/spec/`. If a document is missing, stop and ask the human to add it.
6. Keep core packages free of DOM and browser APIs. Only `apps/web` and the transport implementations touch them.
7. When a phase needs real hardware, write the checklist in `docs/hardware-tests.md`, then stop and ask the human to run it.
8. Do not add dependencies without a one-line justification in the PR or commit message.
9. Never copy LEGO artwork, icons, or product names into the repo.

## Definition of done for any task

- Types, lint, and tests pass
- Behaviour matches the phase's acceptance criteria
- Public functions in `nxt-*` packages have short doc comments
- `docs/` is updated if setup or behaviour changed

## Progress

- [x] Phase 0: Scaffolding (waiting on: manual browser check)
- [ ] Phase 1: NXT protocol over WebUSB — code done; waiting on docs/hardware-tests.md Phase 1
- [ ] Phase 2: Classic editor and block set — done except workspace search; Blockly mode later
- [ ] .rbt import — container reader done; instances and diagram next (docs/rbt-compat.md)
- [ ] Phase 3: Compiler to .rxe bytecode
- [ ] Phase 4: Upload, run, and live monitoring
- [ ] Phase 5: File manager, firmware tools, and Bluetooth
- [ ] Phase 6: Polish, offline, and release
