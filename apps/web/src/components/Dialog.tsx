import { useEffect, useRef, type ReactNode } from 'react';
import { iconUrl } from '../lib/icons';

interface Props {
  title: string;
  icon?: string;
  width?: number;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  /** Leave the rest of the window usable (no dimmed backdrop). */
  modeless?: boolean;
}

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A modal window in the classic desktop style. Escape closes it. Focus moves into it
 * when it opens, Tab stays inside a modal one, and focus goes back when it closes.
 */
export function Dialog({
  title,
  icon = 'brick',
  width,
  onClose,
  children,
  footer,
  modeless,
}: Props) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = box.current;
    // Unless something inside already took focus (autoFocus), focus the first control
    // in the body, or the dialog itself.
    if (el && !el.contains(document.activeElement)) {
      const first = el.querySelector<HTMLElement>(`.dialog-body :is(${FOCUSABLE})`);
      (first ?? el).focus();
    }
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const trapTab = (e: React.KeyboardEvent) => {
    if (modeless || e.key !== 'Tab' || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (x) => x.offsetParent !== null,
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={`dialog-backdrop ${modeless ? 'modeless' : ''}`}
      onMouseDown={(e) => !modeless && e.target === e.currentTarget && onClose()}
    >
      <div
        ref={box}
        tabIndex={-1}
        onKeyDown={trapTab}
        className="dialog"
        role="dialog"
        aria-modal={!modeless}
        aria-label={title}
        style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}
      >
        <div className="title-bar">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <img src={iconUrl(icon)} alt="" />
            {title}
          </span>
          <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}
