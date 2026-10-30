import {
  categoryOf,
  CONDITION_ICONS,
  createBlock,
  iconOf,
  insertBlock,
  isWithin,
  labelOf,
  moveBlock,
  PALETTE,
  plugsOf,
  updateBlock,
  type Block,
  type LoopBlock,
  type Plug,
  type SeqRef,
  type SwitchBlock,
} from '@nxt/blocks';
import { Fragment, useState, type MouseEvent } from 'react';
import { currentDrag, endDrag, startDrag } from '../editor/drag';
import { useEditor } from '../editor/EditorContext';
import { useDebugView } from '../sim/SimulatorContext';
import { useWiring } from '../editor/wiring';
import { iconUrl } from '../lib/icons';
import { blockSummary, conditionText, portsLabel } from '../lib/summary';

// Layout: every item in a sequence is shifted down so its beam line matches
// the sequence's beam line. These numbers mirror classic.css.
const TILE_BEAM = 25; // border + half of the 48px tile top
const SLOT_HALF = 24; // slots are 48px tall with the beam in the middle
const LOOP_TOP = 7 + 22; // frame border + top padding
const SWITCH_TOP = 3 + 4; // frame border + branch padding

function itemBeam(block: Block): number {
  if (block.kind === 'loop') return LOOP_TOP + sequenceBeam(block.body);
  if (block.kind === 'switch')
    return SWITCH_TOP + sequenceBeam(block.cases?.[0]?.blocks ?? block.whenTrue);
  return TILE_BEAM;
}

/** Distance from the top of a sequence to its beam line. */
export function sequenceBeam(blocks: readonly Block[]): number {
  return Math.max(TILE_BEAM, ...blocks.map(itemBeam));
}

/** A row of blocks on a beam, with drop slots between them. */
export function Sequence({ seqRef, blocks }: { seqRef: SeqRef; blocks: Block[] }) {
  const beam = sequenceBeam(blocks);
  return (
    <div className="sequence">
      {blocks.map((block, i) => (
        <Fragment key={block.id}>
          <Slot seqRef={seqRef} index={i} top={beam - SLOT_HALF} />
          <div style={{ marginTop: beam - itemBeam(block) }}>
            <BlockView block={block} root={seqRef.root} />
          </div>
        </Fragment>
      ))}
      <Slot seqRef={seqRef} index={blocks.length} top={beam - SLOT_HALF} last />
    </div>
  );
}

function Slot({
  seqRef,
  index,
  last,
  top,
}: {
  seqRef: SeqRef;
  index: number;
  last?: boolean;
  top: number;
}) {
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
      style={{ marginTop: top }}
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
  const debug = useDebugView();
  const issues = issuesByBlock.get(block.id) ?? [];
  const debugClass = `${debug.active.has(block.id) ? 'sim-active' : ''} ${debug.breakpoints.has(block.id) ? 'has-breakpoint' : ''}`;
  return {
    debugClass,
    selected: state.selected === block.id,
    issues,
    hasError: issues.some((i) => i.severity === 'error'),
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
        if (e.target !== e.currentTarget) return;
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

function BlockView({ block, root }: { block: Block; root: string }) {
  if (block.kind === 'loop') return <LoopView block={block} root={root} />;
  if (block.kind === 'switch') return <SwitchView block={block} root={root} />;
  return <BlockTile block={block} />;
}

/** One plug socket. Press and drag from it to draw a wire. */
function Socket({ block, plug, side }: { block: Block; plug: Plug; side: 'in' | 'out' }) {
  const { state } = useEditor();
  const wiring = useWiring();
  const connected = state.program.wires.some((w) =>
    side === 'in'
      ? w.to.block === block.id && w.to.plug === plug.name
      : w.from.block === block.id && w.from.plug === plug.name,
  );
  return (
    <span
      className={`socket ${side} type-${plug.type} ${connected ? 'connected' : ''}`}
      data-plug={`${block.id}:${plug.name}:${side}`}
      title={`${plug.label} (${plug.type === 'logic' ? 'yes/no' : plug.type} ${side === 'in' ? 'input' : 'output'})`}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        wiring.start({ block: block.id, plug: plug.name, side, type: plug.type }, e);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** A row of the data hub: input socket, label, output socket. */
function HubRow({ block, plug }: { block: Block; plug: Plug }) {
  return (
    <div className="hub-row">
      {plug.input ? (
        <Socket block={block} plug={plug} side="in" />
      ) : (
        <span className="socket-gap" />
      )}
      <span className={`hub-label type-${plug.type}`}>{plug.label}</span>
      {plug.output ? (
        <Socket block={block} plug={plug} side="out" />
      ) : (
        <span className="socket-gap" />
      )}
    </div>
  );
}

function BlockTile({ block }: { block: Block }) {
  const { state, dispatch } = useEditor();
  const { selected, issues, hasError, handlers, debugClass } = useBlockProps(block);
  const myBlock =
    block.kind === 'myBlock' ? state.program.myBlocks.find((m) => m.id === block.ref) : undefined;
  const label = myBlock?.name ?? labelOf(block);
  const summary = myBlock ? myBlock.name : blockSummary(block);
  const plugs = plugsOf(block);
  const hasWire = state.program.wires.some(
    (w) => w.from.block === block.id || w.to.block === block.id,
  );
  const hubOpen = plugs.length > 0 && (block.hub === true || hasWire);

  const toggleHub = (e: MouseEvent) => {
    e.stopPropagation();
    if (plugs.length === 0) return;
    if (hubOpen && hasWire) return; // keep wired hubs open, like the classic editor
    dispatch({
      type: 'edit',
      update: (p) => updateBlock(p, block.id, (b) => ({ ...b, hub: !hubOpen })),
    });
  };

  return (
    <div className="block-wrap">
      <div
        {...handlers}
        role="button"
        aria-label={`${label} block${summary ? `: ${summary}` : ''}`}
        aria-pressed={selected}
        title={label}
        className={`block cat-${categoryOf(block)} kind-${block.kind} ${selected ? 'selected' : ''} ${hasError ? 'has-error' : ''} ${debugClass}`}
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
        <div className="block-bottom">
          {plugs.length > 0 && (
            <button
              type="button"
              className={`hub-tab ${hubOpen ? 'open' : ''}`}
              aria-label={hubOpen ? 'Fold data hub in' : 'Fold data hub out'}
              aria-expanded={hubOpen}
              title={hubOpen ? 'Fold the data hub in' : 'Fold the data hub out'}
              onClick={toggleHub}
            />
          )}
          <span className="summary">{summary}</span>
        </div>
      </div>
      {hubOpen && (
        <div className="hub" role="group" aria-label={`${label} data hub`}>
          {plugs.map((plug) => (
            <HubRow key={plug.name} block={block} plug={plug} />
          ))}
        </div>
      )}
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

function LoopView({ block, root }: { block: LoopBlock; root: string }) {
  const { selected, issues, handlers, debugClass } = useBlockProps(block);
  const plugs = plugsOf(block);
  const beam = sequenceBeam(block.body);
  return (
    <div
      {...handlers}
      role="group"
      aria-label="Loop"
      className={`loop ${selected ? 'selected' : ''} ${debugClass}`}
      title="Loop"
    >
      <IssueBadge issues={issues} />
      <div className="loop-cap" />
      <Sequence seqRef={{ root, parent: block.id, branch: 'body' }} blocks={block.body} />
      <div className="loop-cap end" style={{ paddingTop: beam - 12 }}>
        {loopCapContent(block)}
        {plugs.length > 0 && (
          <div className="hub cap-hub">
            {plugs.map((plug) => (
              <HubRow key={plug.name} block={block} plug={plug} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SwitchView({ block, root }: { block: SwitchBlock; root: string }) {
  const { selected, issues, handlers, debugClass } = useBlockProps(block);
  const plugs = plugsOf(block);
  // Value switches have one branch per case; others a true and a false branch.
  const branches: {
    branch: SeqRef['branch'];
    blocks: Block[];
    mark: React.ReactNode;
    title: string;
  }[] = block.cases
    ? block.cases.map((c, i) => ({
        branch: `case:${i}` as SeqRef['branch'],
        blocks: c.blocks,
        title: `Case ${String(c.value)}${(block.defaultCase ?? 0) === i ? ' (default)' : ''}`,
        mark: (
          <span className="case-mark">
            {(block.defaultCase ?? 0) === i ? '★' : ''}
            {String(c.value)}
          </span>
        ),
      }))
    : [
        {
          branch: 'whenTrue',
          blocks: block.whenTrue,
          title: 'When true',
          mark: <img src={iconUrl('tick')} alt="True" />,
        },
        {
          branch: 'whenFalse',
          blocks: block.whenFalse,
          title: 'When false',
          mark: <img src={iconUrl('cross')} alt="False" />,
        },
      ];
  const topBeam = sequenceBeam(branches[0]?.blocks ?? []);
  return (
    <div
      {...handlers}
      role="group"
      aria-label={`Switch on ${block.condition.source}: ${conditionText(block.condition)}`}
      className={`switch ${selected ? 'selected' : ''} ${debugClass}`}
      title="Switch"
    >
      <IssueBadge issues={issues} />
      <div className="switch-bar" style={{ paddingTop: 4 + topBeam - 16 }}>
        <div className="switch-cond" title={conditionText(block.condition)}>
          <img src={iconUrl(CONDITION_ICONS[block.condition.source])} alt="" />
        </div>
        <span style={{ fontSize: 9, fontWeight: 'bold' }}>{portsLabel(block)}</span>
        {plugs.map((plug) => (
          <div key={plug.name} className="hub cap-hub">
            <HubRow block={block} plug={plug} />
          </div>
        ))}
      </div>
      <div className="switch-branches">
        {branches.map((b) => (
          <div key={b.branch} className="switch-branch">
            <span
              className="branch-mark"
              title={b.title}
              style={{ marginTop: sequenceBeam(b.blocks) - 8 }}
            >
              {b.mark}
            </span>
            <Sequence seqRef={{ root, parent: block.id, branch: b.branch }} blocks={b.blocks} />
          </div>
        ))}
      </div>
      <div className="switch-bar end" />
    </div>
  );
}
