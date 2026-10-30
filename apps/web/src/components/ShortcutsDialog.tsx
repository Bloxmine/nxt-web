import { Dialog } from './Dialog';

const GROUPS: [string, [string, string][]][] = [
  [
    'Program',
    [
      ['Ctrl+S', 'Save (Ctrl+Shift+S: save as)'],
      ['Ctrl+O', 'Open a program'],
      ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
      ['Ctrl+K', 'Command palette: find any command, block or example'],
      ['Ctrl+F', 'Find in the program'],
    ],
  ],
  [
    'Blocks',
    [
      ['I or Insert', 'Insert a block after the selected one'],
      ['W', 'Connect a data wire'],
      ['Ctrl+C / X / V', 'Copy, cut, paste'],
      ['Ctrl+D', 'Duplicate'],
      ['Ctrl+A', 'Select all'],
      ['Delete', 'Delete the selected blocks'],
      ['Arrow keys', 'Move the selection between blocks'],
      ['Alt+← / Alt+→', 'Move the selected block along the beam'],
      ['Escape', 'Clear the selection or close a dialog'],
      ['Ctrl++ / Ctrl+-', 'Zoom in / out'],
    ],
  ],
  [
    'Simulator',
    [
      ['F5', 'Run in the simulator'],
      ['F9', 'Toggle a breakpoint on the selected block'],
      ['← Enter →', 'The brick’s buttons, while the simulator has focus'],
    ],
  ],
];

/** Help → Keyboard shortcuts. */
export function ShortcutsDialog({ onClose }: { onClose(): void }) {
  return (
    <Dialog title="Keyboard shortcuts" icon="keyboard" width={520} onClose={onClose}>
      {GROUPS.map(([title, rows]) => (
        <fieldset key={title} className="groupbox">
          <legend>{title}</legend>
          <table className="shortcut-table">
            <tbody>
              {rows.map(([keys, what]) => (
                <tr key={keys}>
                  <th>
                    <kbd>{keys}</kbd>
                  </th>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
      ))}
    </Dialog>
  );
}
