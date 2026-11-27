import {
  containsKnownCredentialToken,
  isSensitiveKeyName,
  isTemplateOrReference,
} from '../secret-sanitizer.ts';
import type { ClassifiedFile, ShipSafeFinding } from '../types.ts';
import { createFinding } from './helpers.ts';

interface DockerStage {
  startLine: number;
  baseImage: string;
  users: Array<{ line: number; value: string; raw: string }>;
  hasHealthcheck: boolean;
}

/**
 * Joins Dockerfile backslash line continuations while preserving the starting 1-indexed line number.
 */
function parseLogicalInstructions(lines: string[]): Array<{ lineNumber: number; text: string }> {
  const result: Array<{ lineNumber: number; text: string }> = [];
  let buffer = '';
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!buffer) {
      if (!trimmed || trimmed.startsWith('#')) continue;
      startLine = i + 1;
    }

    if (trimmed.endsWith('\\')) {
      buffer += `${trimmed.slice(0, -1)} `;
    } else {
      buffer += trimmed;
      result.push({ lineNumber: startLine, text: buffer.trim() });
      buffer = '';
    }
  }

  if (buffer.trim()) {
    result.push({ lineNumber: startLine, text: buffer.trim() });
  }

  return result;
}

export function scanDockerfile(file: ClassifiedFile): ShipSafeFinding[] {
  const findings: ShipSafeFinding[] = [];
  let idx = 1;
  const instructions = parseLogicalInstructions(file.lines);

  const stages: DockerStage[] = [];
  let currentStage: DockerStage | null = null;
  let hasExposeOrCmd = false;
  let copyDotIndex = -1;
  let pkgManifestCopyIndex = -1;

  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    const upper = inst.text.toUpperCase();

    // Track stages
    if (upper.startsWith('FROM ')) {
      const rest = inst.text.slice(5).trim();
      const imagePart = rest.split(/\s+/)[0] || '';
      currentStage = {
        startLine: inst.lineNumber,
        baseImage: imagePart,
        users: [],
        hasHealthcheck: false,
      };
      stages.push(currentStage);

      // DS002: Use of :latest or untagged image (excluding scratch and @sha256 digests)
      const lowerImg = imagePart.toLowerCase();
      const isStageAlias = stages.slice(0, -1).some((s) => s.baseImage.toLowerCase() === lowerImg);
      if (lowerImg !== 'scratch' && !isStageAlias && !lowerImg.includes('@sha256:')) {
        const tagPart = imagePart.includes(':') ? imagePart.split(':').pop() : null;
        if (!tagPart || tagPart.toLowerCase() === 'latest') {
          findings.push(
            createFinding(
              {
                ruleId: 'DS002',
                title: 'Base image uses mutable :latest or unpinned tag',
                description:
                  'Pinning base images with :latest or omitting a version tag makes container builds non-deterministic and may pull breaking or vulnerable OS packages unexpectedly.',
                severity: 'medium',
                category: 'container',
                fileName: file.fileName,
                lineNumber: inst.lineNumber,
                evidence: inst.text,
                impact: 'Unpredictable base layer CVEs and non-reproducible production builds.',
                recommendation: 'Pin the base image to an explicit minor/patch version and SHA256 digest.',
                fixExample: 'FROM node:20.18-alpine@sha256:<verified-digest>',
                confidence: 'high',
                references: ['CIS Docker Benchmark 4.7'],
              },
              idx++
            )
          );
        }
      }
      continue;
    }

    if (upper.startsWith('USER ') && currentStage) {
      const userVal = inst.text.slice(5).trim().split(/\s+/)[0] || '';
      currentStage.users.push({ line: inst.lineNumber, value: userVal, raw: inst.text });
    }

    if (upper.startsWith('HEALTHCHECK ') && currentStage) {
      if (!/\bHEALTHCHECK\s+NONE\b/i.test(inst.text)) {
        currentStage.hasHealthcheck = true;
      }
    }

    if (upper.startsWith('EXPOSE ') || upper.startsWith('CMD ') || upper.startsWith('ENTRYPOINT ')) {
      hasExposeOrCmd = true;
    }

    // DS003: Sensitive value in ENV or ARG
    if (upper.startsWith('ENV ') || upper.startsWith('ARG ')) {
      const body = inst.text.slice(4).trim();
      // Split space-separated KEY=VAL pairs or single KEY VAL
      const kvPairs = body.includes('=')
        ? body.match(/[A-Za-z0-9_.-]+=(?:"[^"]*"|'[^']*'|\S+)/g) || []
        : (() => {
            const parts = body.split(/\s+/);
            return parts.length >= 2 ? [`${parts[0]}=${parts.slice(1).join(' ')}`] : [];
          })();

      for (const pair of kvPairs) {
        const eq = pair.indexOf('=');
        if (eq <= 0) continue;
        const key = pair.slice(0, eq).trim();
        const val = pair.slice(eq + 1).trim();
        if (
          (isSensitiveKeyName(key) && !isTemplateOrReference(val)) ||
          containsKnownCredentialToken(val)
        ) {
          findings.push(
            createFinding(
              {
                ruleId: 'DS003',
                title: `Hardcoded credential or sensitive value in ${upper.startsWith('ENV') ? 'ENV' : 'ARG'} (${key})`,
                description:
                  'Secrets placed in Dockerfile ENV or ARG instructions are baked into image layer metadata and remain readable via docker history or image inspection.',
                severity: 'critical',
                category: 'secrets',
                fileName: file.fileName,
                lineNumber: inst.lineNumber,
                evidence: inst.text,
                impact: 'Anyone with registry pull access can extract the embedded secret from image layers.',
                recommendation:
                  'Inject secrets at container runtime via Kubernetes Secrets, Cloud Run Secret Manager, or Docker BuildKit --mount=type=secret.',
                fixExample: '# Remove hardcoded secret from Dockerfile and pass via runtime secret manager',
                confidence: 'high',
                references: ['CIS Docker Benchmark 4.10'],
              },
              idx++
            )
          );
        }
      }
    }

    // DS004: Unsafe configuration patterns
    if (
      /chmod\s+(?:-R\s+)?0?777\b/i.test(inst.text) ||
      /chmod\s+(?:-R\s+)?a\+rwx\b/i.test(inst.text) ||
      /\bsudo\b/i.test(inst.text) ||
      /--privileged\b/i.test(inst.text) ||
      /^ADD\s+https?:\/\//i.test(inst.text)
    ) {
      findings.push(
        createFinding(
          {
            ruleId: 'DS004',
            title: 'Unsafe container build privilege or permission pattern detected',
            description:
              'World-writable permissions (chmod 777), sudo usage, or remote unverified ADD URLs weaken container filesystem and privilege boundaries.',
            severity: 'high',
            category: 'container',
            fileName: file.fileName,
            lineNumber: inst.lineNumber,
            evidence: inst.text,
            impact: 'Allows arbitrary file modification or unverified remote archive execution during build.',
            recommendation:
              'Use restrictive file permissions (e.g., 0755/0644), drop sudo, and replace remote ADD with curl + SHA256 checksum verification.',
            fixExample: 'RUN chmod 0755 /app/entrypoint.sh',
            confidence: 'high',
          },
          idx++
        )
      );
    }

    // DS007: curl/wget piped directly into shell
    if (
      /\b(curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|ash|dash)\b/i.test(inst.text)
    ) {
      findings.push(
        createFinding(
          {
            ruleId: 'DS007',
            title: 'Remote script piped directly into shell (curl/wget | sh)',
            description:
              'Downloading and immediately executing a remote script without cryptographic checksum verification exposes the build to MITM or upstream compromise.',
            severity: 'high',
            category: 'container',
            fileName: file.fileName,
            lineNumber: inst.lineNumber,
            evidence: inst.text,
            impact: 'Compromised upstream endpoint can inject malicious binaries into your container image.',
            recommendation: 'Download the artifact, verify its SHA256 digest, and then execute or install it.',
            fixExample:
              'RUN curl -fsSL https://example.com/tool.tar.gz -o tool.tar.gz && echo "<sha256>  tool.tar.gz" | sha256sum -c -',
            confidence: 'high',
          },
          idx++
        )
      );
    }

    // DS006: Broad package installation without version pinning (best-effort)
    if (upper.startsWith('RUN ')) {
      const hasApt = /\bapt-get\s+install\b/i.test(inst.text);
      const hasApk = /\bapk\s+add\b/i.test(inst.text);
      if (hasApt || hasApk) {
        // Check if any package token after install/add lacks '=' version pin
        const afterCmd = inst.text.replace(/^RUN\s+/i, '');
        const pkgMatch = afterCmd.match(/(?:apt-get\s+install|apk\s+add)\s+([^&;|]+)/i);
        if (pkgMatch) {
          const tokens = pkgMatch[1]
            .trim()
            .split(/\s+/)
            .filter((t) => t && !t.startsWith('-'));
          const hasUnpinned = tokens.some((t) => !t.includes('='));
          if (tokens.length > 0 && hasUnpinned) {
            findings.push(
              createFinding(
                {
                  ruleId: 'DS006',
                  title: 'OS package installation lacks explicit version pinning',
                  description:
                    'Installing apt/apk packages without explicit versions can pull unexpected minor/major updates across rebuilds.',
                  severity: 'low',
                  category: 'container',
                  fileName: file.fileName,
                  lineNumber: inst.lineNumber,
                  evidence: inst.text,
                  impact: 'Builds may drift over time when upstream distro repositories update.',
                  recommendation: 'Pin critical OS packages (e.g., package=1.2.3) when strict reproducibility is required.',
                  confidence: 'medium',
                },
                idx++
              )
            );
          }
        }

        // DS008: apt-get install without cleaning apt cache
        if (hasApt && !/\/var\/lib\/apt\/lists\/\*/.test(inst.text)) {
          findings.push(
            createFinding(
              {
                ruleId: 'DS008',
                title: 'Package manager cache not cleaned in same RUN layer',
                description:
                  'Running apt-get install without removing /var/lib/apt/lists/* in the same RUN layer leaves unnecessary package index files in the image.',
                severity: 'info',
                category: 'container',
                fileName: file.fileName,
                lineNumber: inst.lineNumber,
                evidence: inst.text,
                impact: 'Increases image size and container pull latency during autoscaling.',
                recommendation: 'Append && rm -rf /var/lib/apt/lists/* in the same RUN instruction.',
                fixExample: 'RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*',
                confidence: 'high',
              },
              idx++
            )
          );
        }
      }
    }

    // Track copy order for DS008 layer cache insight
    if (upper.startsWith('COPY ')) {
      if (/^COPY\s+\.\s+\./i.test(inst.text) && copyDotIndex === -1) {
        copyDotIndex = i;
      }
      if (/(package\*?\.json|requirements\.txt|go\.mod|pom\.xml)/i.test(inst.text) && pkgManifestCopyIndex === -1) {
        pkgManifestCopyIndex = i;
      }
    }
  }

  // Evaluate final stage for DS001 & DS005
  const finalStage = stages[stages.length - 1];
  if (finalStage) {
    const baseLower = finalStage.baseImage.toLowerCase();
    const isKnownNonRootBase =
      baseLower === 'scratch' ||
      baseLower.includes(':nonroot') ||
      baseLower.includes('-nonroot');

    const lastUser = finalStage.users[finalStage.users.length - 1];
    const runsAsRoot =
      (!lastUser && !isKnownNonRootBase) ||
      (lastUser && (lastUser.value === 'root' || lastUser.value === '0' || lastUser.value.startsWith('0:')));

    if (runsAsRoot) {
      findings.push(
        createFinding(
          {
            ruleId: 'DS001',
            title: 'Container runs as root (no non-root USER in final stage)',
            description:
              'The final image stage either omits a USER instruction or explicitly sets USER root / UID 0, causing the container process to execute as root by default.',
            severity: 'high',
            category: 'container',
            fileName: file.fileName,
            lineNumber: lastUser ? lastUser.line : finalStage.startLine,
            evidence: lastUser ? lastUser.raw : `FROM ${finalStage.baseImage} (no USER instruction)`,
            impact: 'Increases blast radius if an application vulnerability leads to arbitrary file writes or container escape.',
            recommendation: 'Create a dedicated unprivileged user and switch to it before CMD/ENTRYPOINT.',
            fixExample: 'RUN addgroup -S app && adduser -S app -G app\nUSER app',
            confidence: 'high',
            references: ['CIS Docker Benchmark 4.1'],
          },
          idx++
        )
      );
    }

    // DS005: Missing HEALTHCHECK in service-oriented images
    if (hasExposeOrCmd && !finalStage.hasHealthcheck && baseLower !== 'scratch') {
      findings.push(
        createFinding(
          {
            ruleId: 'DS005',
            title: 'Missing HEALTHCHECK instruction in Dockerfile',
            description:
              'No HEALTHCHECK instruction is defined for this service container, preventing container runtimes from detecting hung processes automatically.',
            severity: 'low',
            category: 'container',
            fileName: file.fileName,
            lineNumber: finalStage.startLine,
            evidence: `FROM ${finalStage.baseImage}`,
            impact: 'Unhealthy containers may continue receiving traffic when running outside Kubernetes liveness probes.',
            recommendation: 'Add a lightweight HEALTHCHECK instruction (or verify Kubernetes probes cover it).',
            fixExample: 'HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/healthz || exit 1',
            confidence: 'medium',
            references: ['CIS Docker Benchmark 4.6'],
          },
          idx++
        )
      );
    }
  }

  // DS008: Excessive stages (>4) or COPY . . before dependency manifests
  if (stages.length > 4) {
    findings.push(
      createFinding(
        {
          ruleId: 'DS008',
          title: `High number of build stages (${stages.length} stages)`,
          description:
            'Dockerfile declares more than 4 FROM stages, which can complicate build caching and maintenance if intermediate stages are unused.',
          severity: 'info',
          category: 'container',
          fileName: file.fileName,
          lineNumber: stages[4].startLine,
          evidence: `FROM ${stages[4].baseImage}`,
          impact: 'Potentially slower CI build times and complex dependency graphs.',
          recommendation: 'Consolidate redundant stages where practical.',
          confidence: 'low',
        },
        idx++
      )
    );
  } else if (copyDotIndex !== -1 && pkgManifestCopyIndex !== -1 && copyDotIndex < pkgManifestCopyIndex) {
    findings.push(
      createFinding(
        {
          ruleId: 'DS008',
          title: 'Broad COPY . . appears before dependency manifest copy',
          description:
            'Copying the entire repository before dependency manifests invalidates Docker layer caching on every source code change.',
          severity: 'info',
          category: 'container',
          fileName: file.fileName,
          lineNumber: instructions[copyDotIndex].lineNumber,
          evidence: instructions[copyDotIndex].text,
          impact: 'Longer CI build durations and repeated dependency downloads.',
          recommendation: 'Copy lockfiles/manifests and install dependencies before running COPY . .',
          confidence: 'medium',
        },
        idx++
      )
    );
  }

  return findings;
}

export function scanDockerignore(file: ClassifiedFile): ShipSafeFinding[] {
  const findings: ShipSafeFinding[] = [];
  let idx = 1;
  const entries = file.lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  const ignoresEnv = entries.some((e) => e === '.env' || e === '.env*' || e === '*.env' || e === '**/.env');
  const ignoresGit = entries.some((e) => e === '.git' || e === '.git/' || e === '**/.git');
  const ignoresKeys = entries.some((e) => e.includes('*.pem') || e.includes('*.key'));

  if (!ignoresEnv) {
    findings.push(
      createFinding(
        {
          ruleId: 'DI001',
          title: '.dockerignore does not exclude .env files',
          description:
            'Without .env in .dockerignore, a broad COPY . . instruction can accidentally copy local environment secrets into the container image.',
          severity: 'medium',
          category: 'container',
          fileName: file.fileName,
          lineNumber: 1,
          evidence: entries.slice(0, 4).join('\n') || '(empty patterns)',
          impact: 'Local developer secrets or API keys may be baked into build context and image layers.',
          recommendation: 'Add .env and .env.* entries to .dockerignore.',
          fixExample: '.env\n.env.*\n*.pem\n*.key',
          confidence: 'high',
        },
        idx++
      )
    );
  }

  if (!ignoresGit || !ignoresKeys) {
    findings.push(
      createFinding(
        {
          ruleId: 'DI002',
          title: '.dockerignore is missing .git or private key exclusions',
          description:
            'Excluding .git, *.pem, and *.key reduces build context size and prevents accidental inclusion of repository history or TLS keys.',
          severity: 'low',
          category: 'container',
          fileName: file.fileName,
          lineNumber: 1,
          evidence: entries.slice(0, 4).join('\n') || '(empty patterns)',
          impact: 'Larger Docker build contexts and potential inclusion of VCS metadata.',
          recommendation: 'Include .git, *.pem, and *.key in .dockerignore.',
          fixExample: '.git\n*.pem\n*.key',
          confidence: 'medium',
        },
        idx++
      )
    );
  }

  return findings;
}
