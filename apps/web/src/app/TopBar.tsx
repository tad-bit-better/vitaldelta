import type { StorageMode } from '../storage';
import { backupState } from './backupFile';
import { forProfile, type AppData } from './DataContext';
import { formatDate } from './format';
import { Icon, LogoMark } from './icons';
import Link from './Link';
import Menu from './Menu';
import { DATA_PATH, navigate, patientPath } from './router';
import { buildSeries } from './series';
import { tone } from './status';

type Props = {
  /** Null before the user chooses where data lives. */
  mode: StorageMode | null;
  data: AppData | null;
  demo: boolean;
  activeId: string | null;
  /** Show "Add a report" (not on the add screen itself, nor before the first report). */
  showAdd: boolean;
  install: (() => Promise<void>) | null;
  onExitDemo: () => void;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Logo, patient switcher, where the data stands (backup, session or demo) and Add a report.
 * On phones the status shrinks to an icon, and the rest moves into a menu and the bottom bar.
 */
export default function TopBar({ mode, data, demo, activeId, showAdd, install, onExitDemo }: Props) {
  const hasReports = (data?.reports.length ?? 0) > 0;
  const state = data && mode === 'persistent' && !demo && hasReports ? backupState(data) : null;
  const backupLabel =
    state === 'none'
      ? 'Not backed up'
      : state === 'behind'
        ? 'Backup out of date'
        : state === 'current' && data?.lastBackupAt
          ? `Backed up ${formatDate(data.lastBackupAt.slice(0, 10))}`
          : null;

  return (
    <header className="app-bar">
      <div className="app-bar-start">
        <Link to="/app" className="app-logo" aria-label="VitalDelta home">
          <LogoMark />
          <span className="app-logo-text">VitalDelta</span>
        </Link>
        {data && data.profiles.length > 0 && <PatientSwitcher data={data} activeId={activeId} />}
      </div>

      <div className="app-bar-end">
        {demo ? (
          <span className="app-pill app-pill-demo">
            Demo<span className="app-wide-only"> with made-up data · nothing is saved ·</span>{' '}
            <button type="button" className="app-link-btn app-wide-only" onClick={onExitDemo}>Exit demo</button>
          </span>
        ) : mode === 'session' ? (
          <Link to={DATA_PATH} className="app-pill app-pill-warn" title="Closing this tab erases everything">
            Just this session
          </Link>
        ) : (
          backupLabel && (
            <>
              <Link to={DATA_PATH} className={`app-pill app-wide-only${state === 'current' ? '' : ' app-pill-warn'}`}>
                {state !== 'current' && <span className="app-dot" aria-hidden="true" />}
                {backupLabel}
              </Link>
              <Link to={DATA_PATH} className="app-icon-btn app-narrow-only" aria-label={`Your data: ${backupLabel.toLowerCase()}`}>
                <Icon name="download" size={20} />
                {state !== 'current' && <span className="app-dot app-dot-badge" aria-hidden="true" />}
              </Link>
            </>
          )
        )}
        {install && (
          <button type="button" className="app-btn app-btn-sm app-wide-only" onClick={() => void install()}>
            Install app
          </button>
        )}
        {showAdd && (
          <button type="button" className="app-btn app-btn-primary app-btn-sm app-wide-only" onClick={() => navigate('/app/add')}>
            <Icon name="plus" /> Add a report
          </button>
        )}
        {mode && (
          <Menu label="Menu" className="app-narrow-only" button={<Icon name="dots" size={20} />}>
            <Link to={DATA_PATH} className="app-menu-item">Your data: backup, restore, delete</Link>
            {install && (
              <button type="button" className="app-menu-item" onClick={() => void install()}>Install app</button>
            )}
            {demo && (
              <button type="button" className="app-menu-item" onClick={onExitDemo}>Exit demo</button>
            )}
          </Menu>
        )}
      </div>
    </header>
  );
}

function PatientSwitcher({ data, activeId }: { data: AppData; activeId: string | null }) {
  const active = data.profiles.find((p) => p.id === activeId);
  const count = data.profiles.length;
  return (
    <Menu
      label={`${active ? `${active.name}: ` : ''}switch patient (${plural(count, 'patient')})`}
      className="app-switcher"
      align="start"
      button={
        <>
          <span className="app-switcher-name">{active?.name ?? plural(count, 'patient')}</span>
          {active && <span className="app-switcher-count app-wide-only">· {plural(count, 'patient')}</span>}
          <Icon name="chevron" size={14} />
        </>
      }
    >
      <p className="app-menu-title">Patients</p>
      {data.profiles.map((p) => {
        const { reports, results } = forProfile(data, p.id);
        const outside = buildSeries(reports, results, p.sex).filter((s) => tone(s.latest.status) === 'out').length;
        return (
          <Link key={p.id} to={patientPath(p.id)} className="app-menu-item" aria-current={p.id === activeId ? 'page' : undefined}>
            <span className="app-menu-item-name">{p.name}</span>
            <span className="app-menu-meta">
              {plural(reports.length, 'report')}
              {outside > 0 && (
                <>
                  {' · '}
                  <span className="app-status-out">{outside} outside range</span>
                </>
              )}
            </span>
          </Link>
        );
      })}
      <Link to={DATA_PATH} className="app-menu-item app-menu-footer">Your data: backup, restore, delete</Link>
    </Menu>
  );
}
