import { useEffect, useRef, useState } from 'react';
import { iconUrl } from '../lib/icons';

export type MenuItem =
  | {
      label: string;
      icon?: string;
      shortcut?: string;
      disabled?: boolean;
      /** For on/off settings: shows a tick column. */
      checked?: boolean;
      onClick(): void;
    }
  | { separator: true }
  | { section: string };

export interface Menu {
  label: string;
  items: MenuItem[];
}

/** File / Edit / Tools / Help menu bar. Click to open, hover to switch menus. */
export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-bar" ref={ref} role="menubar">
      {menus.map((menu) => (
        <div key={menu.label} className={`menu ${open === menu.label ? 'open' : ''}`}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open === menu.label}
            onClick={() => setOpen(open === menu.label ? null : menu.label)}
            onMouseEnter={() => open && setOpen(menu.label)}
          >
            {menu.label}
          </button>
          {open === menu.label && (
            <div className="menu-list" role="menu">
              {(() => {
                const checks = menu.items.some((it) => 'checked' in it && it.checked !== undefined);
                return menu.items.map((item, i) => {
                  if ('separator' in item) return <hr key={i} />;
                  if ('section' in item) {
                    return (
                      <div key={i} className="section">
                        {item.section}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={i}
                      type="button"
                      role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                      aria-checked={item.checked}
                      disabled={item.disabled}
                      onClick={() => {
                        setOpen(null);
                        item.onClick();
                      }}
                    >
                      {checks && (
                        <span className="check-mark" aria-hidden="true">
                          {item.checked ? '✓' : ''}
                        </span>
                      )}
                      {item.icon ? (
                        <img src={iconUrl(item.icon)} alt="" />
                      ) : (
                        <span className="no-icon" />
                      )}
                      {item.label}
                      {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
                    </button>
                  );
                });
              })()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
