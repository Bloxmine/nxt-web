// The rule file itself lives in docs/udev/; Vite bundles its text, so the hosted app can
// hand it out without a separate download location.
import rule from '../../../../docs/udev/70-nxt.rules?raw';
import { saveFile } from '../tools/convert';

/** File name of the Linux USB permission rule (keep the number below 73, see docs/udev). */
export const UDEV_FILE_NAME = '70-nxt.rules';

/** The rule's text. */
export const UDEV_RULE = rule;

/** Commands that install the rule once it is in the Downloads folder. */
export const UDEV_INSTALL = [
  `sudo cp ~/Downloads/${UDEV_FILE_NAME} /etc/udev/rules.d/`,
  'sudo udevadm control --reload-rules',
  'sudo udevadm trigger',
];

/** Saves the rule file to the user's computer. */
export function downloadUdevRule(): void {
  saveFile(UDEV_FILE_NAME, UDEV_RULE, 'text/plain');
}

/** True on desktop Linux (where the rule is needed), not Android or ChromeOS. */
export function isLinux(userAgent: string = navigator.userAgent): boolean {
  return /Linux/.test(userAgent) && !/Android|CrOS/.test(userAgent);
}
