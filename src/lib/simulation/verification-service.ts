import type {
  RecoveryVerificationReport,
  SimulationStateSnapshot,
  VerificationCheckResult,
} from './types.ts';

/**
 * Deterministic RecoveryVerificationService.
 * Verifies recovery strictly from simulated infrastructure state —
 * never relies on Gemini declaring success.
 */
export function verifySimulationRecovery(
  state: SimulationStateSnapshot,
  nowIso = new Date().toISOString()
): RecoveryVerificationReport {
  const { deployment, pods, service, metrics } = state;

  const readyPodCount = pods.filter((p) => p.ready && p.phase === 'Running').length;
  const crashingPods = pods.filter(
    (p) => p.phase === 'CrashLoopBackOff' || p.phase === 'OOMKilled' || p.phase === 'NotReady'
  );
  const resourceHealthy =
    metrics.memoryUtilizationPercent < 85 && metrics.cpuUtilizationPercent < 85;

  const checks: VerificationCheckResult[] = [
    {
      id: 'replicas_match',
      label: 'Desired replicas equal ready replicas',
      passed:
        deployment.readyReplicas === deployment.desiredReplicas &&
        readyPodCount === deployment.desiredReplicas,
      detail: `${deployment.readyReplicas}/${deployment.desiredReplicas} replicas ready (${readyPodCount} running & ready pods).`,
    },
    {
      id: 'pods_healthy',
      label: 'All pods healthy with zero unhealthy workloads',
      passed: deployment.unhealthyReplicas === 0 && crashingPods.length === 0,
      detail:
        crashingPods.length === 0
          ? `All ${pods.length} pods in Running state with zero active CrashLoopBackOff, OOMKilled, or NotReady states.`
          : `${crashingPods.length} pod(s) still unhealthy: ${crashingPods.map((p) => `${p.name} (${p.phase})`).join(', ')}.`,
    },
    {
      id: 'readiness_checks_pass',
      label: 'Readiness & liveness probes passing',
      passed:
        deployment.readinessProbePassing &&
        deployment.livenessProbePassing &&
        deployment.config.readinessProbePath === deployment.config.expectedHealthPath &&
        deployment.config.requiredEnvConfigured,
      detail: deployment.readinessProbePassing
        ? `Probes passing on ${deployment.config.readinessProbePath} and required configuration present.`
        : `Probe or configuration check still failing (probe=${deployment.config.readinessProbePath}, envConfigured=${String(deployment.config.requiredEnvConfigured)}).`,
    },
    {
      id: 'service_restored',
      label: 'Service health and endpoints restored',
      passed:
        service.health === 'healthy' &&
        service.availableEndpoints === service.expectedEndpoints &&
        service.errorRatePercent < 1,
      detail: `${service.name}: ${service.availableEndpoints}/${service.expectedEndpoints} endpoints active, availability ${service.availabilityPercent}%, error rate ${service.errorRatePercent}%.`,
    },
    {
      id: 'resource_stability',
      label: 'CPU & memory utilization within safe thresholds',
      passed: resourceHealthy,
      detail: `CPU ${metrics.cpuUtilizationPercent}%, Memory ${metrics.memoryUtilizationPercent}%, p99 latency ${metrics.p99LatencyMs}ms.`,
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const allPassed = passedCount === checks.length;

  return {
    passed: allPassed,
    verifiedAt: nowIso,
    summary: allPassed
      ? `All ${checks.length}/${checks.length} deterministic recovery checks passed. ${deployment.readyReplicas}/${deployment.desiredReplicas} pods ready and ${service.name} healthy.`
      : `Verification failed: ${checks.length - passedCount} of ${checks.length} checks did not pass. Incident remains open.`,
    checks,
  };
}
