import { getSequence, type SeqRef } from '@nxt/blocks';
import type { ReactNode } from 'react';
import { useEditor } from '../editor/EditorContext';
import { iconUrl } from '../lib/icons';
import { Sequence } from './SequenceView';

/** Program tabs and the grid canvas holding the sequence beam. */
export function Canvas({
  overlay,
  onRenameProgram,
}: {
  overlay: ReactNode;
  onRenameProgram(): void;
}) {
  const { state, dispatch } = useEditor();
  const root = state.activeTab;
  const seqRef: SeqRef = { root, parent: null, branch: 'body' };
  const blocks = getSequence(state.program, seqRef);

  const tabName = (tab: string) =>
    tab === 'main'
      ? `${state.program.name}${state.dirty ? '*' : ''}`
      : (state.program.myBlocks.find((m) => m.id === tab)?.name ?? 'My Block');

  return (
    <div className="canvas-frame">
      <div className="tabs" role="tablist">
        {state.tabs.map((tab) => (
          <div
            key={tab}
            role="tab"
            aria-selected={tab === root}
            tabIndex={0}
            className={`tab ${tab === root ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'openTab', tab })}
            onKeyDown={(e) => e.key === 'Enter' && dispatch({ type: 'openTab', tab })}
            onDoubleClick={() => tab === 'main' && onRenameProgram()}
            title={tab === 'main' ? 'Double-click to rename' : 'My Block'}
          >
            <img src={iconUrl(tab === 'main' ? 'brick' : 'bricks')} alt="" />
            <span>{tabName(tab)}</span>
            {tab !== 'main' && (
              <button
                type="button"
                className="close"
                aria-label={`Close ${tabName(tab)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'closeTab', tab });
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="canvas" onClick={() => dispatch({ type: 'select', id: null })}>
        <div className="canvas-content" style={{ transform: `scale(${state.zoom})` }}>
          <Sequence seqRef={seqRef} blocks={blocks} isRoot />
        </div>
      </div>
      {overlay}
    </div>
  );
}
