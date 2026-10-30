import { useEffect, type ReactNode } from 'react';
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

/** A modal window in the classic desktop style. Escape closes it. */
export function Dialog({
  title,
  icon = 'brick',
  width,
  onClose,
  children,
  footer,
  modeless,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={`dialog-backdrop ${modeless ? 'modeless' : ''}`}
      onMouseDown={(e) => !modeless && e.target === e.currentTarget && onClose()}
    >
      <div
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
