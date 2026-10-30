import { validateProgram, type Issue } from '@nxt/blocks';
import { createContext, useContext, useMemo, type Dispatch } from 'react';
import type { EditorAction, EditorState } from './store';

export interface EditorContextValue {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  issues: Issue[];
  issuesByBlock: Map<string, Issue[]>;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error('useEditor must be used inside EditorContext');
  return value;
}

/** Validation results, recomputed when the program changes. */
export function useIssues(
  state: EditorState,
): Pick<EditorContextValue, 'issues' | 'issuesByBlock'> {
  return useMemo(() => {
    const issues = validateProgram(state.program);
    const issuesByBlock = new Map<string, Issue[]>();
    for (const issue of issues) {
      issuesByBlock.set(issue.blockId, [...(issuesByBlock.get(issue.blockId) ?? []), issue]);
    }
    return { issues, issuesByBlock };
  }, [state.program]);
}
