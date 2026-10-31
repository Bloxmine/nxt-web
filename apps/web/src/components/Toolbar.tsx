import { formatBattery, LOW_BATTERY_MV } from '../lib/format';
import { iconUrl } from '../lib/icons';
import { useBrick } from '../brick/BrickContext';

export interface ToolButton {
  key: string;
  label: string;
  icon: string;
  onClick(): void;
  disabled?: boolean;
  pressed?: boolean;
}

interface Props {
  groups: { buttons: ToolButton[]; optional?: boolean }[];
  onBrickClick(): void;
}

/** Icon toolbar plus the brick status box on the right. */
export function Toolbar({ groups, onBrickClick }: Props) {
  const brick = useBrick();
  const connected = brick.state === 'connected';
  return (
    <div className="toolbar" role="toolbar" aria-label="Main toolbar">
      {groups.map((group, i) => (
        <div key={i} style={{ display: 'contents' }}>
          {i > 0 && <span className={`tool-sep ${group.optional ? 'optional' : ''}`} />}
          <div className={`tool-group ${group.optional ? 'optional' : ''}`}>
            {group.buttons.map((b) => (
              <button
                key={b.key}
                type="button"
                className={`tool-btn ${b.pressed ? 'pressed' : ''}`}
                title={b.label}
                aria-label={b.label}
                aria-pressed={b.pressed}
                disabled={b.disabled}
                onClick={b.onClick}
              >
                <img src={iconUrl(b.icon)} alt="" />
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="toolbar-right">
        <button
          type="button"
          className="brick-status"
          onClick={onBrickClick}
          title="Open the NXT window"
        >
          <span
            className={`led ${connected ? 'on' : brick.state === 'connecting' ? 'busy' : ''}`}
          />
          {connected ? (
            <>
              <img src={iconUrl(brick.kind === 'Bluetooth' ? 'bluetooth' : 'connect')} alt="" />
              <strong>{brick.summary?.name ?? 'Brick'}</strong>
              {brick.summary && (
                <>
                  <img src={iconUrl(batteryIcon(brick.summary.batteryMillivolts))} alt="" />
                  <span
                    className={
                      brick.summary.batteryMillivolts < LOW_BATTERY_MV ? 'battery-low' : undefined
                    }
                    title={
                      brick.summary.batteryMillivolts < LOW_BATTERY_MV
                        ? 'The battery is low: motors get weaker and sensors less reliable'
                        : undefined
                    }
                  >
                    {formatBattery(brick.summary.batteryMillivolts)}
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              <img src={iconUrl('disconnect')} alt="" />
              No brick connected
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function batteryIcon(mv: number): string {
  if (mv >= 8000) return 'battery_full';
  if (mv >= LOW_BATTERY_MV) return 'battery_half';
  return 'battery_low';
}
