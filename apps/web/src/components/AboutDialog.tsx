import { iconUrl } from '../lib/icons';
import { Dialog } from './Dialog';

export function AboutDialog({ onClose }: { onClose(): void }) {
  return (
    <Dialog
      title="About NXT Web Studio"
      icon="information"
      width={440}
      onClose={onClose}
      footer={
        <button type="button" className="btn primary" onClick={onClose}>
          OK
        </button>
      }
    >
      <div style={{ display: 'flex', gap: 12 }}>
        <img src={iconUrl('brick', 32)} alt="" width={32} height={32} />
        <div>
          <p style={{ marginTop: 0 }}>
            <strong>NXT Web Studio</strong>
            <br />
            Visual programming for the NXT brick, in your browser.
          </p>
          <p>
            An independent, open-source project (MIT licence). Not affiliated with, endorsed by, or
            sponsored by the LEGO Group. LEGO and MINDSTORMS are trademarks of the LEGO Group.
          </p>
          <p className="credits">
            Icons:{' '}
            <a href="http://www.fatcow.com/free-icons" target="_blank" rel="noreferrer">
              FatCow Farm-Fresh Web Icons
            </a>
            , licensed under{' '}
            <a
              href="https://creativecommons.org/licenses/by/3.0/us/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY 3.0
            </a>
            .
          </p>
        </div>
      </div>
    </Dialog>
  );
}

export function MessageDialog({
  title,
  icon,
  children,
  onClose,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  onClose(): void;
}) {
  return (
    <Dialog
      title={title}
      icon={icon}
      width={440}
      onClose={onClose}
      footer={
        <button type="button" className="btn primary" onClick={onClose}>
          OK
        </button>
      }
    >
      <div style={{ display: 'flex', gap: 12 }}>
        <img src={iconUrl(icon, 32)} alt="" width={32} height={32} />
        <div>{children}</div>
      </div>
    </Dialog>
  );
}
