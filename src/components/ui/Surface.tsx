import React from 'react';

interface SurfaceProps {
  children: React.ReactNode;
  className?: string;
}

export function Surface({ children, className = '' }: SurfaceProps) {
  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0F1216] ${className}`}
    >
      {children}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-zinc-100">
          {title}
        </h2>
        {description && (
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
