import { useMemo, useState } from 'react';
import {
  AlertOctagon,
  Check,
  Clock,
  Copy,
  GitCommit,
  MessageSquareCode,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { CodeBlock } from '../components/ui/CodeBlock';
import { IncidentStatusLabel, SeverityLabel } from '../components/ui/SeverityLabel';
import { EmptyState } from '../components/ui/States';
import { Surface } from '../components/ui/Surface';
import { useApp } from '../context/AppContext';
import { INCIDENTS } from '../data/mockData';
import type { IncidentInvestigationReport } from '../lib/ai/schemas/ai-response';
import type { Incident, IncidentStatus, Severity } from '../types/infravoice';

interface IncidentAiResponsePayload {
  incidentId: string;
  model: string;
  investigatedAt: string;
  report: IncidentInvestigationReport;
}

export function IncidentsPage() {
  const { selectedIncidentId, setSelectedIncidentId, askInfraVoice, showToast } = useApp();

  const [incidents, setIncidents] = useState<Incident[]>(INCIDENTS);
  const [statusFilter, setStatusFilter] = useState<'all' | IncidentStatus>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailTab, setDetailTab] = useState<
    'timeline' | 'logs' | 'root_cause' | 'recovery' | 'ai_investigation'
  >('timeline');
  const [logLevelFilter, setLogLevelFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'INFO'>('ALL');
  const [rawEvidenceInput, setRawEvidenceInput] = useState('');
  const [showEvidenceInput, setShowEvidenceInput] = useState(false);

  const [aiReports, setAiReports] = useState<Record<string, IncidentAiResponsePayload>>({});
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [aiError, setAiError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [copiedReportId, setCopiedReportId] = useState<string | null>(null);

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

  const activeAiReport = activeIncident ? aiReports[activeIncident.id] : undefined;

  const runIncidentInvestigation = async () => {
    if (!activeIncident || isInvestigating) return;
    setDetailTab('ai_investigation');
    setIsInvestigating(true);
    setAiError(null);

    try {
      const response = await fetch('/api/incidents/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident: {
            id: activeIncident.id,
            title: activeIncident.title,
            severity: activeIncident.severity,
            status: activeIncident.status,
            affectedService: activeIncident.affectedService,
            namespace: activeIncident.namespace,
            timestamp: activeIncident.timestamp,
            summary: activeIncident.summary,
            timeline: activeIncident.timeline.map((t) => ({
              timestamp: t.timestamp,
              source: t.source,
              title: t.title,
              detail: t.detail,
            })),
            logs: activeIncident.logs.map((l) => ({
              timestamp: l.timestamp,
              level: l.level,
              pod: l.pod,
              message: l.message,
            })),
            rawEvidenceText: rawEvidenceInput.trim() || undefined,
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setAiError({
          message: payload?.error || 'Unable to generate incident investigation report.',
          retryable: Boolean(payload?.retryable ?? true),
        });
        return;
      }

      setAiReports((prev) => ({
        ...prev,
        [activeIncident.id]: payload as IncidentAiResponsePayload,
      }));
      showToast(`Gemini investigation ready for ${activeIncident.id}`);
    } catch {
      setAiError({
        message: 'Unable to reach Incident Intelligence API. Verify server connectivity and retry.',
        retryable: true,
      });
    } finally {
      setIsInvestigating(false);
    }
  };

  const handleCopyReport = async () => {
    if (!activeIncident || !activeAiReport) return;
    const { report } = activeAiReport;
    const text = [
      `Incident Investigation: ${activeIncident.id} (${activeIncident.affectedService})`,
      `Severity Estimate: ${report.severityEstimate}`,
      '',
      `Summary: ${report.incidentSummary}`,
      '',
      'Confirmed Evidence:',
      ...report.confirmedEvidence.map((e) => `- ${e}`),
      '',
      'Inferred Causes:',
      ...report.inferredCauses.map((c) => `- [${c.confidence}] ${c.cause} (${c.supportingEvidence})`),
      '',
      'Unverified Hypotheses:',
      ...report.unverifiedHypotheses.map((h) => `- ${h}`),
      '',
      'Verification Steps:',
      ...report.verificationSteps.map((v, idx) => `${idx + 1}. ${v}`),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedReportId(activeIncident.id);
      window.setTimeout(() => setCopiedReportId(null), 1800);
    } catch {
      showToast('Clipboard permission unavailable');
    }
  };

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

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={runIncidentInvestigation}
                      disabled={isInvestigating}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isInvestigating ? 'Investigating...' : 'Investigate with Gemini'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        askInfraVoice(
                          `Investigate ${activeIncident.id}: ${activeIncident.title} affecting ${activeIncident.affectedService}. Walk me through confirmed evidence and safe diagnostic steps.`,
                          { contextType: 'incident', incidentId: activeIncident.id }
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <MessageSquareCode className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Ask InfraVoice</span>
                    </button>
                  </div>
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

              {/* Optional Pasted Evidence Drawer */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowEvidenceInput((v) => !v)}
                  className="text-xs font-medium text-slate-600 dark:text-zinc-400 hover:text-emerald-500 transition-colors cursor-pointer"
                >
                  {showEvidenceInput
                    ? 'Hide additional log / kubectl output input'
                    : '+ Attach additional logs or kubectl describe output (optional)'}
                </button>
                {showEvidenceInput && (
                  <textarea
                    rows={4}
                    value={rawEvidenceInput}
                    onChange={(e) => setRawEvidenceInput(e.target.value)}
                    placeholder="Paste real kubectl describe pod, pod logs, or deployment events here before running Investigate with Gemini..."
                    aria-label="Additional incident log or kubectl evidence"
                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] font-mono text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                )}
              </div>

              {/* Detail Section Tabs */}
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
                {(
                  [
                    { id: 'timeline', label: 'Timeline' },
                    { id: 'logs', label: 'Logs' },
                    { id: 'root_cause', label: 'Root Cause' },
                    { id: 'recovery', label: 'Recovery Actions' },
                    { id: 'ai_investigation', label: 'Gemini Report' },
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

              {detailTab === 'ai_investigation' && (
                <div className="space-y-4">
                  {isInvestigating && (
                    <div className="p-4 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#090B0E] space-y-3 animate-pulse">
                      <div className="text-xs text-slate-500 dark:text-zinc-400">
                        Gemini SRE engine correlating timeline events and log signals...
                      </div>
                      <div className="h-3.5 w-3/4 rounded bg-slate-200 dark:bg-white/[0.08]" />
                      <div className="h-3 w-full rounded bg-slate-200/70 dark:bg-white/[0.05]" />
                      <div className="h-3 w-2/3 rounded bg-slate-200/70 dark:bg-white/[0.05]" />
                    </div>
                  )}

                  {aiError && !isInvestigating && (
                    <div
                      role="alert"
                      className="p-4 rounded-lg border border-red-500/25 bg-red-500/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="text-xs text-red-600 dark:text-red-400">
                        <div className="font-semibold">Incident Investigation Failed</div>
                        <p className="mt-0.5">{aiError.message}</p>
                      </div>
                      {aiError.retryable && (
                        <button
                          type="button"
                          onClick={runIncidentInvestigation}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-white dark:bg-[#090B0E] text-xs font-medium text-red-600 dark:text-red-300 hover:bg-red-500/10 shrink-0 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry</span>
                        </button>
                      )}
                    </div>
                  )}

                  {!isInvestigating && !aiError && !activeAiReport && (
                    <EmptyState
                      icon={Sparkles}
                      title="No Gemini investigation run for this incident yet"
                      description="Click Investigate with Gemini above to separate confirmed log evidence from inferred causes, unverified hypotheses, and safe verification commands."
                      actionLabel="Investigate with Gemini"
                      onAction={runIncidentInvestigation}
                    />
                  )}

                  {!isInvestigating && activeAiReport && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-white/[0.06]">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                          <SeverityLabel severity={activeAiReport.report.severityEstimate} />
                          <span className="font-mono">Model: {activeAiReport.model}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleCopyReport}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-white/[0.08] text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] cursor-pointer"
                          >
                            {copiedReportId === activeIncident.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Report</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={runIncidentInvestigation}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-white/[0.08] text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Re-run</span>
                          </button>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] space-y-1.5">
                        <div className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          Incident Summary
                        </div>
                        <p className="text-[13px] text-slate-700 dark:text-zinc-300 leading-relaxed">
                          {activeAiReport.report.incidentSummary}
                        </p>
                      </div>

                      {/* Strict Epistemic Separation: Confirmed vs Inferred vs Unverified */}
                      <div className="grid grid-cols-1 gap-3">
                        <div className="p-3.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] space-y-1.5">
                          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            Confirmed Evidence (Observed in Logs / Timeline)
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700 dark:text-zinc-300">
                            {activeAiReport.report.confirmedEvidence.map((ev, i) => (
                              <li key={i}>{ev}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="p-3.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.04] space-y-2">
                          <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                            Inferred Probable Causes
                          </div>
                          <div className="space-y-2">
                            {activeAiReport.report.inferredCauses.map((c, i) => (
                              <div key={i} className="text-xs space-y-0.5">
                                <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-zinc-100">
                                  <span className="px-1.5 py-0.5 rounded font-mono text-[10px] uppercase bg-amber-500/15 text-amber-600 dark:text-amber-300">
                                    {c.confidence} confidence
                                  </span>
                                  <span>{c.cause}</span>
                                </div>
                                <p className="text-slate-600 dark:text-zinc-400">
                                  Supporting signal: {c.supportingEvidence}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {activeAiReport.report.unverifiedHypotheses.length > 0 && (
                          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#090B0E] space-y-1.5">
                            <div className="text-xs font-semibold text-slate-700 dark:text-zinc-200">
                              Unverified Hypotheses (Needs Diagnostic Confirmation)
                            </div>
                            <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600 dark:text-zinc-300">
                              {activeAiReport.report.unverifiedHypotheses.map((h, i) => (
                                <li key={i}>{h}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Diagnostic Commands */}
                      {activeAiReport.report.recommendedInvestigationSteps.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            Read-Only Diagnostic Steps
                          </div>
                          {activeAiReport.report.recommendedInvestigationSteps.map((st, idx) => (
                            <div
                              key={idx}
                              className="p-3.5 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] space-y-2"
                            >
                              <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">
                                {idx + 1}. {st.step}
                              </div>
                              {st.command && <CodeBlock code={st.command} label="Diagnostic command" />}
                              <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                                Risk note: {st.riskNote}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Immediate Mitigation */}
                      {activeAiReport.report.immediateMitigation.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            Safe Immediate Mitigation (Requires Engineer Approval)
                          </div>
                          {activeAiReport.report.immediateMitigation.map((m, idx) => (
                            <div
                              key={idx}
                              className="p-3.5 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] space-y-2"
                            >
                              <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">
                                {m.action}
                              </div>
                              {m.command && <CodeBlock code={m.command} label="Mitigation command" />}
                              <div className="text-[11px] text-amber-600 dark:text-amber-400">
                                Safety check: {m.safetyNote}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Prevention & Verification */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] space-y-1.5">
                          <div className="font-semibold text-slate-800 dark:text-zinc-200">
                            Post-Mitigation Verification
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-zinc-300">
                            {activeAiReport.report.verificationSteps.map((vs, idx) => (
                              <li key={idx}>{vs}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] space-y-1.5">
                          <div className="font-semibold text-slate-800 dark:text-zinc-200">
                            Long-Term Prevention
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-zinc-300">
                            {activeAiReport.report.longTermPrevention.map((lp, idx) => (
                              <li key={idx}>{lp}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {activeAiReport.report.missingEvidenceQuestions.length > 0 && (
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/50 dark:bg-[#090B0E] text-xs space-y-1">
                          <div className="font-semibold text-slate-700 dark:text-zinc-200">
                            Additional Evidence Needed
                          </div>
                          <ul className="list-disc pl-4 space-y-0.5 text-slate-500 dark:text-zinc-400">
                            {activeAiReport.report.missingEvidenceQuestions.map((q, idx) => (
                              <li key={idx}>{q}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Surface>
          )}
        </div>
      )}
    </div>
  );
}
