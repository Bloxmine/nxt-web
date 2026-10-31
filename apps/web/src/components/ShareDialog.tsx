import type { Program } from '@nxt/blocks';
import { useEffect, useState } from 'react';
import { iconUrl } from '../lib/icons';
import { shareLink } from '../lib/share';
import { Dialog } from './Dialog';

/** File → Share link: a link that opens this program, to send to someone. */
export function ShareDialog({ program, onClose }: { program: Program; onClose(): void }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void shareLink(program, window.location.origin + window.location.pathname).then(
      (l) => live && setLink(l),
    );
    return () => {
      live = false;
    };
  }, [program]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog
      title="Share this program"
      icon="transmit"
      width={540}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn primary"
            disabled={!link}
            onClick={() => void copy()}
          >
            <img src={iconUrl(copied ? 'tick' : 'page_copy')} alt="" />
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Anyone who opens this link gets a copy of <strong>{program.name}</strong> in NXT Web Studio.
        The program is inside the link itself; nothing is uploaded.
      </p>
      <textarea
        className="text-input share-link"
        readOnly
        rows={4}
        aria-label="Share link"
        value={link ?? 'Making the link…'}
        onFocus={(e) => e.currentTarget.select()}
      />
      <p className="sim-muted">
        {link && `${link.length.toLocaleString()} characters. `}
        Pictures and sounds the program uses are not in the link: send those files along (Tools →
        Files on the brick) or make them again.
      </p>
    </Dialog>
  );
}
