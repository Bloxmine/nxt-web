import type { DocTab } from '../editor/useDocuments';
import { iconUrl } from '../lib/icons';

/** Tabs for the programs that are open, with a button for a new one. */
export function DocumentTabs({
  tabs,
  onSwitch,
  onClose,
  onNew,
  onRename,
}: {
  tabs: DocTab[];
  onSwitch(id: string): void;
  onClose(id: string): void;
  onNew(): void;
  /** Renames the active program (double-click its tab). */
  onRename(): void;
}) {
  return (
    <div className="doc-tabs" role="tablist" aria-label="Open programs">
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tab"
          aria-selected={t.active}
          tabIndex={0}
          className={`doc-tab ${t.active ? 'active' : ''}`}
          title={`${t.name}${t.dirty ? ' (not saved to a file)' : ''}. Double-click to rename.`}
          onClick={() => onSwitch(t.id)}
          onDoubleClick={() => t.active && onRename()}
          onKeyDown={(e) => e.key === 'Enter' && onSwitch(t.id)}
          onAuxClick={(e) => e.button === 1 && onClose(t.id)}
        >
          <img src={iconUrl('brick')} alt="" />
          <span>
            {t.name}
            {t.dirty ? '*' : ''}
          </span>
          <button
            type="button"
            className="close"
            aria-label={`Close ${t.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onClose(t.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="doc-tab-new"
        title="New program"
        aria-label="New program"
        onClick={onNew}
      >
        +
      </button>
    </div>
  );
}
