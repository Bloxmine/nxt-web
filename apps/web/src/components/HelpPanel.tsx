import { findBlock, labelOf, PALETTE, type Block } from '@nxt/blocks';
import { useEditor } from '../editor/EditorContext';
import { iconUrl } from '../lib/icons';

function helpFor(block: Block): string {
  const key =
    block.kind === 'wait'
      ? block.control.type === 'time'
        ? 'wait-time'
        : `wait-${block.control.condition.source}`
      : block.kind === 'resetRotation'
        ? 'reset-rotation'
        : block.kind === 'resetTimer'
          ? 'reset-timer'
          : block.kind;
  return (
    PALETTE[key]?.help ?? (block.kind === 'myBlock' ? 'A block you made from other blocks.' : '')
  );
}

/** "Little help" box: describes the selected block and lists problems. */
export function HelpPanel() {
  const { state, dispatch, issues, issuesByBlock } = useEditor();
  const found = state.selected ? findBlock(state.program, state.selected) : null;
  const own = found ? (issuesByBlock.get(found.block.id) ?? []) : [];

  return (
    <aside className="help-panel" aria-label="Help">
      <div className="help-title">
        <img src={iconUrl('help')} alt="" />
        {found ? labelOf(found.block) : 'Little Help'}
      </div>
      <div className="help-body">
        {found ? (
          <>
            <p>{helpFor(found.block)}</p>
            {own.map((issue, i) => (
              <div key={i} className="issue-line">
                <img
                  src={iconUrl(issue.severity === 'error' ? 'exclamation' : 'error')}
                  alt={issue.severity}
                />
                {issue.message}
              </div>
            ))}
          </>
        ) : issues.length > 0 ? (
          <>
            <p>
              <strong>
                {issues.filter((i) => i.severity === 'error').length} problem(s) to fix before
                running:
              </strong>
            </p>
            {issues.slice(0, 8).map((issue, i) => (
              <div key={i} className="issue-line">
                <img
                  src={iconUrl(issue.severity === 'error' ? 'exclamation' : 'error')}
                  alt={issue.severity}
                />
                <button
                  type="button"
                  onClick={() => {
                    const where = findBlock(state.program, issue.blockId);
                    if (where) dispatch({ type: 'openTab', tab: where.ref.root });
                    dispatch({ type: 'select', id: issue.blockId });
                  }}
                >
                  {issue.message}
                </button>
              </div>
            ))}
          </>
        ) : (
          <p>
            Drag blocks from the palette on the left onto the beam. Click a block to change its
            settings below. Connect your brick with the button in the toolbar.
          </p>
        )}
      </div>
    </aside>
  );
}
