# Direct commands

Source: Bluetooth Developer Kit, Appendix 2 "Direct commands" v1.00, pp. 5–11.

Byte 0 of every request is `0x00` (reply wanted) or `0x80` (no reply). Every reply starts
`0x02, <opcode>, <status>`. Offsets below are telegram byte indices.

| Opcode | Name                  | Request bytes 2..                                            | Reply bytes 3..                           |
| ------ | --------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| `0x00` | STARTPROGRAM          | 2–21 file name (ASCIIZ, 20-byte field)                       | —                                         |
| `0x01` | STOPPROGRAM           | —                                                            | —                                         |
| `0x02` | PLAYSOUNDFILE         | 2 loop (bool); 3–22 file name                                | —                                         |
| `0x03` | PLAYTONE              | 2–3 frequency Hz (UWORD, 200–14000); 4–5 duration ms (UWORD) | —                                         |
| `0x04` | SETOUTPUTSTATE        | see below                                                    | —                                         |
| `0x05` | SETINPUTMODE          | 2 port (0–3); 3 sensor type; 4 sensor mode                   | —                                         |
| `0x06` | GETOUTPUTSTATE        | 2 port (0–2)                                                 | see below                                 |
| `0x07` | GETINPUTVALUES        | 2 port (0–3)                                                 | see below                                 |
| `0x08` | RESETINPUTSCALEDVALUE | 2 port (0–3)                                                 | —                                         |
| `0x09` | MESSAGEWRITE          | 2 inbox (0–9); 3 size incl. null (≤ 59); 4..N data           | —                                         |
| `0x0A` | RESETMOTORPOSITION    | 2 port (0–2); 3 relative (bool)                              | —                                         |
| `0x0B` | GETBATTERYLEVEL       | —                                                            | 3–4 voltage mV (UWORD)                    |
| `0x0C` | STOPSOUNDPLAYBACK     | —                                                            | —                                         |
| `0x0D` | KEEPALIVE             | —                                                            | 3–6 sleep time limit ms (ULONG)           |
| `0x0E` | LSGETSTATUS           | 2 port (0–3)                                                 | 3 bytes ready                             |
| `0x0F` | LSWRITE               | 2 port; 3 tx length; 4 rx length; 5..N tx data (≤ 16 bytes)  | —                                         |
| `0x10` | LSREAD                | 2 port                                                       | 3 bytes read; 4–19 rx data (padded)       |
| `0x11` | GETCURRENTPROGRAMNAME | —                                                            | 3–22 file name (error if none running)    |
| `0x13` | MESSAGEREAD           | 2 remote inbox (0–19); 3 local inbox (0–9); 4 remove (bool)  | 3 local inbox; 4 size; 5–63 data (padded) |

## SETOUTPUTSTATE (`0x04`)

| Byte | Field                                |
| ---- | ------------------------------------ |
| 2    | Output port, 0–2 (`0xFF` = all)      |
| 3    | Power set point, SBYTE −100..100     |
| 4    | Mode (bit field)                     |
| 5    | Regulation mode (UBYTE, enum)        |
| 6    | Turn ratio, SBYTE −100..100          |
| 7    | Run state (UBYTE, enum)              |
| 8–11 | Tacho limit, ULONG (0 = run forever) |

> The document prints "Byte 8 – 12" for the tacho limit, but a ULONG is 4 bytes, so the
> telegram is 12 bytes long (bytes 0–11). This matches GETOUTPUTSTATE's 4-byte TachoLimit.

**Mode bits:** `MOTORON = 0x01`, `BRAKE = 0x02`, `REGULATED = 0x04`.

**Regulation mode:** `IDLE = 0x00`, `MOTOR_SPEED = 0x01`, `MOTOR_SYNC = 0x02`.

**Run state:** `IDLE = 0x00`, `RAMPUP = 0x10`, `RUNNING = 0x20`, `RAMPDOWN = 0x40`.

## GETOUTPUTSTATE reply (`0x06`)

| Byte  | Field                                                           |
| ----- | --------------------------------------------------------------- |
| 3     | Output port                                                     |
| 4     | Power set point (SBYTE)                                         |
| 5     | Mode                                                            |
| 6     | Regulation mode                                                 |
| 7     | Turn ratio (SBYTE)                                              |
| 8     | Run state                                                       |
| 9–12  | Tacho limit (ULONG)                                             |
| 13–16 | Tacho count (SLONG), counts since last motor counter reset      |
| 17–20 | Block tacho count (SLONG), relative to last programmed movement |
| 21–24 | Rotation count (SLONG), relative to last rotation sensor reset  |

## GETINPUTVALUES reply (`0x07`)

| Byte  | Field                                      |
| ----- | ------------------------------------------ |
| 3     | Input port                                 |
| 4     | Valid (bool)                               |
| 5     | Calibrated (bool)                          |
| 6     | Sensor type                                |
| 7     | Sensor mode                                |
| 8–9   | Raw A/D value (UWORD)                      |
| 10–11 | Normalized A/D value (UWORD, 0–1023)       |
| 12–13 | Scaled value (SWORD, mode dependent)       |
| 14–15 | Calibrated value (SWORD, currently unused) |

## Sensor types (SETINPUTMODE byte 3)

| Name               | Value  |
| ------------------ | ------ |
| NO_SENSOR          | `0x00` |
| SWITCH             | `0x01` |
| TEMPERATURE        | `0x02` |
| REFLECTION         | `0x03` |
| ANGLE              | `0x04` |
| LIGHT_ACTIVE       | `0x05` |
| LIGHT_INACTIVE     | `0x06` |
| SOUND_DB           | `0x07` |
| SOUND_DBA          | `0x08` |
| CUSTOM             | `0x09` |
| LOWSPEED           | `0x0A` |
| LOWSPEED_9V        | `0x0B` |
| NO_OF_SENSOR_TYPES | `0x0C` |

The ultrasonic sensor is a digital (I²C) sensor and uses `LOWSPEED_9V`; reading it needs
LSWRITE/LSREAD.

## Sensor modes (SETINPUTMODE byte 4)

| Name              | Value  |
| ----------------- | ------ |
| RAWMODE           | `0x00` |
| BOOLEANMODE       | `0x20` |
| TRANSITIONCNTMODE | `0x40` |
| PERIODCOUNTERMODE | `0x60` |
| PCTFULLSCALEMODE  | `0x80` |
| CELSIUSMODE       | `0xA0` |
| FAHRENHEITMODE    | `0xC0` |
| ANGLESTEPSMODE    | `0xE0` |
| SLOPEMASK         | `0x1F` |
| MODEMASK          | `0xE0` |
