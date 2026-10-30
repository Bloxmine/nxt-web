import {
  categoryOf,
  createBlock,
  iconOf,
  insertBlock,
  isWithin,
  labelOf,
  moveBlock,
  PALETTE,
  CONDITION_ICONS,
  type Block,
  type LoopBlock,
  type SeqRef,
  type SwitchBlock,
} from '@nxt/blocks';
import { Fragment, useState, type MouseEvent } from 'react';
import { currentDrag, endDrag, startDrag } from '../editor/drag';
import { useEditor } from '../editor/EditorContext';
import { iconUrl } from '../lib/icons';
import { blockSummary, conditionText, portsLabel } from '../lib/summary';

/** A row of blocks on a beam, with drop slots between them. */
export function Sequence({
  seqRef,
  blocks,
  isRoot,
}: {
  seqRef: SeqRef;
  blocks: Block[];
  isRoot?: boolean;
}) {
  return (
    <div className="sequence">
      {isRoot && <StartPoint />}
      {blocks.map((block, i) => (
        <Fragment key={block.id}>
          <Slot seqRef={seqRef} index={i} />
          <BlockView block={block} />
        </Fragment>
      ))}
      <Slot seqRef={seqRef} index={blocks.length} last />
    </div>
  );
}

function StartPoint() {
  return (
    <div className="start-point" aria-label="Program start" title="Program start">
      <div className="node" />
      <div className="node main" />
      <div className="node" />
    </div>
  );
}

function Slot({ seqRef, index, last }: { seqRef: SeqRef; index: number; last?: boolean }) {
  const { state, dispatch } = useEditor();
  const [over, setOver] = useState(false);

  const accepts = () => {
    const drag = currentDrag();
    if (!drag) return false;
    if (
      drag.type === 'block' &&
      seqRef.parent !== null &&
      isWithin(state.program, seqRef.parent, drag.id)
    ) {
      return false;
    }
    return true;
  };

  return (
    <div
      className={`slot ${last ? 'last' : ''} ${over ? 'drop-target' : ''}`}
      onDragOver={(e) => {
        if (!accepts()) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = currentDrag()?.type === 'block' ? 'move' : 'copy';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const drag = currentDrag();
        endDrag();
        if (!drag) return;
        if (drag.type === 'block') {
          dispatch({
            type: 'edit',
            update: (p) => moveBlock(p, drag.id, seqRef, index),
            select: drag.id,
          });
          return;
        }
        const block =
          drag.type === 'palette'
            ? PALETTE[drag.key]?.create()
            : ({ ...createBlock('myBlock'), ref: drag.ref } as Block);
        if (!block) return;
        dispatch({
          type: 'edit',
          update: (p) => insertBlock(p, seqRef, index, block),
          select: block.id,
        });
      }}
    />
  );
}

function useBlockProps(block: Block) {
  const { state, dispatch, issuesByBlock } = useEditor();
  const issues = issuesByBlock.get(block.id) ?? [];
  const hasError = issues.some((i) => i.severity === 'error');
  return {
    selected: state.selected === block.id,
    issues,
    hasError,
    handlers: {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.stopPropagation();
        startDrag(e, { type: 'block', id: block.id });
      },
      onDragEnd: endDrag,
      onClick: (e: MouseEvent) => {
        e.stopPropagation();
        dispatch({ type: 'select', id: block.id });
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          dispatch({ type: 'select', id: block.id });
        }
      },
      tabIndex: 0,
    },
  };
}

function IssueBadge({ issues }: { issues: { severity: string; message: string }[] }) {
  if (issues.length === 0) return null;
  const error = issues.some((i) => i.severity === 'error');
  return (
    <span
      className={`issue-badge ${error ? '' : 'warning'}`}
      title={issues.map((i) => i.message).join('\n')}
    >
      !
    </span>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'loop') return <LoopView block={block} />;
  if (block.kind === 'switch') return <SwitchView block={block} />;
  return <BlockTile block={block} />;
}

function BlockTile({ block }: { block: Block }) {
  const { state, dispatch } = useEditor();
  const { selected, issues, hasError, handlers } = useBlockProps(block);
  const myBlock =
    block.kind === 'myBlock' ? state.program.myBlocks.find((m) => m.id === block.ref) : undefined;
  const label = myBlock?.name ?? labelOf(block);
  const summary = myBlock ? myBlock.name : blockSummary(block);

  return (
    <div
      {...handlers}
      role="button"
      aria-label={`${label} block${summary ? `: ${summary}` : ''}`}
      aria-pressed={selected}
      title={label}
      className={`block cat-${categoryOf(block)} kind-${block.kind} ${selected ? 'selected' : ''} ${hasError ? 'has-error' : ''}`}
      onDoubleClick={() => myBlock && dispatch({ type: 'openTab', tab: myBlock.id })}
    >
      <IssueBadge issues={issues} />
      <div className="block-top">
        <div className="block-icon">
          <img src={iconUrl(iconOf(block), 32)} alt="" draggable={false} />
        </div>
        <div className="block-face">
          <span className="ports">{portsLabel(block)}</span>
          <span className={`glyph ${categoryOf(block) === 'flow' ? 'square' : ''}`} />
        </div>
      </div>
      <div className="block-bottom">{summary}</div>
    </div>
  );
}

function loopCapContent(block: LoopBlock) {
  const c = block.control;
  switch (c.type) {
    case 'forever':
      return (
        <span className="count" title="Forever">
          ∞
        </span>
      );
    case 'count':
      return (
        <span className="count" title={`${c.count} times`}>
          ×{c.count}
        </span>
      );
    case 'time':
      return (
        <>
          <img src={iconUrl('hourglass')} alt="" />
          <span className="count">{c.seconds}s</span>
        </>
      );
    case 'sensor':
      return (
        <>
          <img src={iconUrl(CONDITION_ICONS[c.condition.source])} alt="" />
          <span className="count" style={{ fontSize: 8 }}>
            {conditionText(c.condition)}
          </span>
        </>
      );
  }
}

function LoopView({ block }: { block: LoopBlock }) {
  const { state } = useEditor();
  const { selected, issues, handlers } = useBlockProps(block);
  return (
    <div
      {...handlers}
      role="group"
      aria-label="Loop"
      className={`loop ${selected ? 'selected' : ''}`}
      title="Loop"
    >
      <IssueBadge issues={issues} />
      <div className="loop-cap" />
      <Sequence
        seqRef={{ root: state.activeTab, parent: block.id, branch: 'body' }}
        blocks={block.body}
      />
      <div className="loop-cap end">{loopCapContent(block)}</div>
    </div>
  );
}

function SwitchView({ block }: { block: SwitchBlock }) {
  const { state } = useEditor();
  const { selected, issues, handlers } = useBlockProps(block);
  const root = state.activeTab;
  return (
    <div
      {...handlers}
      role="group"
      aria-label={`Switch on ${block.condition.source}: ${conditionText(block.condition)}`}
      className={`switch ${selected ? 'selected' : ''}`}
      title="Switch"
    >
      <IssueBadge issues={issues} />
      <div className="switch-bar">
        <div className="switch-cond" title={conditionText(block.condition)}>
          <img src={iconUrl(CONDITION_ICONS[block.condition.source])} alt="" />
        </div>
        <span style={{ fontSize: 9, fontWeight: 'bold' }}>{portsLabel(block)}</span>
      </div>
      <div className="switch-branches">
        <div className="switch-branch">
          <span className="branch-mark" title="When true">
            <img src={iconUrl('tick')} alt="True" />
          </span>
          <Sequence
            seqRef={{ root, parent: block.id, branch: 'whenTrue' }}
            blocks={block.whenTrue}
          />
        </div>
        <div className="switch-branch">
          <span className="branch-mark" title="When false">
            <img src={iconUrl('cross')} alt="False" />
          </span>
          <Sequence
            seqRef={{ root, parent: block.id, branch: 'whenFalse' }}
            blocks={block.whenFalse}
          />
        </div>
      </div>
      <div className="switch-bar end" />
    </div>
  );
}
