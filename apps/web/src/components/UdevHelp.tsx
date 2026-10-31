import { useState } from 'react';
import { iconUrl } from '../lib/icons';
import { downloadUdevRule, UDEV_FILE_NAME, UDEV_INSTALL } from '../lib/udev';
import { Dialog } from './Dialog';

/** The rule's download button and the commands that install it, with a copy button. */
export function UdevHelp({ compact }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const commands = UDEV_INSTALL.join('\n');
  return (
    <div className={`udev-help ${compact ? 'compact' : ''}`}>
      <ol>
        <li>
          <button type="button" className="btn" onClick={downloadUdevRule}>
            <img src={iconUrl('page_white_put')} alt="" /> Download {UDEV_FILE_NAME}
          </button>
        </li>
        <li>
          In a terminal, run (it asks for your password):
          <pre className="udev-commands">{commands}</pre>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(commands)
                .then(() => setCopied(true))
                .catch(() => {})
            }
          >
            <img src={iconUrl(copied ? 'tick' : 'page_copy')} alt="" />
            {copied ? 'Copied' : 'Copy commands'}
          </button>
        </li>
        <li>Unplug the brick, plug it in again, and connect.</li>
      </ol>
      {!compact && (
        <p className="udev-note">
          The commands expect the file in your Downloads folder; change the path if your browser
          saved it somewhere else. You only need to do this once per computer.
        </p>
      )}
    </div>
  );
}

/** Help → Linux USB setup. */
export function UdevDialog({ onClose }: { onClose(): void }) {
  return (
    <Dialog
      title="Linux USB setup"
      icon="connect"
      width={560}
      onClose={onClose}
      footer={
        <button type="button" className="btn primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <p style={{ marginTop: 0 }}>
        On Linux the browser may only open the brick&apos;s USB connection once a small permission
        rule (a <strong>udev rule</strong>) is installed. macOS doesn&apos;t need this.
      </p>
      <UdevHelp />
    </Dialog>
  );
}
