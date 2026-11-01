import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFloatingWindow } from '../lib/floating';
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
  const floating = useFloatingWindow(!!modeless);
  // A modeless window can be moved by its title bar, so it doesn't hide what's beneath.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = (e: React.PointerEvent) => {
    if (!modeless || (e.target as HTMLElement).closest('button')) return;
    const el = box.current;
    if (!el) return;
    const start = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    const rect = el.getBoundingClientRect();
    const base = { left: rect.left - offset.x, top: rect.top - offset.y };
    const move = (ev: PointerEvent) => {
      const x = ev.clientX - start.x;
      const y = ev.clientY - start.y;
      // Keep the title bar on screen.
      setOffset({
        x: Math.min(window.innerWidth - 80 - base.left, Math.max(80 - base.left - rect.width, x)),
        y: Math.min(window.innerHeight - 30 - base.top, Math.max(-base.top, y)),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

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
      style={modeless ? { zIndex: floating.zIndex } : undefined}
      onMouseDown={(e) => !modeless && e.target === e.currentTarget && onClose()}
    >
      <div
        ref={box}
        tabIndex={-1}
        onKeyDown={trapTab}
        onPointerDownCapture={modeless ? floating.raise : undefined}
        onFocusCapture={modeless ? floating.raise : undefined}
        className="dialog"
        role="dialog"
        aria-modal={!modeless}
        aria-label={title}
        style={{
          ...(width ? { width: `min(${width}px, calc(100vw - 32px))` } : {}),
          ...(offset.x || offset.y ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : {}),
        }}
      >
        <div className={`title-bar ${modeless ? 'draggable' : ''}`} onPointerDown={drag}>
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
