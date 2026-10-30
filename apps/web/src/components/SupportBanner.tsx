import type { BrowserSupport } from '../lib/browserSupport';
import { iconUrl } from '../lib/icons';

/** Warns when the browser cannot talk to the brick over USB. */
export function SupportBanner({ support }: { support: BrowserSupport }) {
  if (support.usb) return null;
  return (
    <div role="alert" className="support-banner">
      <img src={iconUrl('error')} alt="" />
      <span>
        <strong>This browser can’t connect to the brick.</strong> Please use a current version of
        Chrome or Edge (or another Chromium browser) on Linux or macOS. You can still build programs
        here.
      </span>
    </div>
  );
}
