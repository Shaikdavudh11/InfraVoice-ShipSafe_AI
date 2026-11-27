import { useMemo, useState } from 'react';
import {
  AlertOctagon,
  Clock,
  GitCommit,
  MessageSquareCode,
  Search,
  Terminal,
} from 'lucide-react';
import { CodeBlock } from '../components/ui/CodeBlock';
import { IncidentStatusLabel, SeverityLabel } from '../components/ui/SeverityLabel';
import { EmptyState } from '../components/ui/States';
import { Surface } from '../components/ui/Surface';
import { useApp } from '../context/AppContext';
import { INCIDENTS } from '../data/mockData';
import type { Incident, IncidentStatus, Severity } from '../types/infravoice';

export function IncidentsPage() {
  const { selectedIncidentId, setSelectedIncidentId, askInfraVoice, showToast } = useApp();

  const [incidents, setIncidents] = useState<Incident[]>(INCIDENTS);
  const [statusFilter, setStatusFilter] = useState<'all' | IncidentStatus>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailTab, setDetailTab] = useState<'timeline' | 'logs' | 'root_cause' | 'recovery'>('timeline');
  const [logLevelFilter, setLogLevelFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'INFO'>('ALL');

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      const statusMatch = statusFilter === 'all' || inc.status === statusFilter;
      const sevMatch = severityFilter === 'all' || inc.severity === severityFilter;
      const q = searchQuery.trim().toLowerCase();
      const qMatch =
        !q ||
        inc.id.toLowerCase().includes(q) ||
        inc.title.toLowerCase().includes(q) ||
        inc.affectedService.toLowerCase().includes(q);
      return statusMatch && sevMatch && qMatch;
    });
  }, [incidents, statusFilter, severityFilter, searchQuery]);

  const activeIncident = useMemo(() => {
    return (
      filteredIncidents.find((i) => i.id === selectedIncidentId) ||
      filteredIncidents[0] ||
      incidents.find((i) => i.id === selectedIncidentId) ||
      incidents[0]
    );
  }, [filteredIncidents, incidents, selectedIncidentId]);

  const updateIncidentStatus = (id: string, nextStatus: IncidentStatus) => {
    setIncidents((prev) =>
      prev.map((inc) => (inc.id === id ? { ...inc, status: nextStatus } : inc))
    );
    showToast(`${id} marked as ${nextStatus} (preview state)`);
  };

  const filteredLogs = useMemo(() => {
    if (!activeIncident) return [];
    if (logLevelFilter === 'ALL') return activeIncident.logs;
    return activeIncident.logs.filter((l) => l.level === logLevelFilter);
  }, [activeIncident, logLevelFilter]);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">
            Incident Center
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-0.5">
            Investigate Kubernetes and deployment failures with correlated timelines, logs, and recovery commands.
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <Surface className="p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
            {(['all', 'investigating', 'mitigated', 'resolved'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white dark:bg-[#161B22] text-slate-900 dark:text-zinc-100 shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by severity"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as 'all' | Severity)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-xs text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
          </select>
        </div>

        <div className="relative w-full lg:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ID, title, service..."
            aria-label="Search incidents"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </Surface>

      {/* Master-Detail Split */}
      {filteredIncidents.length === 0 ? (
        <Surface>
          <EmptyState
            icon={AlertOctagon}
            title="No incidents match these filters"
            description="Clear the status or severity filter to view all simulated workspace incidents."
            actionLabel="Show all incidents"
            onAction={() => {
              setStatusFilter('all');
              setSeverityFilter('all');
              setSearchQuery('');
            }}
          />
        </Surface>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Incident List */}
          <Surface className="lg:col-span-5 divide-y divide-slate-200 dark:divide-white/[0.06] overflow-hidden">
            {filteredIncidents.map((inc) => {
              const selected = activeIncident?.id === inc.id;
              return (
                <button
                  key={inc.id}
                  type="button"
                  onClick={() => setSelectedIncidentId(inc.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    selected
                      ? 'bg-emerald-500/[0.06]'
                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">
                        {inc.id}
                      </span>
                      <SeverityLabel severity={inc.severity} />
                    </div>
                    <IncidentStatusLabel status={inc.status} />
                  </div>

                  <h3 className="text-[14px] font-semibold text-slate-900 dark:text-zinc-100 mt-1.5">
                    {inc.title}
                  </h3>

                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 line-clamp-2">
                    {inc.summary}
                  </p>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400">
                    <span className="font-mono text-slate-700 dark:text-zinc-300">
                      {inc.affectedService}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{inc.timestamp}</span>
                  </div>
                </button>
              );
            })}
          </Surface>

          {/* Incident Detail View */}
          {activeIncident && (
            <Surface className="lg:col-span-7 p-5 space-y-5">
              {/* Detail Header */}
              <div className="space-y-3 pb-4 border-b border-slate-200 dark:border-white/[0.06]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                    <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
                      {activeIncident.id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <SeverityLabel severity={activeIncident.severity} />
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{activeIncident.namespace}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Clock className="w-3 h-3" />
                      {activeIncident.duration}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      askInfraVoice(
                        `Investigate ${activeIncident.id}: ${activeIncident.title} affecting ${activeIncident.affectedService}.`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <MessageSquareCode className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Ask InfraVoice</span>
                  </button>
                </div>

                <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
                  {activeIncident.title}
                </h2>

                <p className="text-[13px] text-slate-600 dark:text-zinc-300 leading-relaxed">
                  {activeIncident.summary}
                </p>

                {/* Status Control Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 dark:text-zinc-400">Status:</span>
                    <IncidentStatusLabel status={activeIncident.status} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(['investigating', 'mitigated', 'resolved'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => updateIncidentStatus(activeIncident.id, st)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize border transition-colors cursor-pointer ${
                          activeIncident.status === st
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                        }`}
                      >
                        Mark {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Detail Section Tabs */}
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
                {(
                  [
                    { id: 'timeline', label: 'Timeline' },
                    { id: 'logs', label: 'Logs' },
                    { id: 'root_cause', label: 'Root Cause' },
                    { id: 'recovery', label: 'Recovery Actions' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDetailTab(tab.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      detailTab === tab.id
                        ? 'bg-white dark:bg-[#161B22] text-slate-900 dark:text-zinc-100 shadow-xs'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {detailTab === 'timeline' && (
                <div className="space-y-3">
                  {activeIncident.timeline.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                          {ev.title}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-zinc-300">
                          {ev.detail}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
                          Source: {ev.source}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-zinc-400 shrink-0">
                        {ev.timestamp}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {detailTab === 'logs' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Pod stream preview ({activeIncident.affectedService})</span>
                    </span>
                    <div className="flex items-center gap-1">
                      {(['ALL', 'ERROR', 'WARN', 'INFO'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setLogLevelFilter(lvl)}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer ${
                            logLevelFilter === lvl
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                              : 'text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/[0.04]'
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#090B0E] p-3 font-mono text-xs space-y-2 overflow-x-auto">
                    {filteredLogs.length === 0 ? (
                      <div className="text-slate-500 dark:text-zinc-500 py-4 text-center">
                        No {logLevelFilter} log lines captured for this incident.
                      </div>
                    ) : (
                      filteredLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2.5 leading-relaxed">
                          <span className="text-slate-400 dark:text-zinc-500 tabular-nums shrink-0">
                            {log.timestamp}
                          </span>
                          <span
                            className={`shrink-0 font-semibold ${
                              log.level === 'ERROR'
                                ? 'text-red-500'
                                : log.level === 'WARN'
                                  ? 'text-amber-500'
                                  : 'text-sky-500'
                            }`}
                          >
                            {log.level}
                          </span>
                          <span className="text-slate-500 dark:text-zinc-400 shrink-0">
                            [{log.pod}]
                          </span>
                          <span className="text-slate-800 dark:text-zinc-200">{log.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {detailTab === 'root_cause' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#090B0E] space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-mono text-slate-700 dark:text-zinc-300">
                        <GitCommit className="w-3.5 h-3.5 text-emerald-500" />
                        {activeIncident.rootCause.commitRef}
                      </span>
                      <span className="text-slate-500 dark:text-zinc-400">
                        {activeIncident.rootCause.confidence}
                      </span>
                    </div>
                    <p className="text-[13px] text-slate-800 dark:text-zinc-200 leading-relaxed">
                      {activeIncident.rootCause.summary}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200 mb-2">
                      Supporting Evidence
                    </h4>
                    <ul className="space-y-1.5 text-[13px] text-slate-600 dark:text-zinc-300 list-disc pl-4">
                      {activeIncident.rootCause.evidencePoints.map((pt, idx) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {detailTab === 'recovery' && (
                <div className="space-y-4">
                  {activeIncident.recoveryActions.map((act) => (
                    <div
                      key={act.id}
                      className="p-4 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#090B0E] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-[13px] font-semibold text-slate-900 dark:text-zinc-100">
                          {act.title}
                        </h4>
                        <span
                          className={`text-[11px] font-medium ${
                            act.riskLevel === 'safe'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {act.riskLevel === 'safe' ? 'Safe mitigation' : 'Verify before apply'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-zinc-300">{act.rationale}</p>
                      <CodeBlock code={act.command} label="Suggested command" />
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          )}
        </div>
      )}
    </div>
  );
}
