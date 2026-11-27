import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { IncidentStatus, ScanStatus, Severity } from '../../types/infravoice';

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; colorClass: string; Icon: typeof AlertOctagon }
> = {
  critical: {
    label: 'Critical',
    colorClass: 'text-red-600 dark:text-red-400',
    Icon: AlertOctagon,
  },
  high: {
    label: 'High',
    colorClass: 'text-amber-600 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  medium: {
    label: 'Medium',
    colorClass: 'text-sky-600 dark:text-sky-400',
    Icon: Info,
  },
  low: {
    label: 'Low',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
};

export function SeverityLabel({ severity }: { severity: Severity }) {
  const cfg = SEVERITY_CONFIG[severity];
  const Icon = cfg.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${cfg.colorClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{cfg.label}</span>
    </span>
  );
}

const INCIDENT_STATUS_CONFIG: Record<
  IncidentStatus,
  { label: string; colorClass: string; Icon: typeof Clock }
> = {
  investigating: {
    label: 'Investigating',
    colorClass: 'text-red-600 dark:text-red-400',
    Icon: ShieldAlert,
  },
  mitigated: {
    label: 'Mitigated',
    colorClass: 'text-amber-600 dark:text-amber-400',
    Icon: Clock,
  },
  resolved: {
    label: 'Resolved',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
};

export function IncidentStatusLabel({ status }: { status: IncidentStatus }) {
  const cfg = INCIDENT_STATUS_CONFIG[status];
  const Icon = cfg.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${cfg.colorClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{cfg.label}</span>
    </span>
  );
}

const SCAN_STATUS_CONFIG: Record<
  ScanStatus,
  { label: string; colorClass: string; Icon: typeof CheckCircle2 }
> = {
  passed: {
    label: 'Passed',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  needs_review: {
    label: 'Needs Review',
    colorClass: 'text-amber-600 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  blocked: {
    label: 'Blocked',
    colorClass: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
  },
};

export function ScanStatusLabel({ status }: { status: ScanStatus }) {
  const cfg = SCAN_STATUS_CONFIG[status];
  const Icon = cfg.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${cfg.colorClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{cfg.label}</span>
    </span>
  );
}
