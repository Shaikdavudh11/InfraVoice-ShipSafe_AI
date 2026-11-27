import { useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  GitCommit,
  MessageSquareCode,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { ScanStatusLabel, SeverityLabel } from '../components/ui/SeverityLabel';
import { SectionHeader, Surface } from '../components/ui/Surface';
import { useApp } from '../context/AppContext';
import { ACTIVITY_EVENTS, INCIDENTS } from '../data/mockData';
import type { Severity } from '../types/infravoice';

export function OverviewPage() {
  const {
    activeWorkspace,
    navigate,
    openIncident,
    openShipSafeWithSeverity,
    latestScanResult,
    simulationState,
  } = useApp();
  const [activityFilter, setActivityFilter] = useState<'all' | 'deployment' | 'scan' | 'incident'>('all');
  const [showAllWorkspaces, setShowAllWorkspaces] = useState(false);

  const simTotalRestarts = useMemo(
    () => (simulationState ? simulationState.pods.reduce((s, p) => s + p.restarts, 0) : 0),
    [simulationState]
  );

  const simBadgeStyle = useMemo(() => {
    const status = simulationState?.activeIncident?.status === 'resolved'
      ? 'resolved'
      : simulationState?.cluster.status || 'healthy';
    if (status === 'critical') {
      return {
        label: 'Critical',
        cls: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300',
      };
    }
    if (status === 'degraded') {
      return {
        label: 'Degraded',
        cls: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
      };
    }
    if (status === 'recovering') {
      return {
        label: 'Recovering',
        cls: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300',
      };
    }
    if (status === 'resolved') {
      return {
        label: 'Resolved',
        cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
      };
    }
    return {
      label: 'Healthy',
      cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    };
  }, [simulationState]);

  const effectiveRiskScore = latestScanResult
    ? latestScanResult.riskScore
    : activeWorkspace.riskScore;

  const effectiveRiskLabel = latestScanResult
    ? latestScanResult.riskLabel
    : activeWorkspace.riskLabel;

  const effectiveOpenFindings = latestScanResult
    ? {
        critical: latestScanResult.severityCounts.critical,
        high: latestScanResult.severityCounts.high,
        medium: latestScanResult.severityCounts.medium,
        low: latestScanResult.severityCounts.low,
      }
    : activeWorkspace.openFindings;

  const effectiveVerdict = latestScanResult
    ? latestScanResult.severityCounts.critical > 0 || latestScanResult.riskScore >= 60
      ? ('blocked' as const)
      : latestScanResult.totalFindings > 0
        ? ('needs_review' as const)
        : ('passed' as const)
    : activeWorkspace.lastScanSummary.verdict;

  const totalFindings = latestScanResult
    ? latestScanResult.totalFindings
    : effectiveOpenFindings.critical +
      effectiveOpenFindings.high +
      effectiveOpenFindings.medium +
      effectiveOpenFindings.low;

  const workspaceIncidents = useMemo(
    () => INCIDENTS.filter((i) => i.workspaceId === activeWorkspace.id),
    [activeWorkspace.id]
  );

  const hasOpenSimIncident = Boolean(
    simulationState?.activeIncident && simulationState.activeIncident.status !== 'resolved'
  );

  const totalActiveIncidentCount =
    workspaceIncidents.filter((i) => i.status !== 'resolved').length +
    (hasOpenSimIncident ? 1 : 0);

  const totalInvestigatingCount =
    workspaceIncidents.filter((i) => i.status === 'investigating').length +
    (simulationState?.activeIncident?.status === 'investigating' ||
    simulationState?.activeIncident?.status === 'open'
      ? 1
      : 0);

  const filteredActivity = useMemo(() => {
    return ACTIVITY_EVENTS.filter((item) => {
      const wsMatch = showAllWorkspaces || item.workspaceId === activeWorkspace.id;
      const typeMatch = activityFilter === 'all' || item.type === activityFilter;
      return wsMatch && typeMatch;
    });
  }, [activeWorkspace.id, activityFilter, showAllWorkspaces]);

  const activeIncident = useMemo(
    () =>
      INCIDENTS.find((i) => i.workspaceId === activeWorkspace.id && i.status === 'investigating') ||
      INCIDENTS[0],
    [activeWorkspace.id]
  );

  const severityBreakdown: { key: Severity; count: number; barClass: string }[] = [
    { key: 'critical', count: effectiveOpenFindings.critical, barClass: 'bg-red-500' },
    { key: 'high', count: effectiveOpenFindings.high, barClass: 'bg-amber-500' },
    { key: 'medium', count: effectiveOpenFindings.medium, barClass: 'bg-sky-500' },
    { key: 'low', count: effectiveOpenFindings.low, barClass: 'bg-emerald-500' },
  ];

  // SVG Risk Arc math
  const radius = 52;
  const circumference = Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, effectiveRiskScore));
  const strokeOffset = circumference - (clampedScore / 100) * circumference;

  const arcColor =
    clampedScore >= 60
      ? 'stroke-red-500'
      : clampedScore >= 30
        ? 'stroke-amber-500'
        : 'stroke-emerald-500';

  // 14-day trend polyline
  const trendPoints = activeWorkspace.riskTrend;
  const minVal = Math.min(...trendPoints) - 5;
  const maxVal = Math.max(...trendPoints) + 5;
  const svgPoints = trendPoints
    .map((val, idx) => {
      const x = (idx / (trendPoints.length - 1)) * 220;
      const y = 44 - ((val - minVal) / Math.max(1, maxVal - minVal)) * 36;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="space-y-6">
      {/* Page Header & Quick Actions */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100 text-balance">
            Talk to your infrastructure. Ship with confidence.
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1">
            Cluster <span className="font-mono text-slate-700 dark:text-zinc-300">{activeWorkspace.cluster}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>{activeWorkspace.region}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>Simulated telemetry preview</span>
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/shipsafe')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Scan Configuration</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/infravoice')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#0F1216] hover:bg-slate-100 dark:hover:bg-white/[0.05] text-slate-800 dark:text-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <MessageSquareCode className="w-3.5 h-3.5 text-emerald-500" />
            <span>Ask InfraVoice</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/simulation')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#0F1216] hover:bg-slate-100 dark:hover:bg-white/[0.05] text-slate-800 dark:text-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
            <span>Incident Simulation</span>
          </button>
          <button
            type="button"
            onClick={() => openIncident(activeIncident.id)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#0F1216] hover:bg-slate-100 dark:hover:bg-white/[0.05] text-slate-800 dark:text-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <AlertOctagon className="w-3.5 h-3.5 text-amber-500" />
            <span>Investigate Incident</span>
          </button>
        </div>
      </div>

      {/* Live Simulated Environment Dashboard Card */}
      {simulationState && (
        <Surface className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-white/[0.06]">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold uppercase bg-emerald-600/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/25">
                  SIMULATED ENVIRONMENT
                </span>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  {simulationState.cluster.name} · {simulationState.deployment.namespace}/
                  {simulationState.deployment.name}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${simBadgeStyle.cls}`}
                >
                  {simBadgeStyle.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Live isolated simulation telemetry, AI investigation state, and deterministic recovery
                verification.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/simulation')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
            >
              <span>Open Simulation Center</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E]">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Replicas Ready</div>
              <div className="mt-1 text-base font-mono font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                {simulationState.deployment.readyReplicas}/
                {simulationState.deployment.desiredReplicas}
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E]">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Pod Restarts</div>
              <div className="mt-1 text-base font-mono font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                {simTotalRestarts}
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E]">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Service Availability</div>
              <div className="mt-1 text-base font-mono font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                {simulationState.service.availabilityPercent}%
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E]">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Simulated Incident</div>
              <div className="mt-1 text-xs font-mono font-semibold text-slate-900 dark:text-zinc-100 truncate">
                {simulationState.activeIncident
                  ? `${simulationState.activeIncident.id} (${simulationState.activeIncident.status})`
                  : 'None active'}
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E]">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Latest AI Diagnosis</div>
              <div className="mt-1 text-xs text-slate-800 dark:text-zinc-200 truncate">
                {simulationState.activeIncident?.investigation
                  ? simulationState.activeIncident.investigation.mostLikelyRootCause
                  : 'Not yet investigated'}
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E]">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Verification Gate</div>
              <div className="mt-1 text-xs font-mono font-semibold text-slate-900 dark:text-zinc-100">
                {simulationState.activeIncident?.verification
                  ? simulationState.activeIncident.verification.passed
                    ? 'PASSED (5/5)'
                    : 'FAILED'
                  : simulationState.actionHistory[0]
                    ? simulationState.actionHistory[0].status
                    : 'Baseline'}
              </div>
            </div>
          </div>
        </Surface>
      )}

      {/* 4 System Overview KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Surface className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span>{latestScanResult ? 'Deployment Risk (Live Scan)' : 'Deployment Risk Status'}</span>
            <ShieldAlert className="w-4 h-4 text-slate-400 dark:text-zinc-500" aria-hidden="true" />
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">
              {effectiveRiskLabel}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-zinc-400">
              {effectiveRiskScore} / 100
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between text-xs">
            <ScanStatusLabel status={effectiveVerdict} />
            <button
              type="button"
              onClick={() => navigate('/shipsafe')}
              className="text-slate-500 dark:text-zinc-400 hover:text-emerald-500 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Inspect</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </Surface>

        <Surface className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span>{latestScanResult ? 'Security Findings (Live Scan)' : 'Security Findings'}</span>
            <ShieldCheck className="w-4 h-4 text-slate-400 dark:text-zinc-500" aria-hidden="true" />
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
              {totalFindings}
            </span>
            <span className="text-xs font-mono tabular-nums text-red-600 dark:text-red-400">
              {effectiveOpenFindings.critical} critical
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span className="tabular-nums">
              {effectiveOpenFindings.high} high · {effectiveOpenFindings.medium} medium
            </span>
            <button
              type="button"
              onClick={() => openShipSafeWithSeverity('all')}
              className="hover:text-emerald-500 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Review</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </Surface>

        <Surface className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span>Active Incidents</span>
            <AlertOctagon className="w-4 h-4 text-slate-400 dark:text-zinc-500" aria-hidden="true" />
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
              {totalActiveIncidentCount}
            </span>
            <span className="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400">
              {totalInvestigatingCount} active
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span className="truncate font-mono">
              {hasOpenSimIncident && simulationState?.activeIncident
                ? simulationState.activeIncident.id
                : activeIncident.id}
            </span>
            <button
              type="button"
              onClick={() =>
                hasOpenSimIncident ? navigate('/simulation') : openIncident(activeIncident.id)
              }
              className="hover:text-emerald-500 inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <span>{hasOpenSimIncident ? 'Open simulation' : 'Open queue'}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </Surface>

        <Surface className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span>Infrastructure Health</span>
            <Activity className="w-4 h-4 text-slate-400 dark:text-zinc-500" aria-hidden="true" />
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
              {activeWorkspace.healthPercent}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>SLO tracked</span>
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span className="tabular-nums">{activeWorkspace.podsReady}</span>
            <button
              type="button"
              onClick={() =>
                askInfraVoiceAndNavigate(navigate, activeWorkspace.name)
              }
              className="hover:text-emerald-500 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Diagnose</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </Surface>
      </div>

      {/* Deployment Risk Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left: Risk Score Gauge + Trend + Recent Scan Summary */}
        <Surface className="lg:col-span-7 p-5 flex flex-col justify-between">
          <SectionHeader
            title="Deployment Risk Posture"
            description="Composite risk score across Kubernetes manifests, Dockerfiles, Terraform, and CI workflows."
            action={
              <button
                type="button"
                onClick={() => navigate('/history')}
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap cursor-pointer"
              >
                View scan history
              </button>
            }
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center my-6">
            {/* Semi-circle Risk Gauge */}
            <div className="flex flex-col items-center justify-center py-2">
              <svg viewBox="0 0 140 82" className="w-44 h-24 overflow-visible" role="img" aria-label={`Risk score ${effectiveRiskScore} out of 100`}>
                <path
                  d="M 18 70 A 52 52 0 0 1 122 70"
                  fill="none"
                  className="stroke-slate-200 dark:stroke-white/[0.08]"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                <path
                  d="M 18 70 A 52 52 0 0 1 122 70"
                  fill="none"
                  className={arcColor}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                />
                <text
                  x="70"
                  y="58"
                  textAnchor="middle"
                  className="fill-slate-900 dark:fill-zinc-100 text-2xl font-semibold font-mono tabular-nums"
                >
                  {effectiveRiskScore}
                </text>
                <text
                  x="70"
                  y="74"
                  textAnchor="middle"
                  className="fill-slate-500 dark:fill-zinc-400 text-[10px]"
                >
                  {effectiveRiskLabel} Risk Index
                </text>
              </svg>
            </div>

            {/* 14-day Risk Trend */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-zinc-400">14-day risk trend</span>
                <span className="font-mono tabular-nums text-slate-700 dark:text-zinc-300">
                  {trendPoints[0]} → {trendPoints[trendPoints.length - 1]}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#090B0E]">
                <svg viewBox="0 0 220 48" className="w-full h-12" aria-label="14-day risk trend sparkline">
                  <polyline
                    fill="none"
                    className="stroke-emerald-500"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={svgPoints}
                  />
                </svg>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Lower scores indicate fewer privileged containers and tighter IAM scope.
              </p>
            </div>
          </div>

          {/* Recent Scan Summary Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-zinc-300">
              <GitCommit className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
              {latestScanResult ? (
                <>
                  <span className="font-mono font-medium">{latestScanResult.scanId}</span>
                  <span className="text-slate-400 dark:text-zinc-600" aria-hidden="true">·</span>
                  <span className="font-mono text-slate-500 dark:text-zinc-400">
                    {latestScanResult.fileSummaries.length} file(s) scanned
                  </span>
                  <span className="text-slate-400 dark:text-zinc-600" aria-hidden="true">·</span>
                  <span className="tabular-nums text-slate-500 dark:text-zinc-400">
                    Live session ({latestScanResult.scanDurationMs}ms)
                  </span>
                </>
              ) : (
                <>
                  <span className="font-mono font-medium">{activeWorkspace.lastScanSummary.repository}</span>
                  <span className="text-slate-400 dark:text-zinc-600" aria-hidden="true">·</span>
                  <span className="font-mono text-slate-500 dark:text-zinc-400">
                    {activeWorkspace.lastScanSummary.commitSha}
                  </span>
                  <span className="text-slate-400 dark:text-zinc-600" aria-hidden="true">·</span>
                  <span className="tabular-nums text-slate-500 dark:text-zinc-400">
                    {activeWorkspace.lastScanSummary.scannedAt} ({activeWorkspace.lastScanSummary.duration})
                  </span>
                </>
              )}
            </div>
            <ScanStatusLabel status={effectiveVerdict} />
          </div>
        </Surface>

        {/* Right: Findings Distribution */}
        <Surface className="lg:col-span-5 p-5 flex flex-col justify-between">
          <div>
            <SectionHeader
              title="Findings Distribution"
              description="Click any severity tier to inspect affected manifests in ShipSafe."
            />

            {/* Proportional Bar */}
            <div className="mt-5 h-2.5 w-full rounded-full overflow-hidden flex bg-slate-100 dark:bg-white/[0.06]">
              {severityBreakdown.map((item) => {
                const pct = totalFindings > 0 ? (item.count / totalFindings) * 100 : 0;
                if (pct === 0) return null;
                return (
                  <div
                    key={item.key}
                    style={{ width: `${pct}%` }}
                    className={`${item.barClass} h-full`}
                    title={`${item.key}: ${item.count}`}
                  />
                );
              })}
            </div>

            {/* Interactive Breakdown Rows */}
            <div className="mt-5 divide-y divide-slate-100 dark:divide-white/[0.06]">
              {severityBreakdown.map((item) => {
                const pct = totalFindings > 0 ? Math.round((item.count / totalFindings) * 100) : 0;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => openShipSafeWithSeverity(item.key)}
                    className="w-full flex items-center justify-between py-3 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors text-left cursor-pointer"
                  >
                    <SeverityLabel severity={item.key} />
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-zinc-400">
                        {pct}%
                      </span>
                      <span className="text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-zinc-100 w-6 text-right">
                        {item.count}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span>Total open findings</span>
            <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
              {totalFindings}
            </span>
          </div>
        </Surface>
      </div>

      {/* Recent Activity */}
      <Surface className="overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-white/[0.06] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-zinc-100">
              Recent Activity
            </h2>
            <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-0.5">
              Deployment events, ShipSafe policy scans, and active incident triggers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAllWorkspaces((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                showAllWorkspaces
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              {showAllWorkspaces ? 'All workspaces' : activeWorkspace.name}
            </button>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
              {(['all', 'deployment', 'scan', 'incident'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActivityFilter(tab)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap cursor-pointer ${
                    activityFilter === tab
                      ? 'bg-white dark:bg-[#161B22] text-slate-900 dark:text-zinc-100 shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {tab === 'all' ? 'All' : `${tab}s`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
          {filteredActivity.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-zinc-400">
              No {activityFilter} events recorded in {activeWorkspace.name}. Try switching to All workspaces.
            </div>
          ) : (
            filteredActivity.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => navigate(ev.route)}
                className="w-full px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-900 dark:text-zinc-100 truncate">
                    {ev.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono">{ev.target}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ev.actor}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{ev.type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-zinc-400">
                    {ev.timestamp}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                </div>
              </button>
            ))
          )}
        </div>
      </Surface>
    </div>
  );
}

function askInfraVoiceAndNavigate(navigate: (to: '/infravoice') => void, workspaceName: string) {
  void workspaceName;
  navigate('/infravoice');
}
