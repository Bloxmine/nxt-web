# USB

| Fact                         | Value                                        | Source                                            |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------- |
| Transfer type                | Bulk                                         | Appendix 1 p. 24                                  |
| Max payload per transfer     | 64 bytes                                     | Appendix 1 p. 24                                  |
| Framing                      | None; raw telegrams                          | Appendix 2 p. 4                                   |
| Vendor ID                    | `0x0694`                                     | nxt-python `nxt/backend/usb.py`                   |
| Product ID (normal firmware) | `0x0002`                                     | nxt-python `nxt/backend/usb.py`                   |
| Interface                    | 0, alternate 0                               | nxt-python (`get_active_configuration()[(0, 0)]`) |
| Endpoints                    | First bulk OUT, first bulk IN of interface 0 | nxt-python; read from the descriptor at runtime   |

LEGO's documents describe USB only at the level of "bulk, 64-byte buffer". The IDs come
from nxt-python, a long-standing open-source driver, and must be confirmed on hardware
(see `docs/hardware-tests.md`). The code reads endpoint numbers from the interface
descriptor rather than hard-coding them.
