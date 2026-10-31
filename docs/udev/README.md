# Linux USB permissions

On Linux the browser needs permission to open the brick's USB device.

The app hands out this rule too: **Help → Download 70-nxt.rules** (or Help → Linux USB
setup, which also shows the commands). The file is bundled from this folder at build time,
so keep this copy as the only one.

1. Copy the rule into place and reload udev:

   ```sh
   sudo cp docs/udev/70-nxt.rules /etc/udev/rules.d/
   sudo udevadm control --reload-rules
   sudo udevadm trigger
   ```

2. Unplug the brick and plug it in again.
3. In Chrome or Edge, click **Connect via USB** and pick the brick.

Keep the number below 73: `TAG+="uaccess"` only takes effect in rules that run before
systemd's `73-seat-late.rules`, so a `99-…` file would be ignored.

`TAG+="uaccess"` gives the user at the computer access to the device, which works
with systemd-logind (most desktop distributions). If yours doesn't use logind,
replace it with `GROUP="plugdev"` and add yourself to that group.

If Connect says "Permission denied", the rule is not active yet: check the file
name ends in `.rules` and replug the brick. If it says "The brick is busy",
another program (or browser tab) has it open.
