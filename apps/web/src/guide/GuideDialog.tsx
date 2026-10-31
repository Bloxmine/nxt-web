import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '../components/Dialog';
import { iconUrl } from '../lib/icons';
import { chapterOf, GUIDE, GUIDE_ACTIONS, searchGuide, type GuideAction } from './content';

const KEY = 'nxt-web-studio:guide-chapter';

function rememberedChapter(): string {
  try {
    const id = localStorage.getItem(KEY);
    if (id && GUIDE.some((c) => c.id === id)) return id;
  } catch {
    // Remembering the chapter is a convenience only.
  }
  return GUIDE[0]!.id;
}

function isAction(target: string): target is GuideAction {
  return target in GUIDE_ACTIONS;
}

/** Inline markup: **bold**, `keys`, [[label|target]]. */
function inline(text: string, onLink: (target: string) => void): ReactNode[] {
  return text.split(/(\*\*.+?\*\*|`[^`]+`|\[\[[^\]]+\]\])/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1)
      return <code key={i}>{part.slice(1, -1)}</code>;
    const link = /^\[\[([^|\]]+)\|([^\]]+)\]\]$/.exec(part);
    if (link) {
      const [, label, target] = link as unknown as [string, string, string];
      const action = !target.startsWith('#');
      return (
        <button
          key={i}
          type="button"
          className={`guide-link ${action ? 'action' : ''}`}
          title={action && isAction(target) ? GUIDE_ACTIONS[target] : undefined}
          onClick={() => onLink(target)}
        >
          {label}
        </button>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** A section's text: paragraphs, lists and Tip/Note/Warning boxes (see content.ts). */
export function GuideText({ body, onLink }: { body: string; onLink(target: string): void }) {
  return (
    <>
      {body.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => l.startsWith('- ')))
          return (
            <ul key={i}>
              {lines.map((l, k) => (
                <li key={k}>{inline(l.slice(2), onLink)}</li>
              ))}
            </ul>
          );
        if (/^\d+\. /.test(lines[0]!)) {
          // Indented lines belong to the step above them (commands to type, for example).
          const steps: string[][] = [];
          for (const l of lines) {
            if (/^\d+\. /.test(l)) steps.push([l.replace(/^\d+\. /, '')]);
            else steps[steps.length - 1]?.push(l.trim());
          }
          return (
            <ol key={i}>
              {steps.map(([first, ...more], k) => (
                <li key={k}>
                  {inline(first!, onLink)}
                  {more.map((m, j) => (
                    <div key={j} className="guide-step-line">
                      {inline(m, onLink)}
                    </div>
                  ))}
                </li>
              ))}
            </ol>
          );
        }
        const callout = /^(Tip|Note|Warning): /.exec(block);
        if (callout) {
          const kind = callout[1]!;
          const icon = kind === 'Tip' ? 'lightbulb' : kind === 'Note' ? 'information' : 'error';
          return (
            <div key={i} className={`guide-callout ${kind.toLowerCase()}`}>
              <img src={iconUrl(icon)} alt="" />
              <p>
                <strong>{kind}:</strong> {inline(block.slice(callout[0].length), onLink)}
              </p>
            </div>
          );
        }
        return <p key={i}>{inline(block, onLink)}</p>;
      })}
    </>
  );
}

/**
 * Help → User guide (F1): chapters on the left, the chosen chapter on the right, and a
 * search box. Links in the text jump to other sections or run app commands.
 */
export function GuideDialog({
  section,
  onClose,
  onAction,
}: {
  /** Section to open at; otherwise the chapter read last. */
  section?: string | undefined;
  onClose(): void;
  onAction(action: GuideAction): void;
}) {
  const [chapterId, setChapterId] = useState(
    () => (section && chapterOf(section)?.id) || rememberedChapter(),
  );
  const [query, setQuery] = useState('');
  // The section to scroll to; `n` changes on every jump, so the same section again still scrolls.
  const [jump, setJump] = useState<{ section: string | null; n: number }>({
    section: section ?? null,
    n: 0,
  });
  const article = useRef<HTMLDivElement>(null);
  const chapterIndex = Math.max(
    0,
    GUIDE.findIndex((c) => c.id === chapterId),
  );
  const chapter = GUIDE[chapterIndex]!;
  const hits = searchGuide(query);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, chapterId);
    } catch {
      // See rememberedChapter.
    }
  }, [chapterId]);

  // Scroll to the section asked for (or the top of a new chapter) once it is shown.
  useEffect(() => {
    const el = article.current;
    if (!el) return;
    const section = jump.section
      ? el.querySelector<HTMLElement>(`[data-section="${jump.section}"]`)
      : null;
    if (section) {
      el.scrollTop = section.offsetTop - el.offsetTop - 8;
      section.classList.remove('flash');
      void section.offsetWidth;
      section.classList.add('flash');
    } else el.scrollTop = 0;
  }, [jump]);

  const show = (sectionId: string | null, inChapter?: string) => {
    const c = inChapter ?? (sectionId ? chapterOf(sectionId)?.id : undefined);
    if (c) setChapterId(c);
    setJump((j) => ({ section: sectionId, n: j.n + 1 }));
  };

  const onLink = (link: string) => {
    if (link.startsWith('#')) show(link.slice(1));
    else if (isAction(link)) onAction(link);
  };

  return (
    <Dialog title="User guide" icon="help" width={940} onClose={onClose}>
      <div className="guide">
        <nav className="guide-nav" aria-label="Chapters">
          <input
            type="search"
            className="guide-search"
            placeholder="Search the guide"
            aria-label="Search the guide"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() ? (
            <ul className="guide-hits">
              {hits.length === 0 && <li className="guide-empty">Nothing found.</li>}
              {hits.map(({ chapter: c, section: s }) => (
                <li key={s.id}>
                  <button type="button" onClick={() => show(s.id, c.id)}>
                    <strong>{s.title}</strong>
                    <span>{c.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ol className="guide-chapters">
              {GUIDE.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={c.id === chapter.id ? 'active' : ''}
                    aria-current={c.id === chapter.id ? 'page' : undefined}
                    onClick={() => show(null, c.id)}
                  >
                    <img src={iconUrl(c.icon)} alt="" />
                    {c.title}
                  </button>
                  {c.id === chapter.id && (
                    <ul>
                      {c.sections.map((s) => (
                        <li key={s.id}>
                          <button type="button" onClick={() => show(s.id, c.id)}>
                            {s.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </nav>
        <div className="guide-article" ref={article} tabIndex={0} aria-label={chapter.title}>
          <h2>
            <img src={iconUrl(chapter.icon, 32)} alt="" width={32} height={32} />
            {chapter.title}
          </h2>
          {chapter.sections.map((s) => (
            <section key={s.id} data-section={s.id}>
              <h3>{s.title}</h3>
              <GuideText body={s.body} onLink={onLink} />
            </section>
          ))}
          <div className="guide-pager">
            {chapterIndex > 0 ? (
              <button
                type="button"
                className="btn"
                onClick={() => show(null, GUIDE[chapterIndex - 1]!.id)}
              >
                ← {GUIDE[chapterIndex - 1]!.title}
              </button>
            ) : (
              <span />
            )}
            {chapterIndex < GUIDE.length - 1 && (
              <button
                type="button"
                className="btn"
                onClick={() => show(null, GUIDE[chapterIndex + 1]!.id)}
              >
                {GUIDE[chapterIndex + 1]!.title} →
              </button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
