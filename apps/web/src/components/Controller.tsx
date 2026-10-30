import { iconUrl } from '../lib/icons';

interface Props {
  connected: boolean;
  onNxtWindow(): void;
  onDownload(): void;
  onRun(): void;
  onStop(): void;
  onConnect(): void;
}

/** The download/run/stop cluster in the bottom-right corner of the canvas. */
export function Controller({
  connected,
  onNxtWindow,
  onDownload,
  onRun,
  onStop,
  onConnect,
}: Props) {
  return (
    <div className="controller" role="group" aria-label="Brick controller">
      <button
        type="button"
        className="ctl-btn"
        title="NXT window"
        aria-label="NXT window"
        onClick={onNxtWindow}
      >
        <img src={iconUrl('monitor_window')} alt="" />
      </button>
      <button
        type="button"
        className="ctl-btn run"
        title="Download and run"
        aria-label="Download and run"
        onClick={onRun}
      >
        <svg width="26" height="28" viewBox="0 0 26 28" aria-hidden="true">
          <path
            d="M5 3.5 Q3 2.3 3 4.6 V23.4 Q3 25.7 5 24.5 L22.5 15.2 Q24.4 14 22.5 12.8 Z"
            fill="#fff"
            stroke="#c25e00"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      <button
        type="button"
        className="ctl-btn"
        title="Download"
        aria-label="Download"
        onClick={onDownload}
      >
        <img src={iconUrl('download')} alt="" />
      </button>
      <button
        type="button"
        className="ctl-btn"
        title={connected ? 'Connected' : 'Connect to brick'}
        aria-label="Connect to brick"
        onClick={onConnect}
      >
        <img src={iconUrl(connected ? 'connect' : 'disconnect')} alt="" />
      </button>
      <button
        type="button"
        className="ctl-btn"
        title="Stop"
        aria-label="Stop"
        disabled={!connected}
        onClick={onStop}
        style={{ gridColumn: 3, gridRow: 2 }}
      >
        <img src={iconUrl('control_stop')} alt="" />
      </button>
    </div>
  );
}
