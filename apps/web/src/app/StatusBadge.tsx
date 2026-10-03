import type { RangeStatus } from '@vitaldelta/extraction';
import { STATUS, tone } from './status';

export default function StatusBadge({ status }: { status: RangeStatus }) {
  const { icon, label } = STATUS[status];
  return (
    <span className={`app-status app-status-${tone(status)}`}>
      <span aria-hidden="true">{icon}</span> {label}
    </span>
  );
}
