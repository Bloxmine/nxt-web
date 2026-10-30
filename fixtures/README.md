# Fixtures

Captured packets and known-good `.rxe` files used by tests. Every byte-level test should
point at a file here. Name captures after the command and note the brick's firmware
version in a sidecar `.md` file.

## captures/

Recordings of real brick traffic in the `nxt-capture` JSON format, made with
**Tools → Record USB traffic** (see docs/hardware-tests.md, "Recording a capture"). Each
file says what was done in its `note`. `packages/nxt-protocol/src/captures.test.ts` replays
every capture through the client, so decoding is tested against real replies.
`synthetic-battery-firmware.json` is hand-written from the spec to show the format; replace
or extend it with real recordings.
