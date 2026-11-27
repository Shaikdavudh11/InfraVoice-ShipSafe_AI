import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  GitBranch,
  History,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { ScanStatusLabel } from '../components/ui/SeverityLabel';
import { EmptyState } from '../components/ui/States';
import { Surface } from '../components/ui/Surface';
import { useApp } from '../context/AppContext';
import { SCAN_HISTORY_RECORDS } from '../data/mockData';
import type { ScanHistoryRecord, ScanStatus } from '../types/infravoice';

export function HistoryPage() {
  const {
    activeWorkspace,
    navigate,
    sessionScanHistory,
    setLatestScanResult,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<'all' | ScanStatus>('all');
  const [workspaceOnly, setWorkspaceOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'risk'>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ScanHistoryRecord | null>(null);

  const combinedRecords = useMemo<ScanHistoryRecord[]>(() => {
    const liveRecords: ScanHistoryRecord[] = sessionScanHistory.map((scan) => {
      const status: ScanStatus =
        scan.severityCounts.critical > 0 || scan.riskScore >= 60
          ? 'blocked'
          : scan.totalFindings > 0
            ? 'needs_review'
            : 'passed';
      const uniqueTypes = Array.from(new Set(scan.fileSummaries.map((f) => f.fileType)));
      return {
        id: scan.scanId,
        workspaceId: activeWorkspace.id,
        repository: `live-session / ${scan.fileSummaries[0]?.fileName ?? 'uploaded-files'}`,
        branch: 'local-upload',
        commitSha: scan.scanId.slice(-7),
        fileTypes: uniqueTypes.length > 0 ? uniqueTypes : ['config'],
        scannedAt: new Date(scan.timestamp).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
        duration: `${scan.scanDurationMs}ms`,
        riskScore: scan.riskScore,
        status,
        findings: {
          critical: scan.severityCounts.critical,
          high: scan.severityCounts.high,
          medium: scan.severityCounts.medium,
          low: scan.severityCounts.low,
        },
        triggeredBy: 'Live Session Scan',
      };
    });

    return [...liveRecords, ...SCAN_HISTORY_RECORDS];
  }, [sessionScanHistory, activeWorkspace.id]);

  const filteredRecords = useMemo(() => {
    const list = combinedRecords.filter((rec) => {
      const wsMatch = !workspaceOnly || rec.workspaceId === activeWorkspace.id;
      const stMatch = statusFilter === 'all' || rec.status === statusFilter;
      const q = searchQuery.trim().toLowerCase();
      const qMatch =
        !q ||
        rec.repository.toLowerCase().includes(q) ||
        rec.branch.toLowerCase().includes(q) ||
        rec.commitSha.toLowerCase().includes(q) ||
        rec.triggeredBy.toLowerCase().includes(q);
      return wsMatch && stMatch && qMatch;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'risk') {
        return sortAsc ? a.riskScore - b.riskScore : b.riskScore - a.riskScore;
      }
      return sortAsc
        ? a.scannedAt.localeCompare(b.scannedAt)
        : b.scannedAt.localeCompare(a.scannedAt);
    });
  }, [combinedRecords, activeWorkspace.id, workspaceOnly, statusFilter, searchQuery, sortBy, sortAsc]);

  const toggleSort = (col: 'date' | 'risk') => {
    if (sortBy === col) {
      setSortAsc((v) => !v);
    } else {
      setSortBy(col);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">
            Scan History
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-0.5">
            Audit trail of pre-deployment ShipSafe scans across repositories and CI pipelines.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/shipsafe')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>New Scan</span>
        </button>
      </div>

      {/* Filter Controls */}
      <Surface className="p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'passed', label: 'Passed' },
                { id: 'needs_review', label: 'Needs Review' },
                { id: 'blocked', label: 'Blocked' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-white dark:bg-[#161B22] text-slate-900 dark:text-zinc-100 shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setWorkspaceOnly((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
              workspaceOnly
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            {workspaceOnly ? `Only ${activeWorkspace.name}` : 'All workspaces'}
          </button>
        </div>

        <div className="relative w-full lg:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search repo, branch, commit..."
            aria-label="Search scan history"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </Surface>

      {/* Data Table */}
      <Surface className="overflow-hidden">
        {filteredRecords.length === 0 ? (
          <EmptyState
            icon={History}
            title="No scan records found"
            description="Adjust the repository search or status filter to see historical scans."
            actionLabel="Reset filters"
            onAction={() => {
              setStatusFilter('all');
              setWorkspaceOnly(false);
              setSearchQuery('');
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.08] text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                  <th className="py-3 px-4">Repository / Branch</th>
                  <th className="py-3 px-4">Targets</th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('date')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-zinc-200 cursor-pointer"
                    >
                      <span>Date</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('risk')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-zinc-200 cursor-pointer"
                    >
                      <span>Risk Score</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">Findings</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/[0.06] text-[13px]">
                {filteredRecords.map((rec) => {
                  const total =
                    rec.findings.critical +
                    rec.findings.high +
                    rec.findings.medium +
                    rec.findings.low;
                  const barColor =
                    rec.riskScore >= 60
                      ? 'bg-red-500'
                      : rec.riskScore >= 35
                        ? 'bg-amber-500'
                        : 'bg-emerald-500';
                  return (
                    <tr
                      key={rec.id}
                      onClick={() => setSelectedRecord(rec)}
                      className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs font-medium text-slate-900 dark:text-zinc-100">
                          {rec.repository}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                          <GitBranch className="w-3 h-3" aria-hidden="true" />
                          <span className="font-mono">{rec.branch}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{rec.commitSha}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-zinc-300 whitespace-nowrap">
                        {rec.fileTypes.join(' · ')}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-xs font-mono tabular-nums text-slate-700 dark:text-zinc-300">
                          {rec.scannedAt}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                          {rec.duration} · {rec.triggeredBy}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
                            <div
                              style={{ width: `${rec.riskScore}%` }}
                              className={`h-full ${barColor}`}
                            />
                          </div>
                          <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-zinc-100 w-6">
                            {rec.riskScore}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono text-xs tabular-nums">
                        <span className="text-slate-900 dark:text-zinc-100 font-semibold">
                          {total}
                        </span>
                        <span className="text-slate-400 dark:text-zinc-500 ml-1.5">
                          ({rec.findings.critical}C / {rec.findings.high}H)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex justify-end">
                          <ScanStatusLabel status={rec.status} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      {/* Scan Detail Drawer */}
      {selectedRecord && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="w-full max-w-md h-full bg-white dark:bg-[#0F1216] border-l border-slate-200 dark:border-white/[0.1] p-5 flex flex-col justify-between overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/[0.08]">
                <div>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                    {selectedRecord.id}
                  </span>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100 font-mono">
                    {selectedRecord.repository}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  aria-label="Close scan details"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#090B0E]">
                  <div className="text-slate-500 dark:text-zinc-400">Risk Score</div>
                  <div className="text-xl font-mono font-semibold tabular-nums mt-1">
                    {selectedRecord.riskScore} / 100
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#090B0E]">
                  <div className="text-slate-500 dark:text-zinc-400">Verdict</div>
                  <div className="mt-2">
                    <ScanStatusLabel status={selectedRecord.status} />
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs border-t border-slate-200 dark:border-white/[0.06] pt-4">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">Branch</span>
                  <span className="font-mono">{selectedRecord.branch}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">Commit SHA</span>
                  <span className="font-mono">{selectedRecord.commitSha}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">Triggered by</span>
                  <span>{selectedRecord.triggeredBy}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">Timestamp</span>
                  <span className="font-mono tabular-nums">{selectedRecord.scannedAt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">Finding Breakdown</span>
                  <span className="font-mono tabular-nums">
                    {selectedRecord.findings.critical}C · {selectedRecord.findings.high}H ·{' '}
                    {selectedRecord.findings.medium}M · {selectedRecord.findings.low}L
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-white/[0.08] flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const liveMatch = sessionScanHistory.find((s) => s.scanId === selectedRecord.id);
                  if (liveMatch) {
                    setLatestScanResult(liveMatch);
                  }
                  setSelectedRecord(null);
                  navigate('/shipsafe');
                }}
                className="flex-1 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
              >
                Open in ShipSafe
              </button>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
