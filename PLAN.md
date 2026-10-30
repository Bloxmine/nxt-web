# NXT Web Studio: Build Plan for Claude Code

Oct 30, 2026 · @Hein Dijstelbloem

Build a browser-based visual programming environment for the LEGO MINDSTORMS NXT brick that runs on Linux and macOS in Chrome or Edge, with no install. Working title: **NXT Web Studio** (use a neutral name, not LEGO's).

## Project brief

**Goal.** Drag blocks, click Run, and the robot moves. Programs are compiled in the browser, uploaded over WebUSB, and run on the stock NXT firmware.

**In scope**

- Block editor (Blockly) with motors, sensors, sound, display, loops, conditions, variables, and custom blocks
- Own compiler from the block program to NXT `.rxe` bytecode, running fully client-side
- WebUSB transport (primary) and Web Serial transport for paired Bluetooth (secondary)
- Live sensor and motor monitor, brick file manager, firmware and battery info
- Installable PWA that works offline

**Out of scope (for now)**

- Opening or saving LEGO's proprietary `.rbt` project files
- Copying LEGO's icons, artwork, block names, or trademarks
- NXT-G's exact wire-based dataflow canvas (stay with Blockly; revisit later)
- Firefox and Safari, which lack WebUSB and Web Serial
- Mindstorms EV3, RCX, or any other brick

**Target environment**

- Chrome, Edge, Brave, or Opera, current version, on Linux and macOS
- HTTPS or `localhost` (WebUSB requires a secure context)
- Linux needs a udev rule so the browser can open the brick; ship it in the docs
- Show a clear "use Chrome or Edge" banner when `navigator.usb` is missing

**Success criteria for v1**

1. Connect to a brick over USB and show its name, firmware version, and battery voltage.
2. Build a program with motors, a touch or ultrasonic sensor, a loop, and an `if`, then run it on the brick.
3. Watch live sensor values while the program runs.
4. Everything above works on Linux and macOS with no server beyond static hosting.

## Tech stack and key decisions

Everything is TypeScript, runs in the browser, and ships as static files. Each choice below has a reason, so Claude Code should not swap them without asking.

| Area | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict) | One language for protocol, compiler, and UI; typed packets catch byte-layout bugs |
| Build | Vite + pnpm workspaces | Fast dev loop, simple static output, clean monorepo |
| UI | React + Tailwind (or Svelte if preferred) | Modern interface, large ecosystem; keep UI thin over the core packages |
| Block editor | Blockly | Mature, themeable, generates code from block trees, supports custom blocks |
| USB | WebUSB | Works on Linux and macOS Chromium without drivers; the NXT uses a vendor-specific class, so it is not blocklisted |
| Bluetooth | Web Serial over OS-paired RFCOMM | Web Bluetooth is BLE-only and the NXT is classic Bluetooth |
| Compiler | Own TypeScript compiler to `.rxe` | No server, works offline; NBC is Free Pascal and awkward to port to WASM |
| Tests | Vitest, plus a mock brick | Most of the code can be tested with no hardware |
| Storage | IndexedDB + File System Access API (download fallback) | Local-first projects, no account needed |
| Hosting | Any static host (GitHub Pages, Cloudflare Pages) | No backend |

**Decisions to keep fixed**

- **Transport abstraction.** The protocol layer talks to an interface (`send(bytes)`, `receive()`), so USB, Bluetooth serial, and a mock brick are interchangeable.
- **Stock firmware only.** Target LEGO's standard NXT firmware (1.x) so no flashing is needed. Do not depend on enhanced NBC/NXC firmware features.
- **Compiler first, NXC never.** Do not generate NXC text as an intermediate format. The compiler emits bytecode directly from an internal representation (IR), which Blockly blocks lower into.
- **Spec over memory.** Opcode values, packet layouts, and `.rxe` structure must come from LEGO's published Bluetooth Development Kit and Hardware Developer Kit documents. Add the relevant tables to `docs/` and cite them in code comments. If a value is unsure, check the document rather than guess.

## Repository structure

A pnpm monorepo where the core packages have no UI or browser dependencies beyond the transport, so they are testable in Node.

```
nxt-web-studio/
  apps/
    web/                 # Vite app: UI, Blockly integration, PWA shell
  packages/
    nxt-protocol/        # Packet encode/decode, direct + system commands
    nxt-transport/       # Transport interface + WebUSB, WebSerial, Mock
    nxt-rxe/             # .rxe file writer/reader, VM opcode tables
    nxt-compiler/        # IR, lowering from blocks, codegen to .rxe
    nxt-sim/             # Small VM interpreter for testing compiled programs
    blocks/              # Blockly block definitions + block-to-IR generators
  docs/
    spec/                # Excerpts from LEGO's published protocol/file-format docs
    udev/                # 99-nxt.rules and Linux setup notes
    architecture.md
  fixtures/              # Captured packets, known-good .rxe files
  CLAUDE.md              # Working agreements for Claude Code
```

**Dependency rules**

1. `nxt-protocol` depends only on the `nxt-transport` interface, never on `navigator.usb`.
2. `nxt-compiler` and `nxt-rxe` are pure functions: bytes and trees in, bytes out.
3. `blocks` depends on Blockly and `nxt-compiler` IR types only.
4. `apps/web` is the only place that touches the DOM, WebUSB, or IndexedDB.

## Phase 0: Scaffolding

Get an empty but fully wired project that builds, tests, and deploys.

**Tasks**

- [ ] Create the pnpm workspace with the packages and app listed above, each with a `tsconfig` extending a shared strict base
- [ ] Add ESLint, Prettier, and Vitest with a passing placeholder test per package
- [ ] Vite app showing a placeholder shell: header, sidebar, empty editor area, status bar
- [ ] Browser support check that shows a banner when `navigator.usb` is missing
- [ ] GitHub Actions workflow: install, lint, typecheck, test, build
- [ ] Write `CLAUDE.md` (see the last section) and `docs/architecture.md`
- [ ] Pick an open-source licence (MIT or Apache-2.0) and add a `NOTICE` explaining the project is unaffiliated with LEGO

**Acceptance criteria**

- `pnpm install && pnpm test && pnpm build` passes from a clean checkout
- CI is green on the first push
- The dev server loads the shell in Chrome on Linux and macOS

## Phase 1: NXT protocol over WebUSB

Prove the hardware path end to end before building any editor. This phase ends with a "Connect" button that plays a tone and shows live values.

**Key facts to verify against LEGO's documentation**

- USB vendor ID `0x0694`, product ID `0x0002` in normal mode; the bootloader (SAM-BA) mode uses a different Atmel ID and is only needed for firmware flashing (Phase 5)
- One interface with a bulk OUT and a bulk IN endpoint, 64-byte packets
- Telegram types: direct command (reply wanted or not), system command, and reply; every reply carries a status byte
- Over USB telegrams are sent raw; over Bluetooth each telegram gets a 2-byte little-endian length prefix

**Tasks**

- [ ] `nxt-transport`: define the `Transport` interface; implement `MockTransport` first, then `WebUsbTransport` (request device, claim interface, bulk transfer, reconnect handling)
- [ ] `nxt-protocol`: typed encoders and decoders for the direct commands below, with a status-code error type
- [ ] Direct commands: play tone, stop sound, get battery level, set and get output state (motors), reset motor position, set input mode, get input values, keep alive, start and stop program, get current program name
- [ ] System commands: get firmware version, get device info (name, Bluetooth address, free flash), find first and next, open and close file
- [ ] A request queue that serialises commands and applies timeouts, so UI code never interleaves packets
- [ ] Dev-only "Bench" page in `apps/web`: connect, tone, battery, motor sliders, sensor port selectors with live readouts
- [ ] `docs/udev/99-nxt.rules` and a short Linux permissions guide
- [ ] Save real packet captures as fixtures; use them in protocol unit tests

**Acceptance criteria**

- On Linux and macOS Chrome, clicking Connect, picking the brick, and pressing Tone makes the brick beep
- Battery voltage, brick name, and firmware version display correctly
- A motor can be driven from the Bench page and its tacho count updates live
- All protocol encoders and decoders have unit tests that run against `MockTransport`, no hardware required
- Unplugging mid-session shows a clear "disconnected" state and allows reconnect without a page reload

## Phase 2: Blockly editor and block set

Build the editing experience on its own, with no hardware needed. Blocks compile to the IR defined in Phase 3, so agree on the IR types first and stub the generator.

**Initial block set**

| Category | Blocks |
| --- | --- |
| Motors | Run motor port at power for seconds, degrees, or rotations; run unlimited; stop (brake or coast); sync two motors for driving (move, turn) |
| Sensors | Touch pressed, light level, sound level, ultrasonic distance, colour; each with a port dropdown |
| Flow | Wait seconds, wait until condition, repeat N, repeat forever, repeat until, if / else, break |
| Logic and math | Comparisons, and / or / not, arithmetic, random number, min, max |
| Variables | Numeric and boolean variables, set and change |
| Sound | Play tone (frequency, duration), play sound file, stop sound |
| Display | Show text at position, show number, clear screen |
| Custom blocks | User-defined functions with parameters |

**Tasks**

- [ ] Integrate Blockly in `apps/web` with a custom light and dark theme, and a clean toolbox with category colours
- [ ] Define each block in `packages/blocks` with typed inputs and port dropdowns that show only valid ports (motors A to C, sensors 1 to 4)
- [ ] Block-level validation: unconnected inputs, undefined variables, and unsupported combinations show inline warnings
- [ ] Project model: a JSON document with a version number, workspace XML or JSON, and metadata; autosave to IndexedDB
- [ ] Open, save, and export projects as `.nxtproj.json` files via the File System Access API, with a download fallback
- [ ] Undo and redo, zoom, workspace search, and keyboard shortcuts
- [ ] A short list of example projects (drive in a square, avoid obstacles, line follower) loadable from a menu
- [ ] Responsive layout that works on a laptop screen and a tablet in landscape

**Acceptance criteria**

- Every block in the table can be placed, connected, and serialised to JSON and back with no loss
- Reloading the page restores the last project
- Invalid programs are flagged before the user presses Run
- Visual design is consistent in light and dark mode; no LEGO artwork or trademarked names appear anywhere

## Phase 3: Compiler to .rxe bytecode

This is the hardest phase and carries the most risk, so it starts with a spike. The pipeline is: Blockly workspace, then IR, then bytecode, then `.rxe` file.

**Step 3a: spike (do this first, time-boxed)**

- [ ] Read LEGO's executable file format and VM instruction set documents; summarise the `.rxe` header, data space, dataspace table, clump records, and code space in `docs/spec/rxe.md`
- [ ] Hand-assemble the smallest valid program (play a tone, wait, exit) as bytes, upload it using Phase 4's upload code or a throwaway script, and confirm it runs on a real brick
- [ ] Decide: continue with the own-compiler plan, or fall back to a stopgap (see Risks)

**Step 3b: build**

- [ ] `nxt-rxe`: writer that takes a dataspace layout and clump code and emits a valid file with correct offsets and sizes; reader used only for tests
- [ ] `nxt-compiler` IR: a small typed structure with variables (number, boolean), expressions, statements, loops, conditionals, calls, and a subroutine table
- [ ] Lowering from IR to VM instructions: variable allocation in the dataspace, expression evaluation, jumps with label resolution, and subroutine calls and returns
- [ ] Map each block type to the matching firmware calls (motor control, sensor reads, sound, display) using the VM's system-call mechanism
- [ ] `packages/blocks` generators that turn each block into IR nodes, with source mapping so errors point at the offending block
- [ ] `nxt-sim`: a minimal interpreter for the subset of opcodes used, so compiled programs can be unit tested without a brick
- [ ] Clear compile errors with block ids, shown in the editor

**Test strategy for the compiler**

- Golden-file tests: given a block program, the compiler output must match a checked-in `.rxe` fixture byte for byte
- Round-trip tests: compile, read back with `nxt-rxe`, and check structure
- Behavioural tests: run the output in `nxt-sim` and assert on motor, sound, and display calls it makes
- Hardware smoke test: a short manual checklist, run before each release

**Acceptance criteria**

- The spike program runs on a real NXT
- Example programs (square, obstacle avoidance) compile, run correctly on hardware, and pass simulator tests
- Compilation of a typical program takes under one second in the browser
- No network request is made during compilation

## Phase 4: Upload, run, and live monitoring

This connects the editor to the brick and delivers the core "press Run" experience.

**Tasks**

- [ ] File upload in `nxt-protocol`: open for write with the file size, write in chunks that fit the packet limit, close, with retry and checksum-style verification by reading the file size back
- [ ] Handle an existing file of the same name (delete first) and the brick's free-flash limit with a clear error
- [ ] Run button: compile, upload to the brick, start program, and show a running state
- [ ] Stop button: stop program, stop all motors, stop sound; always available while connected
- [ ] Live monitor panel: periodic polling of battery, sensor ports, and motor tacho counts, throttled so it never starves the upload or program control
- [ ] Pause polling automatically during uploads and while the tab is hidden
- [ ] Connection UI: connect, disconnect, brick name, battery indicator, and friendly errors (device busy, permission denied, no brick found)
- [ ] Detect when a program ends on its own and return the UI to idle
- [ ] Optional: remember the last paired device through `navigator.usb.getDevices()` so reconnect needs no picker

**Acceptance criteria**

- From a fresh page load: connect, build a program, press Run, the robot moves, press Stop, it halts
- Upload of a typical program completes in a few seconds and survives a retry after a dropped packet
- The monitor panel updates at least twice per second while a program runs, with no visible UI lag
- Pulling the cable mid-run leaves the UI in a recoverable state

## Phase 5: File manager, firmware tools, and Bluetooth

These are secondary features. Ship each independently so none blocks v1.

**File manager**

- [ ] List files on the brick (find first and next) with name, size, and type
- [ ] Download, upload, delete, and run a selected program; play a sound file
- [ ] Show free flash and warn when low

**Brick settings**

- [ ] Rename the brick
- [ ] Show firmware version, Bluetooth address, and battery state in a device panel

**Firmware update (high risk, ship last)**

- [ ] Do not bundle LEGO firmware images; let the user pick a firmware file they obtained themselves
- [ ] Implement bootloader entry and the SAM-BA flashing sequence over WebUSB, with a verification step
- [ ] Heavy warnings, a confirmation dialog, and a "battery must be above a safe level" check before starting
- [ ] Document the manual recovery procedure (the "click of death" reset) in the docs

**Bluetooth via Web Serial**

- [ ] Implement `WebSerialTransport` with the 2-byte length framing
- [ ] Pairing guide for Linux (`bluetoothctl`, `rfcomm`) and macOS (System Settings, then the serial port that appears)
- [ ] Mark it "experimental" in the UI; USB stays the recommended path, since the NXT's old Bluetooth stack is unreliable on modern hosts

**Acceptance criteria**

- The file manager can round-trip a program: upload, list, download, and delete, with identical bytes
- A program can be uploaded and run over Bluetooth on at least one tested macOS and one tested Linux setup, or the limitation is documented
- Firmware flashing is either verified on spare hardware or left disabled behind a feature flag

## Phase 6: Polish, offline, and release

- [ ] Installable PWA with a service worker that caches the app shell and Blockly assets, so it works with no network
- [ ] Onboarding: a first-run guide covering browser check, cable connection, Linux udev step, and a first "hello" program
- [ ] Accessibility pass: keyboard navigation, focus states, contrast, and screen-reader labels on controls
- [ ] Error reporting that stays local (no telemetry by default); a "copy diagnostics" button for bug reports
- [ ] Internationalisation scaffold with English first
- [ ] Documentation site or `docs/` pages: getting started, block reference, troubleshooting (USB permissions, brick not found, firmware mismatch), and a contributing guide
- [ ] Release checklist and a hardware smoke-test script covering connect, run, stop, monitor, file manager
- [ ] Deploy to a static host over HTTPS and tag v1.0

**Acceptance criteria**

- Lighthouse PWA and accessibility scores are green
- A new user can go from opening the URL to a moving robot using only the onboarding guide
- The app loads and compiles programs with the network disabled after first visit

## Testing strategy

Most of the code must be testable without a brick, because Claude Code cannot plug one in. Hardware checks are done by you.

| Layer | How it is tested | Needs hardware |
| --- | --- | --- |
| Packet encode and decode | Unit tests against fixtures of real captured packets | No |
| Command flows (upload, file listing) | `MockTransport` that replays scripted replies and injects errors and timeouts | No |
| `.rxe` writer | Golden files and structural checks | No |
| Compiler | Golden `.rxe` output, plus behavioural tests in `nxt-sim` | No |
| Blocks and validation | Serialise round-trips, validation rules | No |
| UI | Component tests and a few Playwright flows against `MockTransport` | No |
| WebUSB and Web Serial | Manual smoke checklist on Linux and macOS | Yes |
| Real programs | Manual run of every example project | Yes |

**How to hand hardware tests to the human**

- Claude Code finishes a phase, then writes a short numbered checklist into `docs/hardware-tests.md` for that phase
- The human runs it on a real brick and reports results, including any captured packets, which become new fixtures
- A phase is not marked done until its hardware checklist has passed

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| `.rxe` format or VM semantics are harder than expected | Medium | High | Phase 3a spike on real hardware before committing; golden tests from known-good files |
| Own compiler stalls | Medium | High | Fallback: generate NXC and compile with NBC on a small hosted service as a temporary path, behind the same `compile()` interface |
| WebUSB blocked or flaky on some Linux setups | Medium | Medium | Ship udev rules and a troubleshooting page; detect permission errors and explain them |
| Bluetooth unreliable on modern hosts | High | Low | Mark experimental; USB is the primary path |
| Firmware flashing bricks a device | Low | High | Feature flag, heavy warnings, document recovery; do not enable by default |
| Polling during a run disturbs the program or upload | Medium | Medium | Throttled queue; pause polling during uploads |
| LEGO trademark or asset issues | Low | Medium | Neutral name, original icons and artwork, clear "unaffiliated" notice; do not bundle LEGO firmware |
| Chromium-only audience | Certain | Medium | Accept for v1; clear banner and docs; revisit if browsers add support |

**Open questions for the human to decide early**

- UI framework: React or Svelte?
- Licence: MIT or Apache-2.0?
- Hosting target for the public build?
- Should v1 include the Bluetooth transport, or wait until after release?

## Working agreements for Claude Code

Copy this section into `CLAUDE.md` at the repo root.

**How to work**

1. Work one phase at a time, in order. Do not start a phase until the previous one's acceptance criteria are met or the human waives them.
2. Before coding a phase, restate its goal and plan in a few lines, and list anything that needs a decision.
3. Prefer small commits with clear messages; keep `main` green (lint, typecheck, test, build).
4. Write tests with the code, not after. Anything touching bytes needs a fixture or golden test.
5. Do not invent protocol details. Take opcodes, packet layouts, and file formats from the documents in `docs/spec/`. If a document is missing, stop and ask the human to add it.
6. Keep core packages free of DOM and browser APIs. Only `apps/web` and the transport implementations touch them.
7. When a phase needs real hardware, write the checklist in `docs/hardware-tests.md`, then stop and ask the human to run it.
8. Do not add dependencies without a one-line justification in the PR or commit message.
9. Never copy LEGO artwork, icons, or product names into the repo.

**Definition of done for any task**

- Types, lint, and tests pass
- Behaviour matches the phase's acceptance criteria
- Public functions in `nxt-*` packages have short doc comments
- `docs/` is updated if setup or behaviour changed

**First prompt to paste into Claude Code**

```
Read PLAN.md in full. We are building NXT Web Studio, a browser-based
visual programming tool for the LEGO MINDSTORMS NXT. Start with Phase 0:
scaffold the pnpm monorepo exactly as described, get lint, typecheck,
tests, and build passing, add CI, and write CLAUDE.md from the "Working
agreements" section. Before writing code, tell me your plan and list any
questions from the "Open questions" list that you need answered. Stop at
the end of Phase 0 and wait for me.
```

Save this doc as `PLAN.md` in the repo root, using the export-to-Markdown option.
