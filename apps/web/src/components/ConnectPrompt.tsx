import { useBrick } from '../brick/BrickContext';
import { checkBrowserSupport } from '../lib/browserSupport';
import { iconUrl } from '../lib/icons';
import { downloadUdevRule, isLinux } from '../lib/udev';

const support = checkBrowserSupport(navigator);

/** "No brick connected" with the connect buttons right there. */
export function ConnectPrompt({ what }: { what: string }) {
  const brick = useBrick();
  const busy = brick.state === 'connecting';
  return (
    <div className="connect-prompt">
      <p>Connect a brick to {what}.</p>
      <div className="log-setup">
        <button
          type="button"
          className="btn primary"
          disabled={!support.usb || busy}
          onClick={() => void brick.connectUsb()}
        >
          <img src={iconUrl('connect')} alt="" /> Connect via USB
        </button>
        <button
          type="button"
          className="btn"
          disabled={!support.serial || busy}
          onClick={() => void brick.connectBluetooth()}
        >
          <img src={iconUrl('bluetooth')} alt="" /> Bluetooth
        </button>
      </div>
      {isLinux() && (
        <p className="udev-hint">
          On Linux, the first time:{' '}
          <button type="button" className="guide-link" onClick={downloadUdevRule}>
            download the USB permission rule
          </button>{' '}
          (Help → Linux USB setup shows how to install it).
        </p>
      )}
    </div>
  );
}
