import type { BrowserSupport } from '../lib/browserSupport';

interface Props {
  support: BrowserSupport;
}

/** Warns when the browser cannot talk to the brick over USB. */
export function SupportBanner({ support }: Props) {
  if (support.usb) return null;

  return (
    <div
      role="alert"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <strong className="font-semibold">This browser can’t connect to the brick.</strong> Please use
      a current version of Chrome or Edge (or another Chromium browser) on Linux or macOS. You can
      still build programs here.
    </div>
  );
}
