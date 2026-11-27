import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-10 h-10 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.03] flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-slate-500 dark:text-zinc-400" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{title}</h3>
      <p className="text-[13px] text-slate-500 dark:text-zinc-400 max-w-md mt-1">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-200 dark:divide-white/[0.06]" aria-busy="true" aria-label="Loading data">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-4 py-3 animate-pulse">
          <div className="flex items-center gap-3 flex-1">
            <div className="h-4 w-40 rounded bg-slate-200 dark:bg-white/[0.06]" />
            <div className="h-3 w-24 rounded bg-slate-200/70 dark:bg-white/[0.04]" />
          </div>
          <div className="h-3 w-16 rounded bg-slate-200/70 dark:bg-white/[0.04]" />
          <div className="h-3 w-20 rounded bg-slate-200/70 dark:bg-white/[0.04]" />
        </div>
      ))}
    </div>
  );
}
