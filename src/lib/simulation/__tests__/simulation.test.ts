import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerateContentResponse } from '@google/genai';
import { createApp } from '../../../../server.ts';
import { setGeminiClientOverride } from '../../ai/gemini-client.ts';
import { resetRateLimiterForTests } from '../../ai/rate-limiter.ts';
import {
  buildSimulationGeminiContext,
  investigateActiveSimulationIncident,
} from '../investigation-service.ts';
import {
  approveAndStartRecovery,
  getSimulationState,
  resetSimulationEnvironment,
  stepPendingRecoveryForTests,
  triggerIncidentScenario,
} from '../state-manager.ts';
import { verifySimulationRecovery } from '../verification-service.ts';

function mockGeminiJson(payload: unknown): GenerateContentResponse {
  const text = JSON.stringify(payload);
  return {
    text,
    candidates: [{ content: { role: 'model', parts: [{ text }] } }],
  } as unknown as GenerateContentResponse;
}

function makeValidInvestigationPayload(actionId: string, rootCause: string) {
  return {
    incidentSummary: `Simulated incident diagnosed: ${rootCause}`,
    mostLikelyRootCause: rootCause,
    confidenceLevel: 'high',
    supportingEvidence: ['Observed matching error logs and pod status transition in simulation telemetry'],
    affectedResources: ['deployment/payments-api', 'service/payments-service'],
    severityImpact: 'Simulated payments traffic impacted',
    immediateRemediationSummary: 'Apply validated allowlisted simulated configuration correction',
    proposedSteps: [
      'Inspect failing container logs and deployment spec',
      'Apply allowlisted simulated configuration fix',
      'Roll pods through Starting -> Running -> Ready and verify',
    ],
    verificationSteps: [
      'Confirm 3/3 ready pods',
      'Confirm payments-service availability restored',
    ],
    preventionSuggestions: ['Add ShipSafe policy checks in CI prior to rollout'],
    recommendedActionId: actionId,
  };
}

describe('Phase 4 Incident Simulation & Safe Recovery Engine', () => {
  beforeEach(() => {
    resetRateLimiterForTests();
    setGeminiClientOverride(null);
    resetSimulationEnvironment();
  });

  afterEach(() => {
    setGeminiClientOverride(null);
    resetSimulationEnvironment();
    vi.unstubAllEnvs();
  });

  it('initializes with a consistent healthy baseline state marked as simulated', () => {
    const state = getSimulationState();
    expect(state.simulated).toBe(true);
    expect(state.environmentBanner).toContain('SIMULATED ENVIRONMENT');
    expect(state.cluster.name).toBe('demo-payments-cluster');
    expect(state.cluster.environment).toBe('hackathon-simulation');
    expect(state.cluster.status).toBe('healthy');
    expect(state.deployment.name).toBe('payments-api');
    expect(state.deployment.namespace).toBe('payments');
    expect(state.deployment.desiredReplicas).toBe(3);
    expect(state.deployment.readyReplicas).toBe(3);
    expect(state.deployment.unhealthyReplicas).toBe(0);
    expect(state.service.health).toBe('healthy');
    expect(state.service.availableEndpoints).toBe(3);
    expect(state.pods).toHaveLength(3);
    expect(state.pods.every((p) => p.ready && p.phase === 'Running' && p.restarts === 0)).toBe(true);
    expect(state.activeIncident).toBeNull();
  });

  it('triggers Scenario A (CrashLoopBackOff) with consistent config, pods, logs, and events', () => {
    const state = triggerIncidentScenario('crashloop_backoff');
    expect(state.activeIncident?.scenarioId).toBe('crashloop_backoff');
    expect(state.activeIncident?.status).toBe('open');
    expect(state.cluster.status).toBe('critical');
    expect(state.deployment.readyReplicas).toBe(0);
    expect(state.deployment.unhealthyReplicas).toBe(3);
    expect(state.deployment.config.requiredEnvConfigured).toBe(false);
    expect(state.deployment.config.envSecretRef).toBeNull();
    expect(state.pods.every((p) => p.phase === 'CrashLoopBackOff' && !p.ready && p.restarts > 0)).toBe(
      true
    );
    expect(state.service.health).toBe('critical');
    expect(state.service.availableEndpoints).toBe(0);
    expect(state.logs.some((l) => l.message.includes('PAYMENTS_SIGNING_CONFIG'))).toBe(true);
    expect(state.events.some((e) => e.title.includes('CrashLoopBackOff'))).toBe(true);
  });

  it('triggers Scenario B (Probe Misconfiguration) with 0 restarts, NotReady pods, and HTTP 404 evidence', () => {
    const state = triggerIncidentScenario('probe_misconfiguration');
    expect(state.activeIncident?.scenarioId).toBe('probe_misconfiguration');
    expect(state.deployment.readyReplicas).toBe(0);
    expect(state.deployment.config.readinessProbePath).toBe('/internal/healthz-v2');
    expect(state.deployment.readinessProbePassing).toBe(false);
    expect(state.deployment.livenessProbePassing).toBe(true);
    expect(state.pods.every((p) => p.phase === 'NotReady' && p.restarts === 0)).toBe(true);
    expect(state.logs.some((l) => l.message.includes('404') && l.message.includes('/internal/healthz-v2'))).toBe(
      true
    );
  });

  it('triggers Scenario C (Resource Pressure) with OOMKilled pods, 128Mi limit, and latency spike', () => {
    const state = triggerIncidentScenario('resource_pressure');
    expect(state.activeIncident?.scenarioId).toBe('resource_pressure');
    expect(state.deployment.readyReplicas).toBe(1);
    expect(state.deployment.unhealthyReplicas).toBe(2);
    expect(state.deployment.config.memoryLimit).toBe('128Mi');
    expect(state.pods.filter((p) => p.phase === 'OOMKilled')).toHaveLength(2);
    expect(state.metrics.memoryUtilizationPercent).toBeGreaterThanOrEqual(95);
    expect(state.metrics.p99LatencyMs).toBeGreaterThan(1000);
    expect(state.logs.some((l) => l.message.includes('OOMKilled') && l.message.includes('137'))).toBe(true);
  });

  it('builds complete server-authoritative Gemini context from active simulation state', () => {
    const triggered = triggerIncidentScenario('crashloop_backoff');
    const ctx = buildSimulationGeminiContext(triggered);
    expect(ctx.simulatedEnvironment).toBe(true);
    expect(ctx.incidentId).toBe(triggered.activeIncident?.id);
    expect(ctx.clusterName).toBe('demo-payments-cluster');
    expect(ctx.namespace).toBe('payments');
    expect(ctx.deployment.desiredReplicas).toBe(3);
    expect(ctx.deployment.readyReplicas).toBe(0);
    expect(ctx.pods).toHaveLength(3);
    expect(ctx.recentLogs.length).toBeGreaterThan(0);
    expect(ctx.recentEvents.length).toBeGreaterThan(0);
    expect(ctx.deployment.config.requiredEnvConfigured).toBe(false);
  });

  it('runs Gemini investigation via /api/simulation/investigate and propagates failure cleanly if AI fails', async () => {
    const app = createApp();
    triggerIncidentScenario('probe_misconfiguration');

    // Failure case — never fabricates a successful report
    setGeminiClientOverride({
      models: { generateContent: vi.fn().mockRejectedValue(new Error('503 UNAVAILABLE')) },
    });
    const failRes = await request(app).post('/api/simulation/investigate').send({});
    expect(failRes.status).toBe(503);
    expect(failRes.body.error).toBeTruthy();

    // Success case with mocked Gemini
    setGeminiClientOverride({
      models: {
        generateContent: vi
          .fn()
          .mockResolvedValue(
            mockGeminiJson(
              makeValidInvestigationPayload(
                'fix_readiness_probe_path',
                'Readiness probe points to nonexistent /internal/healthz-v2'
              )
            )
          ),
      },
    });
    const okRes = await request(app).post('/api/simulation/investigate').send({});
    expect(okRes.status).toBe(200);
    expect(okRes.body.investigation.mostLikelyRootCause).toContain('/internal/healthz-v2');
    expect(okRes.body.proposedRemediation.actionId).toBe('fix_readiness_probe_path');
    expect(okRes.body.state.activeIncident.status).toBe('investigating');
  });

  it('rejects unapproved, unallowlisted, shell-command, or mismatched remediation attempts', async () => {
    const state = triggerIncidentScenario('crashloop_backoff');
    const incidentId = state.activeIncident!.id;

    // Cannot approve before investigation proposes a plan
    const beforePlan = approveAndStartRecovery({
      incidentId,
      actionId: 'restore_required_env_config',
      approved: true,
    });
    expect(beforePlan.ok).toBe(false);
    expect(beforePlan.statusCode).toBe(409);

    setGeminiClientOverride({
      models: {
        generateContent: vi
          .fn()
          .mockResolvedValue(
            mockGeminiJson(
              makeValidInvestigationPayload(
                'restore_required_env_config',
                'Missing secretRef payments-signing-config'
              )
            )
          ),
      },
    });
    await investigateActiveSimulationIncident();

    // Missing explicit approval
    const notApproved = approveAndStartRecovery({
      incidentId,
      actionId: 'restore_required_env_config',
      approved: false,
    });
    expect(notApproved.ok).toBe(false);
    expect(notApproved.statusCode).toBe(400);

    // Arbitrary shell/kubectl command rejected
    const shellAttempt = approveAndStartRecovery({
      incidentId,
      actionId: 'kubectl delete pod --all -n payments',
      approved: true,
    });
    expect(shellAttempt.ok).toBe(false);
    expect(shellAttempt.statusCode).toBe(400);

    // Valid allowlisted action for DIFFERENT scenario rejected
    const wrongScenarioAction = approveAndStartRecovery({
      incidentId,
      actionId: 'fix_readiness_probe_path',
      approved: true,
    });
    expect(wrongScenarioAction.ok).toBe(false);
    expect(wrongScenarioAction.statusCode).toBe(400);
  });

  it('transitions pods CrashLoopBackOff -> Starting -> Running/Ready and resolves only after deterministic verification', async () => {
    const triggered = triggerIncidentScenario('crashloop_backoff');
    const incidentId = triggered.activeIncident!.id;

    setGeminiClientOverride({
      models: {
        generateContent: vi
          .fn()
          .mockResolvedValue(
            mockGeminiJson(
              makeValidInvestigationPayload(
                'restore_required_env_config',
                'Missing PAYMENTS_SIGNING_CONFIG'
              )
            )
          ),
      },
    });
    await investigateActiveSimulationIncident();

    // Step 1: Approve -> immediately transitions to Starting (NOT yet resolved)
    const approved = approveAndStartRecovery(
      { incidentId, actionId: 'restore_required_env_config', approved: true },
      { stepDelayMs: 60_000 }
    );
    expect(approved.ok).toBe(true);
    expect(approved.state?.recoveryStage).toBe('applying_config');
    expect(approved.state?.activeIncident?.status).toBe('recovering');
    expect(approved.state?.pods.every((p) => p.phase === 'Starting' && !p.ready)).toBe(true);
    expect(approved.state?.deployment.config.requiredEnvConfigured).toBe(true);

    // Step 2: Advance pods -> Running & Ready (still awaiting verification)
    const afterPods = stepPendingRecoveryForTests();
    expect(afterPods.recoveryStage).toBe('restarting_pods');
    expect(afterPods.pods.every((p) => p.phase === 'Running' && p.ready)).toBe(true);
    expect(afterPods.deployment.readyReplicas).toBe(3);

    // Step 3: Run deterministic verification -> resolves incident
    const verified = stepPendingRecoveryForTests();
    expect(verified.recoveryStage).toBe('completed');
    expect(verified.activeIncident?.status).toBe('resolved');
    expect(verified.activeIncident?.verification?.passed).toBe(true);
    expect(verified.activeIncident?.verification?.checks.every((c) => c.passed)).toBe(true);
    expect(verified.cluster.status).toBe('healthy');
    expect(verified.service.health).toBe('healthy');
    expect(verified.events.some((e) => e.title.includes('User approved simulated recovery'))).toBe(
      true
    );
    expect(verified.events.some((e) => e.title.includes('Readiness verification passed'))).toBe(true);
  });

  it('keeps incident open and reports failed checks when deterministic recovery verification fails', async () => {
    const triggered = triggerIncidentScenario('resource_pressure');
    const incidentId = triggered.activeIncident!.id;

    setGeminiClientOverride({
      models: {
        generateContent: vi
          .fn()
          .mockResolvedValue(
            mockGeminiJson(
              makeValidInvestigationPayload(
                'adjust_resource_limits_and_hpa',
                '128Mi memory limit caused OOMKilled'
              )
            )
          ),
      },
    });
    await investigateActiveSimulationIncident();

    const outcome = approveAndStartRecovery(
      { incidentId, actionId: 'adjust_resource_limits_and_hpa', approved: true },
      { fastForward: true, forceVerificationFailure: true }
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.state?.recoveryStage).toBe('failed');
    expect(outcome.state?.activeIncident?.status).toBe('open');
    expect(outcome.state?.activeIncident?.resolvedAt).toBeNull();
    expect(outcome.state?.activeIncident?.verification?.passed).toBe(false);
    expect(
      outcome.state?.activeIncident?.verification?.checks.some((c) => !c.passed)
    ).toBe(true);

    // Direct verifier check on unhealthy state also returns passed=false
    const directCheck = verifySimulationRecovery(outcome.state!);
    expect(directCheck.passed).toBe(false);
  });

  it('validates API inputs and resets simulation cleanly only when confirmed: true', async () => {
    const app = createApp();

    // Invalid scenario rejected
    const badTrigger = await request(app)
      .post('/api/simulation/trigger')
      .send({ scenarioId: 'drop_database' });
    expect(badTrigger.status).toBe(400);

    // Valid trigger
    const goodTrigger = await request(app)
      .post('/api/simulation/trigger')
      .send({ scenarioId: 'resource_pressure' });
    expect(goodTrigger.status).toBe(200);
    expect(goodTrigger.body.activeIncident.scenarioId).toBe('resource_pressure');

    // Events endpoint returns simulation timeline
    const eventsRes = await request(app).get('/api/simulation/events');
    expect(eventsRes.status).toBe(200);
    expect(eventsRes.body.simulated).toBe(true);
    expect(eventsRes.body.events.length).toBeGreaterThan(1);

    // Reset without confirmation rejected
    const badReset = await request(app).post('/api/simulation/reset').send({ confirmed: false });
    expect(badReset.status).toBe(400);

    // Confirmed reset restores healthy baseline
    const goodReset = await request(app).post('/api/simulation/reset').send({ confirmed: true });
    expect(goodReset.status).toBe(200);
    expect(goodReset.body.cluster.status).toBe('healthy');
    expect(goodReset.body.deployment.readyReplicas).toBe(3);
    expect(goodReset.body.activeIncident).toBeNull();
  });

  it('enforces complete isolation from real infrastructure in all simulation modules', () => {
    const simDir = path.resolve(process.cwd(), 'src/lib/simulation');
    const files = fs.readdirSync(simDir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThanOrEqual(5);

    const forbiddenPatterns = [
      /child_process/,
      /\bexecSync\b/,
      /\bspawn\(/,
      /@kubernetes\/client-node/,
      /dockerode/,
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.join(simDir, file), 'utf8');
      for (const pattern of forbiddenPatterns) {
        expect(pattern.test(content), `Forbidden real-infra pattern ${pattern} found in ${file}`).toBe(
          false
        );
      }
    }
  });
});
