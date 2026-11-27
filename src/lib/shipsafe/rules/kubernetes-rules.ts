import {
  containsKnownCredentialToken,
  isSensitiveKeyName,
  isTemplateOrReference,
} from '../secret-sanitizer.ts';
import type { ClassifiedFile, ShipSafeFinding } from '../types.ts';
import {
  createFinding,
  extractSnippet,
  findLineInRange,
  getYamlDocumentRanges,
  isPlainObject,
} from './helpers.ts';

const DANGEROUS_CAPABILITIES = new Set([
  'ALL',
  'SYS_ADMIN',
  'NET_ADMIN',
  'NET_RAW',
  'SYS_PTRACE',
  'SYS_MODULE',
  'DAC_OVERRIDE',
  'DAC_READ_SEARCH',
  'SETUID',
  'SETGID',
  'SYS_RAWIO',
]);

interface K8sContainer {
  name?: string;
  image?: string;
  securityContext?: Record<string, unknown>;
  resources?: {
    requests?: Record<string, unknown>;
    limits?: Record<string, unknown>;
  };
  env?: Array<Record<string, unknown>>;
  readinessProbe?: unknown;
  livenessProbe?: unknown;
}

function getPodSpec(doc: Record<string, unknown>): {
  podSpec: Record<string, unknown> | null;
  isLongRunningWorkload: boolean;
} {
  const kind = String(doc.kind || '');
  const spec = isPlainObject(doc.spec) ? doc.spec : null;
  if (!spec) return { podSpec: null, isLongRunningWorkload: false };

  if (kind === 'Pod') {
    return { podSpec: spec, isLongRunningWorkload: true };
  }

  if (['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet'].includes(kind)) {
    const template = isPlainObject(spec.template) ? spec.template : null;
    const templateSpec = template && isPlainObject(template.spec) ? template.spec : null;
    return { podSpec: templateSpec, isLongRunningWorkload: true };
  }

  if (kind === 'Job') {
    const template = isPlainObject(spec.template) ? spec.template : null;
    const templateSpec = template && isPlainObject(template.spec) ? template.spec : null;
    return { podSpec: templateSpec, isLongRunningWorkload: false };
  }

  if (kind === 'CronJob') {
    const jobTemplate = isPlainObject(spec.jobTemplate) ? spec.jobTemplate : null;
    const jobSpec = jobTemplate && isPlainObject(jobTemplate.spec) ? jobTemplate.spec : null;
    const template = jobSpec && isPlainObject(jobSpec.template) ? jobSpec.template : null;
    const templateSpec = template && isPlainObject(template.spec) ? template.spec : null;
    return { podSpec: templateSpec, isLongRunningWorkload: false };
  }

  return { podSpec: null, isLongRunningWorkload: false };
}

export function scanKubernetes(file: ClassifiedFile): ShipSafeFinding[] {
  const findings: ShipSafeFinding[] = [];
  let idx = 1;
  const docs = file.parsedYamlDocs || [];
  const docRanges = getYamlDocumentRanges(file.lines);

  docs.forEach((rawDoc, docIdx) => {
    if (!isPlainObject(rawDoc)) return;
    const kind = typeof rawDoc.kind === 'string' ? rawDoc.kind : '';
    const range = docRanges[docIdx] || { startLine: 1, endLine: file.lines.length };
    const metadata = isPlainObject(rawDoc.metadata) ? rawDoc.metadata : {};
    const resourceName = typeof metadata.name === 'string' ? metadata.name : kind;

    // 1. Pod / Workload checks (KS001 - KS008, KS011, KS012)
    const { podSpec, isLongRunningWorkload } = getPodSpec(rawDoc);
    if (podSpec) {
      const podSecCtx = isPlainObject(podSpec.securityContext) ? podSpec.securityContext : null;

      // KS004: HostPath volumes
      const volumes = Array.isArray(podSpec.volumes) ? podSpec.volumes : [];
      for (const vol of volumes) {
        if (isPlainObject(vol) && isPlainObject(vol.hostPath)) {
          const ln =
            findLineInRange(file.lines, /\bhostPath\s*:/, range.startLine, range.endLine) ??
            range.startLine;
          findings.push(
            createFinding(
              {
                ruleId: 'KS004',
                title: `HostPath volume mounted in ${kind} "${resourceName}"`,
                description:
                  'Mounting host filesystem paths directly into pods allows containers to read or modify host files and bypasses cluster storage isolation.',
                severity: 'high',
                category: 'kubernetes',
                fileName: file.fileName,
                lineNumber: ln,
                evidence: extractSnippet(file.lines, ln, 1),
                impact: 'Pod compromise can escalate to node-level file tampering or secret theft.',
                recommendation: 'Replace hostPath with PersistentVolumeClaim, emptyDir, or ConfigMap/Secret volumes.',
                confidence: 'high',
                references: ['Pod Security Standards: Baseline'],
              },
              idx++
            )
          );
        }
      }

      // KS005: hostNetwork / hostPID / hostIPC
      for (const hostKey of ['hostNetwork', 'hostPID', 'hostIPC'] as const) {
        if (podSpec[hostKey] === true) {
          const ln =
            findLineInRange(file.lines, new RegExp(`\\b${hostKey}\\s*:\\s*true`), range.startLine, range.endLine) ??
            range.startLine;
          findings.push(
            createFinding(
              {
                ruleId: 'KS005',
                title: `${hostKey}: true enabled on ${kind} "${resourceName}"`,
                description: `Enabling ${hostKey} shares the underlying worker node namespace with the container, breaking pod isolation.`,
                severity: 'critical',
                category: 'kubernetes',
                fileName: file.fileName,
                lineNumber: ln,
                evidence: extractSnippet(file.lines, ln),
                impact: 'Allows sniffing host traffic, inspecting host processes, or accessing node-local services.',
                recommendation: `Set ${hostKey}: false or remove the directive unless required by a CNI/node DaemonSet.`,
                fixExample: `${hostKey}: false`,
                confidence: 'high',
                references: ['Pod Security Standards: Baseline'],
              },
              idx++
            )
          );
        }
      }

      const regularContainers = Array.isArray(podSpec.containers)
        ? (podSpec.containers.filter(isPlainObject) as K8sContainer[])
        : [];
      const initContainers = Array.isArray(podSpec.initContainers)
        ? (podSpec.initContainers.filter(isPlainObject) as K8sContainer[])
        : [];

      const allContainers: Array<{ container: K8sContainer; isInit: boolean }> = [
        ...regularContainers.map((c) => ({ container: c, isInit: false })),
        ...initContainers.map((c) => ({ container: c, isInit: true })),
      ];

      let containerSearchCursor = range.startLine;

      for (const { container, isInit } of allContainers) {
        const cName = typeof container.name === 'string' ? container.name : 'container';
        const nameLine = findLineInRange(
          file.lines,
          new RegExp(`name\\s*:\\s*["']?${escapeRegex(cName)}["']?`),
          containerSearchCursor,
          range.endLine
        );
        const cStart = nameLine ?? containerSearchCursor;
        if (nameLine) {
          containerSearchCursor = nameLine;
        }
        const cEnd = range.endLine;

        const cSecCtx = isPlainObject(container.securityContext)
          ? container.securityContext
          : null;

        // KS001: Privileged container
        if (cSecCtx?.privileged === true) {
          const ln =
            findLineInRange(file.lines, /\bprivileged\s*:\s*true/, cStart, cEnd) ?? cStart;
          findings.push(
            createFinding(
              {
                ruleId: 'KS001',
                title: `Privileged mode enabled on container "${cName}"`,
                description:
                  'Setting securityContext.privileged: true grants the container full host kernel capabilities and access to host devices.',
                severity: 'critical',
                category: 'kubernetes',
                fileName: file.fileName,
                lineNumber: ln,
                evidence: extractSnippet(file.lines, ln, 1),
                impact: 'Trivial container breakout to the underlying Kubernetes worker node.',
                recommendation: 'Disable privileged mode and set allowPrivilegeEscalation: false.',
                fixExample:
                  'securityContext:\n  privileged: false\n  allowPrivilegeEscalation: false\n  runAsNonRoot: true',
                confidence: 'high',
                references: ['Pod Security Standards: Baseline'],
              },
              idx++
            )
          );
        }

        // KS002: Root execution with Pod-to-Container override resolution
        const effectiveRunAsNonRoot =
          cSecCtx && typeof cSecCtx.runAsNonRoot === 'boolean'
            ? cSecCtx.runAsNonRoot
            : podSecCtx && typeof podSecCtx.runAsNonRoot === 'boolean'
              ? podSecCtx.runAsNonRoot
              : undefined;

        const effectiveRunAsUser =
          cSecCtx && typeof cSecCtx.runAsUser === 'number'
            ? cSecCtx.runAsUser
            : podSecCtx && typeof podSecCtx.runAsUser === 'number'
              ? podSecCtx.runAsUser
              : undefined;

        const explicitlyRootUser = effectiveRunAsUser === 0;
        const explicitlyRootFlag = effectiveRunAsNonRoot === false;
        const missingNonRoot =
          effectiveRunAsNonRoot !== true &&
          (effectiveRunAsUser === undefined || effectiveRunAsUser === 0);

        if (explicitlyRootUser || explicitlyRootFlag || missingNonRoot) {
          const ln =
            (cSecCtx
              ? findLineInRange(file.lines, /\b(runAsNonRoot|runAsUser|securityContext)\s*:/, cStart, cEnd)
              : null) ??
            (podSecCtx
              ? findLineInRange(file.lines, /\b(runAsNonRoot|runAsUser|securityContext)\s*:/, range.startLine, range.endLine)
              : null) ??
            cStart;

          findings.push(
            createFinding(
              {
                ruleId: 'KS002',
                title: `Container "${cName}" may run as root (UID 0)`,
                description: explicitlyRootFlag || explicitlyRootUser
                  ? 'Container or effective pod securityContext explicitly allows root execution (runAsNonRoot: false or runAsUser: 0).'
                  : 'Neither container nor pod securityContext enforces runAsNonRoot: true or a non-zero runAsUser.',
                severity: 'high',
                category: 'kubernetes',
                fileName: file.fileName,
                lineNumber: ln,
                evidence: extractSnippet(file.lines, ln),
                impact: 'Processes running as UID 0 have elevated privileges inside the container namespace.',
                recommendation: 'Enforce runAsNonRoot: true and set a non-zero runAsUser (e.g. 10001).',
                fixExample: 'securityContext:\n  runAsNonRoot: true\n  runAsUser: 10001',
                confidence: 'high',
                references: ['Pod Security Standards: Restricted'],
              },
              idx++
            )
          );
        }

        // KS011: Missing securityContext completely (only when neither pod nor container defines securityContext)
        if (!podSecCtx && !cSecCtx) {
          findings.push(
            createFinding(
              {
                ruleId: 'KS011',
                title: `Missing securityContext on container "${cName}"`,
                description:
                  'Neither the pod spec nor this container defines a securityContext for capability dropping, privilege escalation prevention, or read-only root filesystem.',
                severity: 'medium',
                category: 'kubernetes',
                fileName: file.fileName,
                lineNumber: cStart,
                evidence: extractSnippet(file.lines, cStart),
                impact: 'Container retains default runtime privileges and writable root filesystem.',
                recommendation:
                  'Add securityContext with allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, and capabilities.drop: ["ALL"].',
                fixExample:
                  'securityContext:\n  allowPrivilegeEscalation: false\n  readOnlyRootFilesystem: true\n  capabilities:\n    drop: ["ALL"]',
                confidence: 'high',
              },
              idx++
            )
          );
        }

        // KS007: Dangerous capabilities added
        const caps = cSecCtx && isPlainObject(cSecCtx.capabilities) ? cSecCtx.capabilities : null;
        const addedCaps = caps && Array.isArray(caps.add) ? caps.add.map(String) : [];
        const riskyCaps = addedCaps.filter((cap) =>
          DANGEROUS_CAPABILITIES.has(cap.toUpperCase())
        );
        if (riskyCaps.length > 0) {
          const ln =
            findLineInRange(file.lines, /\bcapabilities\s*:/, cStart, cEnd) ?? cStart;
          findings.push(
            createFinding(
              {
                ruleId: 'KS007',
                title: `Dangerous Linux capabilities added (${riskyCaps.join(', ')}) on "${cName}"`,
                description:
                  'Adding privileged kernel capabilities expands the container attack surface and can allow host network manipulation or kernel module tampering.',
                severity: 'high',
                category: 'kubernetes',
                fileName: file.fileName,
                lineNumber: ln,
                evidence: extractSnippet(file.lines, ln, 2),
                impact: 'Increases likelihood of container breakout or lateral network spoofing.',
                recommendation: 'Drop ALL capabilities and add only minimal required capabilities (such as NET_BIND_SERVICE).',
                fixExample: 'capabilities:\n  drop:\n    - ALL',
                confidence: 'high',
                references: ['Pod Security Standards: Restricted'],
              },
              idx++
            )
          );
        }

        // KS003: Missing resource requests or limits
        const res = isPlainObject(container.resources) ? container.resources : null;
        const hasRequests = res && isPlainObject(res.requests) && (res.requests.cpu || res.requests.memory);
        const hasLimits = res && isPlainObject(res.limits) && (res.limits.cpu || res.limits.memory);
        if (!hasRequests || !hasLimits) {
          const ln =
            findLineInRange(file.lines, /\bresources\s*:/, cStart, cEnd) ?? cStart;
          findings.push(
            createFinding(
              {
                ruleId: 'KS003',
                title: `Missing CPU/memory ${!hasRequests && !hasLimits ? 'requests and limits' : !hasLimits ? 'limits' : 'requests'} on "${cName}"`,
                description:
                  'Containers without explicit resource requests and limits risk node memory exhaustion (OOMKilled) and noisy-neighbor CPU starvation.',
                severity: 'medium',
                category: 'kubernetes',
                fileName: file.fileName,
                lineNumber: ln,
                evidence: extractSnippet(file.lines, ln),
                impact: 'Increases risk of CrashLoopBackOff (Exit Code 137) and scheduler instability.',
                recommendation: 'Define both resources.requests and resources.limits for memory and CPU.',
                fixExample:
                  'resources:\n  requests:\n    memory: "256Mi"\n    cpu: "250m"\n  limits:\n    memory: "512Mi"\n    cpu: "500m"',
                confidence: 'high',
              },
              idx++
            )
          );
        }

        // KS006: Image using :latest or lacking pinned tag/digest
        if (typeof container.image === 'string') {
          const img = container.image.trim();
          const lastSegment = img.split('/').pop() || img;
          const hasDigest = img.includes('@sha256:');
          const hasTag = lastSegment.includes(':');
          const tag = hasTag ? lastSegment.split(':').pop() : null;

          if (!hasDigest && (!hasTag || tag?.toLowerCase() === 'latest')) {
            const ln =
              findLineInRange(file.lines, /\bimage\s*:/, cStart, cEnd) ?? cStart;
            findings.push(
              createFinding(
                {
                  ruleId: 'KS006',
                  title: `Unpinned container image tag on "${cName}"`,
                  description:
                    'Referencing :latest or an untagged image prevents deterministic rollbacks and makes deployed artifacts ambiguous.',
                  severity: 'medium',
                  category: 'kubernetes',
                  fileName: file.fileName,
                  lineNumber: ln,
                  evidence: extractSnippet(file.lines, ln),
                  impact: 'Nodes may pull mismatched image builds during autoscaling or pod restarts.',
                  recommendation: 'Pin container images to an immutable semantic version or SHA256 digest.',
                  fixExample: `image: ${img.split(':')[0]}:v1.4.2@sha256:<digest>`,
                  confidence: 'high',
                },
                idx++
              )
            );
          }
        }

        // KS008: Secrets embedded directly in container env
        const envList = Array.isArray(container.env) ? container.env : [];
        for (const envEntry of envList) {
          if (!isPlainObject(envEntry)) continue;
          const envName = typeof envEntry.name === 'string' ? envEntry.name : '';
          const envValue = typeof envEntry.value === 'string' ? envEntry.value : '';
          const hasValueFrom = isPlainObject(envEntry.valueFrom);

          if (
            !hasValueFrom &&
            envValue &&
            ((isSensitiveKeyName(envName) && !isTemplateOrReference(envValue)) ||
              containsKnownCredentialToken(envValue))
          ) {
            const ln =
              findLineInRange(
                file.lines,
                new RegExp(`name\\s*:\\s*["']?${escapeRegex(envName)}["']?`),
                cStart,
                cEnd
              ) ?? cStart;
            findings.push(
              createFinding(
                {
                  ruleId: 'KS008',
                  title: `Hardcoded secret in env variable "${envName}" on "${cName}"`,
                  description:
                    'Sensitive environment values are embedded as plaintext literals in the Kubernetes manifest instead of referencing a Secret or external secret store.',
                  severity: 'critical',
                  category: 'secrets',
                  fileName: file.fileName,
                  lineNumber: ln,
                  evidence: `${envName}: [REDACTED]`,
                  impact: 'Exposes production credentials in Git history, kubectl get pod output, and CI logs.',
                  recommendation: 'Use valueFrom.secretKeyRef or External Secrets Operator.',
                  fixExample: `env:\n  - name: ${envName}\n    valueFrom:\n      secretKeyRef:\n        name: app-secrets\n        key: ${envName}`,
                  confidence: 'high',
                },
                idx++
              )
            );
          }
        }

        // KS012: Missing readinessProbe or livenessProbe on long-running containers
        if (!isInit && isLongRunningWorkload) {
          const hasReadiness = isPlainObject(container.readinessProbe);
          const hasLiveness = isPlainObject(container.livenessProbe);
          if (!hasReadiness || !hasLiveness) {
            const missingBoth = !hasReadiness && !hasLiveness;
            findings.push(
              createFinding(
                {
                  ruleId: 'KS012',
                  title: `Missing ${missingBoth ? 'readinessProbe and livenessProbe' : !hasReadiness ? 'readinessProbe' : 'livenessProbe'} on "${cName}"`,
                  description:
                    'Long-running workload containers without health probes may receive traffic before startup completes or stay stuck in broken states.',
                  severity: 'low',
                  category: 'kubernetes',
                  fileName: file.fileName,
                  lineNumber: cStart,
                  evidence: extractSnippet(file.lines, cStart),
                  impact: 'Causes 502/503 errors during rolling updates and delayed self-healing.',
                  recommendation: 'Configure HTTP or TCP readinessProbe and livenessProbe endpoints.',
                  fixExample:
                    'readinessProbe:\n  httpGet:\n    path: /healthz\n    port: 8080\n  initialDelaySeconds: 5\n  periodSeconds: 10',
                  confidence: 'medium',
                },
                idx++
              )
            );
          }
        }
      }
    }

    // KS008 also catches committed kind: Secret with plaintext stringData/data literals
    if (kind === 'Secret') {
      const hasData = isPlainObject(rawDoc.data) || isPlainObject(rawDoc.stringData);
      if (hasData) {
        const ln =
          findLineInRange(file.lines, /\b(stringData|data)\s*:/, range.startLine, range.endLine) ??
          range.startLine;
        findings.push(
          createFinding(
            {
              ruleId: 'KS008',
              title: `Kubernetes Secret "${resourceName}" contains embedded secret payloads`,
              description:
                'Committing Kubernetes Secret manifests with literal data/stringData exposes credentials in source control (base64 is encoding, not encryption).',
              severity: 'high',
              category: 'secrets',
              fileName: file.fileName,
              lineNumber: ln,
              evidence: `kind: Secret (${resourceName}) -> [REDACTED]`,
              impact: 'Anyone with repository read access can decode the secret values.',
              recommendation: 'Use External Secrets Operator, SealedSecrets, or KMS-encrypted secret injection.',
              confidence: 'high',
            },
            idx++
          )
        );
      }
    }

    // KS009: Service exposed as NodePort or LoadBalancer (contextual exposure warning)
    if (kind === 'Service' && isPlainObject(rawDoc.spec)) {
      const svcType = String(rawDoc.spec.type || 'ClusterIP');
      if (svcType === 'NodePort' || svcType === 'LoadBalancer') {
        const ln =
          findLineInRange(file.lines, /\btype\s*:/, range.startLine, range.endLine) ??
          range.startLine;
        findings.push(
          createFinding(
            {
              ruleId: 'KS009',
              title: `Service "${resourceName}" exposed via ${svcType}`,
              description: `Service type ${svcType} exposes ports externally or on every cluster node IP. Ensure this exposure is intentional and protected by network policies or load balancer source ranges.`,
              severity: 'info',
              category: 'kubernetes',
              fileName: file.fileName,
              lineNumber: ln,
              evidence: extractSnippet(file.lines, ln),
              impact: 'Unintended external reachability if internal services are exposed without loadBalancerSourceRanges or Ingress auth.',
              recommendation: 'Use ClusterIP behind an Ingress controller for HTTP services, or restrict loadBalancerSourceRanges.',
              confidence: 'medium',
            },
            idx++
          )
        );
      }
    }

    // KS010: Excessively permissive RBAC Role / ClusterRole
    if (kind === 'Role' || kind === 'ClusterRole') {
      const rules = Array.isArray(rawDoc.rules) ? rawDoc.rules : [];
      for (const rule of rules) {
        if (!isPlainObject(rule)) continue;
        const verbs = Array.isArray(rule.verbs) ? rule.verbs.map(String) : [];
        const resources = Array.isArray(rule.resources) ? rule.resources.map(String) : [];
        const apiGroups = Array.isArray(rule.apiGroups) ? rule.apiGroups.map(String) : [];

        const hasWildcardVerb = verbs.includes('*');
        const hasWildcardResource = resources.includes('*');
        const hasWildcardGroup = apiGroups.includes('*');
        const hasDangerousVerb = verbs.some((v) => ['escalate', 'bind', 'impersonate'].includes(v));

        if (hasWildcardVerb || hasWildcardResource || hasWildcardGroup || hasDangerousVerb) {
          const ln =
            findLineInRange(file.lines, /\b(verbs|resources|apiGroups)\s*:/, range.startLine, range.endLine) ??
            range.startLine;
          findings.push(
            createFinding(
              {
                ruleId: 'KS010',
                title: `Over-permissive RBAC rule in ${kind} "${resourceName}"`,
                description:
                  'RBAC role grants wildcard (*) permissions or privilege-escalation verbs (escalate/bind/impersonate).',
                severity: 'critical',
                category: 'kubernetes',
                fileName: file.fileName,
                lineNumber: ln,
                evidence: extractSnippet(file.lines, ln, 2),
                impact: 'ServiceAccount compromise can lead to cluster-wide secret reads or privilege escalation.',
                recommendation: 'Scope apiGroups, resources, and verbs strictly to the exact operations needed.',
                confidence: 'high',
                references: ['CIS Kubernetes Benchmark 5.1.3'],
              },
              idx++
            )
          );
          break;
        }
      }
    }
  });

  return findings;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
