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
  isPlainObject,
} from './helpers.ts';

const SENSITIVE_HOST_PATHS = [
  '/var/run/docker.sock',
  '/etc',
  '/proc',
  '/sys',
  '/root',
  '/var/log',
];

const SENSITIVE_COMPOSE_PORTS = new Set([22, 2375, 2376, 3306, 3389, 5432, 6379, 9200, 27017]);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scanCompose(file: ClassifiedFile): ShipSafeFinding[] {
  const findings: ShipSafeFinding[] = [];
  let idx = 1;
  const doc = file.parsedYamlDocs?.[0];
  if (!isPlainObject(doc) || !isPlainObject(doc.services)) {
    return findings;
  }

  const servicesEntries = Object.entries(doc.services);
  const serviceStartLines: Array<{ name: string; startLine: number }> = [];

  for (const [svcName] of servicesEntries) {
    const ln = findLineInRange(
      file.lines,
      new RegExp(`^\\s{2,4}${escapeRegex(svcName)}\\s*:`),
      1,
      file.lines.length
    );
    serviceStartLines.push({ name: svcName, startLine: ln ?? 1 });
  }

  servicesEntries.forEach(([svcName, rawSvc], svcIndex) => {
    if (!isPlainObject(rawSvc)) return;
    const sStart = serviceStartLines[svcIndex]?.startLine ?? 1;
    const sEnd =
      svcIndex + 1 < serviceStartLines.length
        ? Math.max(sStart, serviceStartLines[svcIndex + 1].startLine - 1)
        : file.lines.length;

    // CP001: Privileged container
    if (rawSvc.privileged === true) {
      const ln = findLineInRange(file.lines, /\bprivileged\s*:\s*true/, sStart, sEnd) ?? sStart;
      findings.push(
        createFinding(
          {
            ruleId: 'CP001',
            title: `Privileged container enabled on service "${svcName}"`,
            description:
              'Setting privileged: true grants the container full kernel capabilities and access to host devices.',
            severity: 'critical',
            category: 'compose',
            fileName: file.fileName,
            lineNumber: ln,
            evidence: extractSnippet(file.lines, ln),
            impact: 'Allows trivial container escape onto the Docker host.',
            recommendation: 'Remove privileged: true and grant only minimal Linux capabilities if required.',
            fixExample: 'privileged: false',
            confidence: 'high',
          },
          idx++
        )
      );
    }

    // CP002: Host networking
    if (String(rawSvc.network_mode || '').toLowerCase() === 'host') {
      const ln = findLineInRange(file.lines, /\bnetwork_mode\s*:\s*["']?host/, sStart, sEnd) ?? sStart;
      findings.push(
        createFinding(
          {
            ruleId: 'CP002',
            title: `Host network mode enabled on service "${svcName}"`,
            description:
              'Using network_mode: host shares the host network stack directly with the container, bypassing Docker bridge network isolation.',
            severity: 'high',
            category: 'compose',
            fileName: file.fileName,
            lineNumber: ln,
            evidence: extractSnippet(file.lines, ln),
            impact: 'Container can sniff host interfaces or bind privileged host ports.',
            recommendation: 'Use an isolated user-defined Compose bridge network and publish only required ports.',
            confidence: 'high',
          },
          idx++
        )
      );
    }

    // CP003: Host bind mounts
    const volumes = Array.isArray(rawSvc.volumes) ? rawSvc.volumes : [];
    for (const vol of volumes) {
      let source = '';
      if (typeof vol === 'string') {
        const parts = vol.split(':');
        if (parts.length >= 2) source = parts[0].trim();
      } else if (isPlainObject(vol) && vol.type === 'bind' && typeof vol.source === 'string') {
        source = vol.source.trim();
      }

      if (!source) continue;
      const isHostPath = source.startsWith('/') || source.startsWith('./') || source.startsWith('../');
      if (!isHostPath) continue;

      const isSensitivePath =
        source === '/' ||
        SENSITIVE_HOST_PATHS.some((p) => source === p || source.startsWith(`${p}/`));

      const ln = findLineInRange(file.lines, source, sStart, sEnd) ?? sStart;
      findings.push(
        createFinding(
          {
            ruleId: 'CP003',
            title: isSensitivePath
              ? `Sensitive host path mounted in "${svcName}" (${source})`
              : `Host bind mount configured in "${svcName}" (${source})`,
            description: isSensitivePath
              ? 'Mounting sensitive host directories or the Docker socket gives the container control over host files or the Docker daemon.'
              : 'Bind mounting host directories ties container execution to host filesystem paths and permissions.',
            severity: isSensitivePath ? 'high' : 'medium',
            category: 'compose',
            fileName: file.fileName,
            lineNumber: ln,
            evidence: extractSnippet(file.lines, ln),
            impact: isSensitivePath
              ? 'Mounting docker.sock or system directories enables full host root compromise.'
              : 'Potential host path exposure or unexpected file mutation across restarts.',
            recommendation: isSensitivePath
              ? 'Remove the sensitive bind mount or use a restricted Docker socket proxy.'
              : 'Prefer named Docker volumes for persistent application data or mount read-only (:ro) if read access is sufficient.',
            confidence: 'high',
          },
          idx++
        )
      );
    }

    // CP004: Sensitive values hardcoded in environment
    const env = rawSvc.environment;
    const envPairs: Array<{ key: string; val: string }> = [];
    if (Array.isArray(env)) {
      for (const item of env) {
        if (typeof item === 'string' && item.includes('=')) {
          const eq = item.indexOf('=');
          envPairs.push({ key: item.slice(0, eq).trim(), val: item.slice(eq + 1).trim() });
        }
      }
    } else if (isPlainObject(env)) {
      for (const [k, v] of Object.entries(env)) {
        if (v !== null && v !== undefined) {
          envPairs.push({ key: k, val: String(v) });
        }
      }
    }

    for (const { key, val } of envPairs) {
      if (
        (isSensitiveKeyName(key) && !isTemplateOrReference(val)) ||
        containsKnownCredentialToken(val)
      ) {
        const ln = findLineInRange(file.lines, key, sStart, sEnd) ?? sStart;
        findings.push(
          createFinding(
            {
              ruleId: 'CP004',
              title: `Hardcoded credential in environment variable "${key}" on "${svcName}"`,
              description:
                'Literal secret values in docker-compose files are stored in plaintext and risk exposure in version control.',
              severity: 'critical',
              category: 'secrets',
              fileName: file.fileName,
              lineNumber: ln,
              evidence: `${key}: [REDACTED]`,
              impact: 'Exposes credentials to anyone with access to the Compose definition.',
              recommendation: 'Reference environment variables (${VAR}) from a gitignored .env file or Docker secrets.',
              fixExample: `environment:\n  ${key}: \${${key}}`,
              confidence: 'high',
            },
            idx++
          )
        );
      }
    }

    // CP005: Container running as root
    const userVal = rawSvc.user !== undefined ? String(rawSvc.user).trim() : '';
    const isExplicitRoot = userVal === 'root' || userVal === '0' || userVal.startsWith('0:');
    const missingUser = !userVal;
    if (isExplicitRoot || missingUser) {
      const ln = isExplicitRoot
        ? findLineInRange(file.lines, /\buser\s*:/, sStart, sEnd) ?? sStart
        : sStart;
      findings.push(
        createFinding(
          {
            ruleId: 'CP005',
            title: isExplicitRoot
              ? `Service "${svcName}" explicitly runs as root`
              : `Service "${svcName}" does not specify a non-root user`,
            description: isExplicitRoot
              ? 'Service explicitly sets user to root / UID 0.'
              : 'Service omits a non-root user directive; unless the base image defines a non-root USER, it will run as UID 0.',
            severity: isExplicitRoot ? 'high' : 'medium',
            category: 'compose',
            fileName: file.fileName,
            lineNumber: ln,
            evidence: extractSnippet(file.lines, ln),
            impact: 'Increases container privilege scope if compromised.',
            recommendation: 'Set an explicit non-root UID:GID (e.g. user: "10001:10001") or verify image USER.',
            fixExample: 'user: "10001:10001"',
            confidence: isExplicitRoot ? 'high' : 'medium',
          },
          idx++
        )
      );
    }

    // CP006: Missing resource limits
    const deploy = isPlainObject(rawSvc.deploy) ? rawSvc.deploy : null;
    const deployRes = deploy && isPlainObject(deploy.resources) ? deploy.resources : null;
    const hasLimits =
      (deployRes && isPlainObject(deployRes.limits)) ||
      rawSvc.mem_limit !== undefined ||
      rawSvc.cpus !== undefined;
    if (!hasLimits) {
      findings.push(
        createFinding(
          {
            ruleId: 'CP006',
            title: `Missing CPU/memory limits on service "${svcName}"`,
            description:
              'Service does not declare deploy.resources.limits (or mem_limit/cpus), allowing unbounded memory growth.',
            severity: 'low',
            category: 'compose',
            fileName: file.fileName,
            lineNumber: sStart,
            evidence: extractSnippet(file.lines, sStart),
            impact: 'A memory leak in one service can exhaust host RAM and trigger OOM kills on sibling containers.',
            recommendation: 'Define deploy.resources.limits.memory and cpus.',
            fixExample: 'deploy:\n  resources:\n    limits:\n      cpus: "0.50"\n      memory: 512M',
            confidence: 'high',
          },
          idx++
        )
      );
    }

    // CP007: Exposed ports bound to all interfaces (0.0.0.0)
    const ports = Array.isArray(rawSvc.ports) ? rawSvc.ports : [];
    for (const portEntry of ports) {
      let hostIp = '';
      let hostPortNum: number | null = null;
      let rawPortText = '';

      if (typeof portEntry === 'string' || typeof portEntry === 'number') {
        rawPortText = String(portEntry).trim();
        const cleaned = rawPortText.replace(/\/(tcp|udp)$/i, '');
        const segments = cleaned.split(':');
        if (segments.length === 3) {
          hostIp = segments[0];
          hostPortNum = Number(segments[1]);
        } else if (segments.length === 2) {
          hostIp = '0.0.0.0';
          hostPortNum = Number(segments[0]);
        }
      } else if (isPlainObject(portEntry)) {
        hostIp = typeof portEntry.host_ip === 'string' ? portEntry.host_ip : '0.0.0.0';
        hostPortNum = portEntry.published ? Number(portEntry.published) : null;
        rawPortText = `${hostIp}:${hostPortNum ?? ''}`;
      }

      if (hostIp === '127.0.0.1' || hostIp === '::1' || hostIp === 'localhost') {
        continue;
      }

      if (hostPortNum !== null && !Number.isNaN(hostPortNum)) {
        const isSensitivePort = SENSITIVE_COMPOSE_PORTS.has(hostPortNum);
        const ln = findLineInRange(file.lines, String(hostPortNum), sStart, sEnd) ?? sStart;
        findings.push(
          createFinding(
            {
              ruleId: 'CP007',
              title: isSensitivePort
                ? `Sensitive port ${hostPortNum} bound to all host interfaces in "${svcName}"`
                : `Port ${hostPortNum} bound to all host interfaces (0.0.0.0) in "${svcName}"`,
              description: isSensitivePort
                ? `Database/admin port ${hostPortNum} is published on 0.0.0.0 instead of 127.0.0.1, potentially exposing internal data services outside localhost.`
                : `Port ${hostPortNum} is published on all host network interfaces. Confirm whether external exposure is intended or bind to 127.0.0.1.`,
              severity: isSensitivePort ? 'medium' : 'info',
              category: 'compose',
              fileName: file.fileName,
              lineNumber: ln,
              evidence: extractSnippet(file.lines, ln),
              impact: isSensitivePort
                ? 'Unintended network exposure of database or admin ports on host firewall.'
                : 'Service is reachable from external interfaces if host firewall permits.',
              recommendation: `Bind local-only ports to 127.0.0.1 (e.g. "127.0.0.1:${hostPortNum}:${hostPortNum}").`,
              fixExample: `ports:\n  - "127.0.0.1:${hostPortNum}:${hostPortNum}"`,
              confidence: 'medium',
            },
            idx++
          )
        );
      }
    }
  });

  return findings;
}
