import {
  EXAMPLES,
  findBlock,
  labelOf,
  PALETTE,
  tabOf,
  walkProgram,
  type Block,
  type Example,
} from '@nxt/blocks';
import { useEditor } from '../editor/EditorContext';
import { BLOCK_SECTIONS } from '../guide/blocks';
import { BLOCK_TIPS } from '../lib/blockTips';
import { iconUrl } from '../lib/icons';

let examplesByKind: Map<Block['kind'], Example[]> | null = null;

/** Examples that use a kind of block (worked out once). */
function examplesWith(kind: Block['kind']): Example[] {
  if (!examplesByKind) {
    examplesByKind = new Map();
    for (const ex of EXAMPLES) {
      const kinds = new Set<Block['kind']>();
      walkProgram(ex.create(), (b) => kinds.add(b.kind));
      for (const k of kinds) examplesByKind.set(k, [...(examplesByKind.get(k) ?? []), ex]);
    }
  }
  return examplesByKind.get(kind) ?? [];
}

/** The palette entry a block comes from ("my-block" for a My Block). */
function paletteKey(block: Block): string {
  switch (block.kind) {
    case 'wait':
      return block.control.type === 'time' ? 'wait-time' : `wait-${block.control.condition.source}`;
    case 'sensor':
      return `sensor-${block.condition.source}`;
    case 'resetRotation':
      return 'reset-rotation';
    case 'resetTimer':
      return 'reset-timer';
    case 'colorLamp':
      return 'color-lamp';
    case 'numberToText':
      return 'number-to-text';
    case 'file':
      return 'file-access';
    case 'sendMessage':
      return 'send-message';
    case 'receiveMessage':
      return 'receive-message';
    case 'myBlock':
      return 'my-block';
    case 'myBlockParam':
      return 'my-block-param';
    default:
      return block.kind;
  }
}

function helpFor(block: Block): string {
  return (
    PALETTE[paletteKey(block)]?.help ??
    (block.kind === 'myBlock' ? 'A block you made from other blocks.' : '')
  );
}

/**
 * "Little help" box: describes the selected block with tips and examples that use it,
 * and lists problems.
 */
export function HelpPanel({
  onOpenExample,
  onOpenGuide,
}: {
  onOpenExample(key: string): void;
  /** Opens the user guide at a section. */
  onOpenGuide(section: string): void;
}) {
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
            {(BLOCK_TIPS[found.block.kind] ?? []).length > 0 && (
              <ul className="help-tips">
                {BLOCK_TIPS[found.block.kind]!.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            )}
            {examplesWith(found.block.kind).length > 0 && (
              <p className="help-examples">
                <span className="sim-muted">See it in: </span>
                {examplesWith(found.block.kind)
                  .slice(0, 4)
                  .map((ex, i) => (
                    <span key={ex.key}>
                      {i > 0 && ', '}
                      <button
                        type="button"
                        className="link-btn"
                        title={`Open the example "${ex.name}"`}
                        onClick={() => onOpenExample(ex.key)}
                      >
                        {ex.name}
                      </button>
                    </span>
                  ))}
              </p>
            )}
            {BLOCK_SECTIONS[paletteKey(found.block)] && (
              <p className="help-examples">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => onOpenGuide(BLOCK_SECTIONS[paletteKey(found.block)]!)}
                >
                  All settings and plugs of this block
                </button>
              </p>
            )}
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
                    if (where) dispatch({ type: 'openTab', tab: tabOf(where.ref.root) });
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
