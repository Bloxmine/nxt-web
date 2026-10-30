import { walkProgram, type Program } from '@nxt/blocks';
import { useState } from 'react';
import { useEditor } from '../editor/EditorContext';
import { iconUrl } from '../lib/icons';
import { Dialog } from './Dialog';

/** Add and delete number variables (Edit → Define Variables). */
export function VariablesDialog({ onClose }: { onClose(): void }) {
  const { state, dispatch } = useEditor();
  const [name, setName] = useState('');
  const names = state.program.variables.map((v) => v.name);
  const trimmed = name.trim();
  const invalid = trimmed === '' || names.includes(trimmed) || trimmed.startsWith('__');

  const usage = (variable: string, program: Program) => {
    let count = 0;
    walkProgram(program, (b) => {
      if (
        (b.kind === 'variable' && b.name === variable) ||
        (b.kind === 'display' && b.action === 'variable' && b.variable === variable)
      ) {
        count++;
      }
    });
    return count;
  };

  return (
    <Dialog
      title="Edit Variables"
      icon="tag_red"
      width={380}
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="list-box" style={{ marginBottom: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.program.variables.map((v) => (
              <tr key={v.name}>
                <td>{v.name}</td>
                <td>Number</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ minWidth: 0 }}
                    aria-label={`Delete ${v.name}`}
                    onClick={() => {
                      const used = usage(v.name, state.program);
                      if (
                        used &&
                        !window.confirm(
                          `"${v.name}" is used by ${used} block(s). Delete it anyway?`,
                        )
                      )
                        return;
                      dispatch({
                        type: 'edit',
                        update: (p) => ({
                          ...p,
                          variables: p.variables.filter((x) => x.name !== v.name),
                        }),
                      });
                    }}
                  >
                    <img src={iconUrl('delete')} alt="" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        style={{ display: 'flex', gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (invalid) return;
          dispatch({
            type: 'edit',
            update: (p) => ({
              ...p,
              variables: [...p.variables, { name: trimmed, type: 'number' }],
            }),
          });
          setName('');
        }}
      >
        <input
          className="text-input"
          aria-label="New variable name"
          placeholder="New variable name"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn" disabled={invalid}>
          <img src={iconUrl('tag_red')} alt="" />
          Create
        </button>
      </form>
    </Dialog>
  );
}
