# Architecture

NXT Web Studio is a static web app. Programs are built with blocks, compiled to NXT
bytecode in the browser, uploaded over WebUSB (or Bluetooth via Web Serial), and run on
the brick's stock firmware. There is no backend.

## Data flow

```
Blockly workspace ──► IR ──► VM instructions ──► .rxe file ──► upload ──► brick runs it
   (blocks)        (compiler)   (compiler)         (rxe)      (protocol + transport)
```

## Packages

| Package          | Path                     | Role                                                                   |
| ---------------- | ------------------------ | ---------------------------------------------------------------------- |
| `@nxt/transport` | `packages/nxt-transport` | `Transport` interface plus WebUSB, Web Serial and mock implementations |
| `@nxt/protocol`  | `packages/nxt-protocol`  | Encode and decode direct and system commands; request queue            |
| `@nxt/rxe`       | `packages/nxt-rxe`       | `.rxe` writer (and a reader for tests); VM opcode tables               |
| `@nxt/compiler`  | `packages/nxt-compiler`  | IR types, lowering, codegen to `.rxe`                                  |
| `@nxt/sim`       | `packages/nxt-sim`       | Small VM interpreter for testing compiled programs                     |
| `@nxt/blocks`    | `packages/blocks`        | Classic block program model, validation and lowering to IR             |
| `@nxt/rbt`       | `packages/nxt-rbt`       | Importer for original NXT-G `.rbt` programs                            |
| `@nxt/web`       | `apps/web`               | React + Tailwind UI, Blockly host, PWA shell                           |

```
apps/web ──► blocks ──► nxt-compiler ──► nxt-rxe ◄── nxt-sim
    │   └──► nxt-rbt ──► blocks             ▲            │
    ├──► nxt-sim ─────────────────────────────────────────┘ (IR types)
    └──► nxt-protocol ──► nxt-transport (interface)
```

## Simulator and debugger

`@nxt/sim` runs a program's IR on a simulated brick: one generator per beam, motors with
degree goals and steering, a two-wheeled robot on a mat (touch, light, color, sound and
ultrasonic sensors), the 100×64 screen, buttons, mailboxes and files. Statements carry the
id of the block they came from, so the simulator window in `apps/web` can highlight the
running blocks, stop at breakpoints and show values on data wires.

`RxeVm` (same package) runs compiled `.rxe` files on that brick. Compiler tests run every
example both ways and compare the results.

## Offline

`apps/web/build/offline.ts` is a small Vite plugin that writes `sw.js` after each build,
listing every output file. The service worker caches them on install and serves them
cache-first, so the installed app works without a network.

## Dependency rules

1. `nxt-protocol` depends only on the `nxt-transport` interface, never on `navigator.usb`.
2. `nxt-compiler` and `nxt-rxe` are pure functions: bytes and trees in, bytes out.
3. `blocks` depends on Blockly and `nxt-compiler` IR types only.
4. `apps/web` is the only place that touches the DOM or IndexedDB. The WebUSB and Web
   Serial transport implementations in `nxt-transport` are the one other place that may
   use browser APIs.

Rule 4 is enforced by ESLint: core packages other than `nxt-transport` may not use
`window`, `document`, `navigator`, `indexedDB` or `localStorage`, and their `tsconfig`
does not include the DOM library.

## Packages are consumed as source

Each package's `exports` points at `src/index.ts`. There is no per-package build step:
Vite bundles the sources directly for the app, and Vitest runs them directly in tests.

## Transport abstraction

All brick communication goes through the `Transport` interface (`connect`, `disconnect`,
`send`, `receive`, `onStateChange`). Implementations deal in whole telegrams, so the
Bluetooth length prefix is added and removed inside `WebSerialTransport` and the
protocol layer never sees it. A `MockTransport` replays scripted replies for tests.

## Decisions

| Decision     | Choice                                         | Date       |
| ------------ | ---------------------------------------------- | ---------- |
| UI framework | React + Tailwind                               | 2026-10-30 |
| Licence      | MIT                                            | 2026-10-30 |
| Hosting      | Undecided; any static host works               | 2026-10-30 |
| Bluetooth    | In v1, marked experimental                     | 2026-10-30 |
| TypeScript   | 6.0 (typescript-eslint does not support 7 yet) | 2026-10-30 |
