import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock,
  Cpu,
  Flame,
  Info,
  MessageSquareCode,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  XCircle,
} from 'lucide-react';
import { SeverityLabel } from '../components/ui/SeverityLabel';
import { Surface } from '../components/ui/Surface';
import { useApp } from '../context/AppContext';
import type {
  SimulationHealthStatus,
  SimulationPodPhase,
  SimulationScenarioId,
  SimulationStateSnapshot,
} from '../lib/simulation/types';

function healthTone(status: SimulationHealthStatus): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  switch (status) {
    case 'healthy':
      return {
        label: 'Healthy',
        badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
        dotClass: 'bg-emerald-500',
      };
    case 'resolved':
      return {
        label: 'Resolved',
        badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
        dotClass: 'bg-emerald-500',
      };
    case 'recovering':
      return {
        label: 'Recovering',
        badgeClass: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300',
        dotClass: 'bg-sky-500 animate-pulse',
      };
    case 'degraded':
      return {
        label: 'Degraded',
        badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
        dotClass: 'bg-amber-500',
      };
    case 'critical':
    default:
      return {
        label: 'Critical',
        badgeClass: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300',
        dotClass: 'bg-red-500 animate-pulse',
      };
  }
}

function podPhaseClass(phase: SimulationPodPhase, ready: boolean): string {
  if (phase === 'Running' && ready) {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  if (phase === 'Starting') {
    return 'text-sky-600 dark:text-sky-400';
  }
  if (phase === 'NotReady') {
    return 'text-amber-600 dark:text-amber-400';
  }
  return 'text-red-600 dark:text-red-400';
}

export function SimulationPage() {
  const {
    simulationState,
    setSimulationState,
    refreshSimulationState,
    askInfraVoice,
    showToast,
  } = useApp();

  const [selectedScenario, setSelectedScenario] =
    useState<SimulationScenarioId>('crashloop_backoff');
  const [telemetryTab, setTelemetryTab] = useState<'timeline' | 'logs' | 'config' | 'actions'>(
    'timeline'
  );

  const [isTriggering, setIsTriggering] = useState(false);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [showApprovalConfirm, setShowApprovalConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [investigationError, setInvestigationError] = useState<{
    message: string;
    retryable: boolean;
  } | null>(null);

  useEffect(() => {
    if (!simulationState) {
      void refreshSimulationState();
    }
  }, [simulationState, refreshSimulationState]);

  const totalRestarts = useMemo(() => {
    if (!simulationState) return 0;
    return simulationState.pods.reduce((sum, p) => sum + p.restarts, 0);
  }, [simulationState]);

  const selectedDescriptor = useMemo(() => {
    return (
      simulationState?.scenarios.find((s) => s.id === selectedScenario) ||
      simulationState?.scenarios[0]
    );
  }, [simulationState, selectedScenario]);

  const handleTriggerScenario = async () => {
    if (isTriggering) return;
    setIsTriggering(true);
    setActionError(null);
    setInvestigationError(null);
    setShowApprovalConfirm(false);

    try {
      const res = await fetch('/api/simulation/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: selectedScenario }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setActionError(payload?.error || 'Failed to trigger incident scenario.');
        return;
      }
      setSimulationState(payload as SimulationStateSnapshot);
      showToast(`Simulated incident triggered: ${payload.activeIncident?.title ?? selectedScenario}`);
    } catch {
      setActionError('Unable to reach /api/simulation/trigger. Verify the server is running.');
    } finally {
      setIsTriggering(false);
    }
  };

  const handleInvestigate = async () => {
    if (isInvestigating || !simulationState?.activeIncident) return;
    setIsInvestigating(true);
    setInvestigationError(null);
    setActionError(null);

    try {
      const res = await fetch('/api/simulation/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await res.json();
      if (!res.ok) {
        setInvestigationError({
          message:
            payload?.error ||
            'Gemini AI investigation failed. Verify server AI configuration and retry.',
          retryable: Boolean(payload?.retryable ?? true),
        });
        return;
      }
      setSimulationState(payload.state as SimulationStateSnapshot);
      setShowApprovalConfirm(true);
      showToast('InfraVoice investigation complete · Review remediation plan before approving');
    } catch {
      setInvestigationError({
        message: 'Network error contacting /api/simulation/investigate. Please retry.',
        retryable: true,
      });
    } finally {
      setIsInvestigating(false);
    }
  };

  const handleApproveRemediation = async () => {
    const incident = simulationState?.activeIncident;
    const proposal = incident?.proposedRemediation;
    if (!incident || !proposal || isApproving) return;

    setIsApproving(true);
    setActionError(null);

    try {
      const res = await fetch('/api/simulation/remediation/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentId: incident.id,
          actionId: proposal.actionId,
          approved: true,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setActionError(payload?.error || 'Remediation approval rejected by validator.');
        return;
      }

      setSimulationState(payload.state as SimulationStateSnapshot);
      setShowApprovalConfirm(false);
      showToast('Remediation approved · Applying simulated recovery & verifying health...');
    } catch {
      setActionError('Network error contacting /api/simulation/remediation/approve.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleResetSimulation = async () => {
    if (isResetting) return;
    setIsResetting(true);
    setActionError(null);
    setInvestigationError(null);

    try {
      const res = await fetch('/api/simulation/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setActionError(payload?.error || 'Unable to reset simulation.');
        return;
      }
      setSimulationState(payload as SimulationStateSnapshot);
      setShowResetConfirm(false);
      setShowApprovalConfirm(false);
      showToast('Simulated cluster reset to healthy baseline (3/3 pods ready)');
    } catch {
      setActionError('Network error contacting /api/simulation/reset.');
    } finally {
      setIsResetting(false);
    }
  };

  if (!simulationState) {
    return (
      <Surface className="p-8 text-center space-y-2">
        <Activity className="w-5 h-5 text-emerald-500 mx-auto animate-pulse" />
        <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">
          Loading isolated simulation environment...
        </p>
      </Surface>
    );
  }

  const clusterTone = healthTone(simulationState.cluster.status);
  const serviceTone = healthTone(simulationState.service.health);
  const activeIncident = simulationState.activeIncident;
  const incidentTone = activeIncident
    ? healthTone(
        activeIncident.status === 'resolved'
          ? 'resolved'
          : activeIncident.status === 'recovering'
            ? 'recovering'
            : activeIncident.severity === 'critical'
              ? 'critical'
              : 'degraded'
      )
    : healthTone('healthy');

  return (
    <div className="space-y-5">
      {/* Mandatory SIMULATED ENVIRONMENT Banner */}
      <div
        role="status"
        className="px-4 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
      >
        <div className="flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300">
          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold uppercase bg-emerald-600 text-white tracking-wider shrink-0">
            SIMULATED ENVIRONMENT
          </span>
          <span>
            Isolated sandbox (<span className="font-mono">{simulationState.cluster.name}</span> ·{' '}
            <span className="font-mono">{simulationState.cluster.environment}</span>). No real
            Kubernetes cluster, cloud credentials, or production workloads are touched.
          </span>
        </div>

        <button
          type="button"
          onClick={() => void refreshSimulationState()}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:underline self-start sm:self-auto shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Sync State</span>
        </button>
      </div>

      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">
            Incident Simulation &amp; Safe Recovery Engine
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-0.5">
            Trigger deterministic Kubernetes failures on{' '}
            <span className="font-mono text-slate-700 dark:text-zinc-300">
              {simulationState.deployment.namespace}/{simulationState.deployment.name}
            </span>
            , investigate with Gemini, explicitly approve an allowlisted fix, and verify recovery.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!showResetConfirm ? (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              disabled={isResetting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#0F1216] hover:bg-slate-100 dark:hover:bg-white/[0.05] text-xs font-medium text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Simulation</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs">
              <span className="text-amber-700 dark:text-amber-300 font-medium">
                Reset simulated cluster to baseline?
              </span>
              <button
                type="button"
                onClick={handleResetSimulation}
                disabled={isResetting}
                className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium cursor-pointer"
              >
                {isResetting ? 'Resetting...' : 'Confirm Reset'}
              </button>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-2 py-1 rounded text-slate-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/[0.06] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/[0.06] text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-3"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="underline shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Simulated Infrastructure Status Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Surface className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span>Cluster &amp; Deployment</span>
            <Server className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-mono font-semibold text-slate-900 dark:text-zinc-100 truncate">
              {simulationState.deployment.name}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium ${clusterTone.badgeClass}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${clusterTone.dotClass}`} />
              {clusterTone.label}
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 truncate">
            ns/{simulationState.deployment.namespace} · rev {simulationState.deployment.config.revision}
          </div>
        </Surface>

        <Surface className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span>Pod Replicas</span>
            <Box className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-mono font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
              {simulationState.deployment.readyReplicas}/{simulationState.deployment.desiredReplicas}
            </span>
            <span
              className={`text-xs font-mono tabular-nums ${
                simulationState.deployment.unhealthyReplicas > 0
                  ? 'text-red-500'
                  : 'text-emerald-500'
              }`}
            >
              {simulationState.deployment.unhealthyReplicas} failed
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
            Total restarts: <span className="font-mono">{totalRestarts}</span>
          </div>
        </Surface>

        <Surface className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span>Service Health</span>
            <Activity className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-lg font-mono font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
              {simulationState.service.availabilityPercent}%
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium ${serviceTone.badgeClass}`}
            >
              {serviceTone.label}
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 tabular-nums">
            {simulationState.service.availableEndpoints}/{simulationState.service.expectedEndpoints}{' '}
            endpoints · err {simulationState.service.errorRatePercent}%
          </div>
        </Surface>

        <Surface className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span>Resource Health</span>
            <Cpu className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-baseline justify-between font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
            <span>CPU {simulationState.metrics.cpuUtilizationPercent}%</span>
            <span>Mem {simulationState.metrics.memoryUtilizationPercent}%</span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 tabular-nums">
            p99: {simulationState.metrics.p99LatencyMs}ms · limits{' '}
            {simulationState.deployment.config.cpuLimit}/{simulationState.deployment.config.memoryLimit}
          </div>
        </Surface>

        <Surface className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span>Incident Status</span>
            <AlertOctagon className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-mono font-semibold text-slate-900 dark:text-zinc-100 truncate">
              {activeIncident ? activeIncident.id : 'No Incident'}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium capitalize ${incidentTone.badgeClass}`}
            >
              {activeIncident ? activeIncident.status : 'Stable'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
            {activeIncident ? activeIncident.title : 'Baseline healthy (3/3 ready)'}
          </div>
        </Surface>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Trigger Controls + Live Pods + Telemetry Tabs */}
        <div className="lg:col-span-5 space-y-4">
          {/* Scenario Selector & Trigger Control */}
          <Surface className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  1. Trigger Simulated Incident
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Select a failure scenario to inject into demo-payments-cluster.
                </p>
              </div>
              <Flame className="w-4 h-4 text-amber-500 shrink-0" />
            </div>

            <div className="space-y-2">
              {simulationState.scenarios.map((sc) => {
                const selected = sc.id === selectedScenario;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => setSelectedScenario(sc.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                      selected
                        ? 'border-emerald-500/50 bg-emerald-500/[0.06]'
                        : 'border-slate-200 dark:border-white/[0.08] bg-slate-50/60 dark:bg-[#090B0E] hover:border-slate-300 dark:hover:border-white/[0.15]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                        {sc.code}
                      </span>
                      <SeverityLabel severity={sc.severity} />
                    </div>
                    <div className="text-[13px] font-semibold text-slate-900 dark:text-zinc-100 mt-1">
                      {sc.title}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5 leading-snug">
                      {sc.shortDescription}
                    </p>
                  </button>
                );
              })}
            </div>

            {selectedDescriptor && (
              <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  What will be simulated
                </div>
                <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600 dark:text-zinc-300">
                  {selectedDescriptor.whatWillBeSimulated.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={handleTriggerScenario}
              disabled={
                isTriggering ||
                Boolean(
                  activeIncident &&
                    activeIncident.scenarioId === selectedScenario &&
                    activeIncident.status !== 'resolved'
                )
              }
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {isTriggering
                  ? 'Injecting Simulated Fault...'
                  : activeIncident &&
                      activeIncident.scenarioId === selectedScenario &&
                      activeIncident.status !== 'resolved'
                    ? `Active: ${selectedDescriptor?.title ?? selectedScenario}`
                    : `Trigger Incident: ${selectedDescriptor?.title ?? ''}`}
              </span>
            </button>
          </Surface>

          {/* Live Pod Status Visualization */}
          <Surface className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  Simulated Pods ({simulationState.deployment.readyReplicas}/
                  {simulationState.deployment.desiredReplicas} Ready)
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Live replica phases &amp; restart counters
                </p>
              </div>
              {simulationState.recoveryStage !== 'idle' && (
                <span className="text-[11px] font-mono text-sky-500 capitalize">
                  stage: {simulationState.recoveryStage.replace('_', ' ')}
                </span>
              )}
            </div>

            <div className="space-y-2.5">
              {simulationState.pods.map((pod) => (
                <div
                  key={pod.name}
                  className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-medium text-slate-900 dark:text-zinc-100 truncate">
                      {pod.name}
                    </span>
                    <span
                      className={`text-xs font-mono font-semibold shrink-0 ${podPhaseClass(
                        pod.phase,
                        pod.ready
                      )}`}
                    >
                      {pod.phase} {pod.ready ? '(Ready)' : '(NotReady)'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-zinc-400 tabular-nums">
                    <span>Restarts: {pod.restarts}</span>
                    <span>CPU: {pod.cpuPercent}%</span>
                    <span>Mem: {pod.memoryPercent}%</span>
                  </div>

                  <div className="text-[11px] text-slate-600 dark:text-zinc-400">
                    {pod.lastReason}
                  </div>
                </div>
              ))}
            </div>
          </Surface>
        </div>

        {/* Right Column: AI Investigation + Human Approval + Verification + Timeline/Logs */}
        <div className="lg:col-span-7 space-y-4">
          {/* Step 2 & 3: Gemini Investigation & Human-in-the-Loop Remediation */}
          <Surface className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-white/[0.06]">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  2. InfraVoice Investigation &amp; Safe Recovery
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Gemini inspects actual simulated telemetry and proposes an allowlisted remediation
                  requiring your explicit approval.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleInvestigate}
                  disabled={
                    !activeIncident ||
                    activeIncident.status === 'resolved' ||
                    activeIncident.status === 'recovering' ||
                    isInvestigating
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {isInvestigating ? 'Investigating with Gemini...' : 'Investigate with InfraVoice'}
                  </span>
                </button>

                {activeIncident && (
                  <button
                    type="button"
                    onClick={() =>
                      askInfraVoice(
                        `Help me analyze simulated incident ${activeIncident.id} (${activeIncident.title}) on ${simulationState.cluster.name}. What does the live pod, event, and log evidence confirm?`,
                        { contextType: 'incident', incidentId: activeIncident.id }
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <MessageSquareCode className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Open Chat</span>
                  </button>
                )}
              </div>
            </div>

            {!activeIncident && (
              <div className="p-6 rounded-lg border border-dashed border-slate-200 dark:border-white/[0.1] text-center space-y-1.5">
                <ShieldCheck className="w-6 h-6 text-emerald-500 mx-auto" />
                <div className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                  Simulated Cluster Healthy — No Active Incident
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
                  Select Scenario A, B, or C on the left and click &ldquo;Trigger Incident&rdquo; to
                  begin an interactive investigation and recovery drill.
                </p>
              </div>
            )}

            {isInvestigating && (
              <div className="p-4 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#090B0E] space-y-2.5 animate-pulse">
                <div className="text-xs text-slate-500 dark:text-zinc-400">
                  Sending live simulated pod status, logs, events, and deployment config to Gemini...
                </div>
                <div className="h-3.5 w-3/4 rounded bg-slate-200 dark:bg-white/[0.08]" />
                <div className="h-3 w-full rounded bg-slate-200/70 dark:bg-white/[0.05]" />
                <div className="h-3 w-2/3 rounded bg-slate-200/70 dark:bg-white/[0.05]" />
              </div>
            )}

            {investigationError && !isInvestigating && (
              <div
                role="alert"
                className="p-4 rounded-lg border border-red-500/30 bg-red-500/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="text-xs text-red-600 dark:text-red-400">
                  <div className="font-semibold">Gemini Investigation Unavailable</div>
                  <p className="mt-0.5">{investigationError.message}</p>
                </div>
                {investigationError.retryable && (
                  <button
                    type="button"
                    onClick={handleInvestigate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-white dark:bg-[#090B0E] text-xs font-medium text-red-600 dark:text-red-300 hover:bg-red-500/10 shrink-0 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            )}

            {/* Gemini Investigation Report */}
            {activeIncident?.investigation && !isInvestigating && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#090B0E] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                        Gemini Investigation Report
                      </span>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                        {activeIncident.investigation.confidenceLevel} confidence
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                      Model: {activeIncident.investigation.model}
                    </span>
                  </div>

                  <p className="text-[13px] text-slate-700 dark:text-zinc-300 leading-relaxed">
                    {activeIncident.investigation.incidentSummary}
                  </p>

                  <div className="p-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.05] text-xs space-y-1">
                    <div className="font-semibold text-amber-700 dark:text-amber-300">
                      Most Likely Root Cause
                    </div>
                    <p className="text-slate-700 dark:text-zinc-200">
                      {activeIncident.investigation.mostLikelyRootCause}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Impact: {activeIncident.investigation.severityImpact}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-800 dark:text-zinc-200">
                        Supporting Evidence
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-zinc-300">
                        {activeIncident.investigation.supportingEvidence.map((ev, i) => (
                          <li key={i}>{ev}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-1">
                      <div className="font-semibold text-slate-800 dark:text-zinc-200">
                        Prevention Suggestions
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-zinc-300">
                        {activeIncident.investigation.preventionSuggestions.map((prev, i) => (
                          <li key={i}>{prev}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Step 3: Human-in-the-Loop Remediation Approval Gate */}
                {activeIncident.proposedRemediation &&
                  activeIncident.status !== 'resolved' &&
                  activeIncident.status !== 'recovering' && (
                    <div className="p-4 rounded-xl border border-emerald-500/35 bg-emerald-500/[0.04] space-y-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 text-emerald-500 shrink-0" />
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                            3. Proposed Safe Remediation (Human Approval Required)
                          </h3>
                        </div>
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase border border-emerald-500/30 text-emerald-600 dark:text-emerald-300">
                          Allowlisted · Risk: {activeIncident.proposedRemediation.riskLevel}
                        </span>
                      </div>

                      <div className="text-xs space-y-1">
                        <div className="font-semibold text-slate-900 dark:text-zinc-100">
                          {activeIncident.proposedRemediation.title}
                        </div>
                        <p className="text-slate-600 dark:text-zinc-300 leading-relaxed">
                          {activeIncident.proposedRemediation.explanation}
                        </p>
                      </div>

                      {/* Before vs Expected After */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                        <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/[0.04]">
                          <div className="text-[11px] font-semibold uppercase text-red-500 mb-1">
                            Before State
                          </div>
                          <div className="font-mono text-[11px] text-slate-700 dark:text-zinc-300">
                            {activeIncident.proposedRemediation.beforeStateSummary}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04]">
                          <div className="text-[11px] font-semibold uppercase text-emerald-500 mb-1">
                            Expected After State
                          </div>
                          <div className="font-mono text-[11px] text-slate-700 dark:text-zinc-300">
                            {activeIncident.proposedRemediation.expectedAfterStateSummary}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-zinc-200 mb-1">
                            Affected Resources &amp; Changes
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-zinc-300">
                            {activeIncident.proposedRemediation.expectedChanges.map((ch, i) => (
                              <li key={i}>{ch}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="space-y-1.5">
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-zinc-200">
                              Potential Impact:{' '}
                            </span>
                            <span className="text-slate-600 dark:text-zinc-300">
                              {activeIncident.proposedRemediation.potentialImpact}
                            </span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-zinc-200">
                              Verification Gate:{' '}
                            </span>
                            <span className="text-slate-600 dark:text-zinc-300">
                              {activeIncident.proposedRemediation.verificationRequirement}
                            </span>
                          </div>
                        </div>
                      </div>

                      {!showApprovalConfirm ? (
                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowApprovalConfirm(true)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Review &amp; Approve Remediation</span>
                          </button>
                        </div>
                      ) : (
                        <div className="pt-3 border-t border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="text-xs text-slate-700 dark:text-zinc-200 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            <span>
                              Confirm applying{' '}
                              <code className="font-mono">
                                {activeIncident.proposedRemediation.actionId}
                              </code>{' '}
                              in the simulated cluster?
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={handleApproveRemediation}
                              disabled={isApproving}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>
                                {isApproving
                                  ? 'Applying...'
                                  : 'Approve & Apply Simulation'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowApprovalConfirm(false)}
                              disabled={isApproving}
                              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                {/* Active Recovery Progress Indicator */}
                {activeIncident.status === 'recovering' && (
                  <div className="p-4 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] flex items-center gap-3 text-xs text-sky-700 dark:text-sky-300">
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    <div>
                      <div className="font-semibold">
                        Simulated Recovery In Progress ({simulationState.recoveryStage.replace('_', ' ')})
                      </div>
                      <p className="mt-0.5 opacity-90">
                        Transitioning simulated pods through Starting → Running → Ready and executing
                        deterministic readiness checks...
                      </p>
                    </div>
                  </div>
                )}

                {/* Step 4: Deterministic Recovery Verification Results */}
                {activeIncident.verification && (
                  <div
                    className={`p-4 rounded-xl border space-y-3 ${
                      activeIncident.verification.passed
                        ? 'border-emerald-500/30 bg-emerald-500/[0.05]'
                        : 'border-red-500/30 bg-red-500/[0.05]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {activeIncident.verification.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                          4. Deterministic Recovery Verification
                        </h3>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${
                          activeIncident.verification.passed
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                            : 'bg-red-500/15 text-red-600 dark:text-red-300'
                        }`}
                      >
                        {activeIncident.verification.passed
                          ? 'VERIFIED — INCIDENT RESOLVED'
                          : 'VERIFICATION FAILED — INCIDENT OPEN'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-zinc-300">
                      {activeIncident.verification.summary}
                    </p>

                    <div className="space-y-1.5">
                      {activeIncident.verification.checks.map((chk) => (
                        <div
                          key={chk.id}
                          className="p-2.5 rounded-lg border border-slate-200/80 dark:border-white/[0.06] bg-white/70 dark:bg-[#090B0E] flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="font-medium text-slate-900 dark:text-zinc-100">
                              {chk.label}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                              {chk.detail}
                            </div>
                          </div>
                          <span
                            className={`font-mono text-[11px] font-semibold shrink-0 ${
                              chk.passed ? 'text-emerald-500' : 'text-red-500'
                            }`}
                          >
                            {chk.passed ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Surface>

          {/* Telemetry & Timeline Surface */}
          <Surface className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
                {(
                  [
                    { id: 'timeline', label: `Timeline (${simulationState.events.length})` },
                    { id: 'logs', label: `Pod Logs (${simulationState.logs.length})` },
                    { id: 'config', label: 'Deployment Config' },
                    { id: 'actions', label: `Action Audit (${simulationState.actionHistory.length})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTelemetryTab(t.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      telemetryTab === t.id
                        ? 'bg-white dark:bg-[#161B22] text-slate-900 dark:text-zinc-100 shadow-xs'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {telemetryTab === 'timeline' && (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {[...simulationState.events].reverse().map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            ev.type === 'error'
                              ? 'bg-red-500'
                              : ev.type === 'warning'
                                ? 'bg-amber-500'
                                : ev.type === 'recovery' || ev.type === 'verification'
                                  ? 'bg-emerald-500'
                                  : 'bg-sky-500'
                          }`}
                        />
                        <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                          {ev.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-zinc-300 pl-3.5">
                        {ev.detail}
                      </p>
                      <div className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 pl-3.5">
                        source: {ev.source}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-zinc-400 shrink-0">
                      <Clock className="w-3 h-3" />
                      {ev.displayTime}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {telemetryTab === 'logs' && (
              <div className="rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#090B0E] p-3 font-mono text-xs space-y-2 max-h-[380px] overflow-y-auto">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400 pb-2 border-b border-slate-200 dark:border-white/[0.06]">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Simulated container log stream (payments/payments-api)</span>
                </div>
                {simulationState.logs.map((log) => (
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
                    <span className="text-slate-500 dark:text-zinc-400 shrink-0">[{log.pod}]</span>
                    <span className="text-slate-800 dark:text-zinc-200 break-words">
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {telemetryTab === 'config' && (
              <div className="rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#090B0E] p-4 font-mono text-xs space-y-2 text-slate-700 dark:text-zinc-300">
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 pb-2 border-b border-slate-200 dark:border-white/[0.06]">
                  <Info className="w-3.5 h-3.5" />
                  <span>
                    Active simulated spec — deployment/{simulationState.deployment.name} (revision{' '}
                    {simulationState.deployment.config.revision})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div>image: {simulationState.deployment.config.image}</div>
                  <div>
                    envFrom.secretRef:{' '}
                    <span
                      className={
                        simulationState.deployment.config.requiredEnvConfigured
                          ? 'text-emerald-500'
                          : 'text-red-500'
                      }
                    >
                      {simulationState.deployment.config.envSecretRef ?? 'MISSING'}
                    </span>
                  </div>
                  <div>
                    readinessProbe.path:{' '}
                    <span
                      className={
                        simulationState.deployment.config.readinessProbePath ===
                        simulationState.deployment.config.expectedHealthPath
                          ? 'text-emerald-500'
                          : 'text-amber-500'
                      }
                    >
                      {simulationState.deployment.config.readinessProbePath}
                    </span>
                  </div>
                  <div>livenessProbe.path: {simulationState.deployment.config.livenessProbePath}</div>
                  <div>
                    cpu request/limit: {simulationState.deployment.config.cpuRequest} /{' '}
                    {simulationState.deployment.config.cpuLimit}
                  </div>
                  <div>
                    memory request/limit: {simulationState.deployment.config.memoryRequest} /{' '}
                    {simulationState.deployment.config.memoryLimit}
                  </div>
                </div>
              </div>
            )}

            {telemetryTab === 'actions' && (
              <div className="space-y-2.5">
                {simulationState.actionHistory.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-zinc-400 py-6 text-center">
                    No remediation actions approved yet. Actions appear here only after explicit user
                    approval.
                  </p>
                ) : (
                  simulationState.actionHistory.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-zinc-100">
                          {act.title}
                        </span>
                        <span className="font-mono text-[11px] text-emerald-500">{act.status}</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                        {act.incidentId} · action: {act.actionId} · {act.approvedBy}
                      </div>
                      <p className="text-slate-600 dark:text-zinc-300">{act.summary}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </Surface>
        </div>
      </div>
    </div>
  );
}
