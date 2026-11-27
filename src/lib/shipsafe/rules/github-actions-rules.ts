import type { ClassifiedFile, ShipSafeFinding } from '../types.ts';
import {
  createFinding,
  extractSnippet,
  findLineInRange,
  isPlainObject,
} from './helpers.ts';

const DANGEROUS_TRIGGER_CONTEXTS = [
  'github.event.issue.title',
  'github.event.issue.body',
  'github.event.pull_request.title',
  'github.event.pull_request.body',
  'github.event.comment.body',
  'github.event.review.body',
  'github.event.discussion.title',
  'github.head_ref',
];

function getTriggers(doc: Record<string, unknown>): unknown {
  // js-yaml parses unquoted `on:` in YAML 1.1 mode or string `'on'`
  if ('on' in doc) return doc.on;
  if ('true' in doc) return doc.true;
  return undefined;
}

function hasPullRequestTargetTrigger(triggers: unknown): boolean {
  if (typeof triggers === 'string') return triggers === 'pull_request_target';
  if (Array.isArray(triggers)) return triggers.includes('pull_request_target');
  if (isPlainObject(triggers)) return 'pull_request_target' in triggers;
  return false;
}

function isWritePermissionValue(val: unknown): boolean {
  if (val === 'write-all') return true;
  if (isPlainObject(val)) {
    return Object.values(val).some((v) => v === 'write');
  }
  return false;
}

export function scanGitHubActions(file: ClassifiedFile): ShipSafeFinding[] {
  const findings: ShipSafeFinding[] = [];
  let idx = 1;
  const doc = file.parsedYamlDocs?.[0];
  if (!isPlainObject(doc)) return findings;

  const triggers = getTriggers(doc);
  const topPermissions = doc.permissions;
  const jobs = isPlainObject(doc.jobs) ? doc.jobs : {};

  // GA001: Broad or missing top-level workflow permissions
  if (topPermissions === undefined) {
    // Check if every job specifies permissions; if any omits permissions, flag missing least-privilege
    const anyJobMissingPerms = Object.values(jobs).some(
      (j) => isPlainObject(j) && j.permissions === undefined
    );
    if (anyJobMissingPerms) {
      findings.push(
        createFinding(
          {
            ruleId: 'GA001',
            title: 'Workflow omits explicit least-privilege GITHUB_TOKEN permissions',
            description:
              'Neither the workflow root nor all jobs define an explicit permissions block, which may inherit broad default read/write token scopes depending on repository settings.',
            severity: 'medium',
            category: 'cicd',
            fileName: file.fileName,
            lineNumber: 1,
            evidence: extractSnippet(file.lines, 1, 2),
            impact: 'Compromised build steps or third-party actions could push code or modify releases.',
            recommendation: 'Declare explicit minimal permissions at the workflow root (e.g., permissions: { contents: read }).',
            fixExample: 'permissions:\n  contents: read',
            confidence: 'high',
          },
          idx++
        )
      );
    }
  } else if (
    topPermissions === 'write-all' ||
    (isPlainObject(topPermissions) &&
      Object.values(topPermissions).filter((v) => v === 'write').length >= 2)
  ) {
    const ln = findLineInRange(file.lines, /\bpermissions\s*:/, 1, file.lines.length) ?? 1;
    findings.push(
      createFinding(
        {
          ruleId: 'GA001',
          title: 'Overly broad GITHUB_TOKEN write permissions at workflow root',
          description:
            'Workflow grants write-all or multiple top-level write scopes to all jobs.',
          severity: topPermissions === 'write-all' ? 'high' : 'medium',
          category: 'cicd',
          fileName: file.fileName,
          lineNumber: ln,
          evidence: extractSnippet(file.lines, ln, 2),
          impact: 'Increases supply-chain blast radius if any workflow step is compromised.',
          recommendation: 'Set permissions: read-all or contents: read at top level and grant write only to specific deploy/release jobs.',
          fixExample: 'permissions:\n  contents: read',
          confidence: 'high',
        },
        idx++
      )
    );
  }

  const usesPrTarget = hasPullRequestTargetTrigger(triggers);

  for (const [jobName, rawJob] of Object.entries(jobs)) {
    if (!isPlainObject(rawJob)) continue;
    const jobStart =
      findLineInRange(file.lines, new RegExp(`^\\s{2,4}${jobName}\\s*:`), 1, file.lines.length) ?? 1;

    // GA006: Missing timeout-minutes
    if (rawJob['timeout-minutes'] === undefined) {
      findings.push(
        createFinding(
          {
            ruleId: 'GA006',
            title: `Job "${jobName}" is missing timeout-minutes`,
            description:
              'GitHub Actions jobs default to a 360-minute (6 hour) timeout if timeout-minutes is omitted.',
            severity: 'info',
            category: 'cicd',
            fileName: file.fileName,
            lineNumber: jobStart,
            evidence: extractSnippet(file.lines, jobStart),
            impact: 'Hung tests or blocked deployments can stall runners and burn CI runner quota.',
            recommendation: 'Set an explicit timeout-minutes (e.g., 15 or 30) on each job.',
            fixExample: 'timeout-minutes: 15',
            confidence: 'high',
          },
          idx++
        )
      );
    }

    const steps = Array.isArray(rawJob.steps) ? rawJob.steps : [];
    const jobHasWritePerms =
      isWritePermissionValue(rawJob.permissions) ||
      (rawJob.permissions === undefined && isWritePermissionValue(topPermissions));

    let checkedOutPrHead = false;
    let stepCursor = jobStart;

    for (const step of steps) {
      if (!isPlainObject(step)) continue;

      // GA002: Mutable tag in `uses:`
      if (typeof step.uses === 'string') {
        const usesStr = step.uses.trim();
        // Skip local actions (./...) and docker:// images
        if (!usesStr.startsWith('./') && !usesStr.startsWith('docker://')) {
          const atIdx = usesStr.lastIndexOf('@');
          const ref = atIdx > -1 ? usesStr.slice(atIdx + 1) : '';
          const isPinnedSha = /^[0-9a-f]{40}$/i.test(ref);

          if (!isPinnedSha) {
            const isFirstParty =
              usesStr.startsWith('actions/') || usesStr.startsWith('github/');
            const isFloatingBranch = /^(main|master|head|latest)$/i.test(ref);
            const ln =
              findLineInRange(file.lines, usesStr, stepCursor, file.lines.length) ?? stepCursor;
            stepCursor = ln;

            findings.push(
              createFinding(
                {
                  ruleId: 'GA002',
                  title: `Action "${usesStr}" referenced by mutable ${isFloatingBranch ? 'branch' : 'tag'} instead of commit SHA`,
                  description:
                    'Mutable Git tags or branch names can be overwritten upstream, allowing supply-chain code injection in CI.',
                  severity: isFirstParty && !isFloatingBranch ? 'low' : 'medium',
                  category: 'cicd',
                  fileName: file.fileName,
                  lineNumber: ln,
                  evidence: extractSnippet(file.lines, ln),
                  impact: 'Upstream tag compromise executes unreviewed JavaScript/Docker code inside your CI runner.',
                  recommendation: 'Pin third-party actions to a full 40-character commit SHA with a version comment.',
                  fixExample: `uses: ${usesStr.split('@')[0]}@<40-char-commit-sha> # ${ref || 'v4'}`,
                  confidence: 'high',
                },
                idx++
              )
            );
          }

          // Track PR head checkout for GA003
          if (usesStr.startsWith('actions/checkout') && isPlainObject(step.with)) {
            const checkoutRef = String(step.with.ref || '');
            if (
              checkoutRef.includes('pull_request.head') ||
              checkoutRef.includes('github.head_ref')
            ) {
              checkedOutPrHead = true;
            }
          }
        }
      }

      // GA004 & GA005: Inspect `run:` blocks
      if (typeof step.run === 'string') {
        const runScript = step.run;
        const ln =
          findLineInRange(
            file.lines,
            /\brun\s*:/,
            stepCursor,
            file.lines.length
          ) ?? stepCursor;
        stepCursor = ln;

        // GA004: Secret interpolation / echo exposure in run script
        if (/\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}/.test(runScript)) {
          const isExplicitEchoOrOutput =
            /\b(echo|printf|cat)\b[^\n]*\$\{\{\s*secrets\./i.test(runScript) ||
            />>\s*\$GITHUB_(ENV|OUTPUT|STEP_SUMMARY)/.test(runScript);
          findings.push(
            createFinding(
              {
                ruleId: 'GA004',
                title: isExplicitEchoOrOutput
                  ? `Potential secret exposure in shell output in job "${jobName}"`
                  : `Secret interpolated directly inside run script in job "${jobName}"`,
                description:
                  'Interpolating ${{ secrets.* }} directly inside shell run scripts or echoing them can leak credentials in runner logs or enable shell escaping bugs.',
                severity: isExplicitEchoOrOutput ? 'critical' : 'high',
                category: 'secrets',
                fileName: file.fileName,
                lineNumber: ln,
                evidence: '${{ secrets.[REDACTED] }} inside run step',
                impact: 'Secrets may be exposed in workflow build logs or shell process arguments.',
                recommendation: 'Pass secrets via step-level env: mappings and never echo secret values.',
                fixExample: 'env:\n  DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}\nrun: ./deploy.sh',
                confidence: 'high',
              },
              idx++
            )
          );
        }

        // GA005: Dangerous untrusted workflow trigger context in run script
        const matchedCtx = DANGEROUS_TRIGGER_CONTEXTS.find((ctx) =>
          runScript.includes(ctx)
        );
        if (matchedCtx) {
          findings.push(
            createFinding(
              {
                ruleId: 'GA005',
                title: `Untrusted trigger context "${matchedCtx}" interpolated in shell step`,
                description:
                  'Directly interpolating user-controlled GitHub event metadata (PR title, issue body, comment, head_ref) inside a run script creates a shell command injection vulnerability.',
                severity: 'high',
                category: 'cicd',
                fileName: file.fileName,
                lineNumber: ln,
                evidence: `run step references \${{ ${matchedCtx} }}`,
                impact: 'An external contributor can execute arbitrary commands on the GitHub Actions runner.',
                recommendation: 'Assign the expression to an intermediate env: variable and quote "$VAR" in the shell script.',
                fixExample: `env:\n  PR_TITLE: \${{ ${matchedCtx} }}\nrun: echo "$PR_TITLE"`,
                confidence: 'high',
              },
              idx++
            )
          );
        }
      }
    }

    // GA003: pull_request_target combined with untrusted PR head checkout or write permissions
    if (usesPrTarget && (checkedOutPrHead || jobHasWritePerms)) {
      findings.push(
        createFinding(
          {
            ruleId: 'GA003',
            title: `Unsafe pull_request_target workflow in job "${jobName}"`,
            description:
              'Workflow triggers on pull_request_target (which runs with base-repo write tokens and secrets) while checking out untrusted PR head code or holding write permissions.',
            severity: 'critical',
            category: 'cicd',
            fileName: file.fileName,
            lineNumber: jobStart,
            evidence: `on: pull_request_target + job "${jobName}"`,
            impact: 'Forked pull requests can steal repository secrets or push malicious commits to the base repo.',
            recommendation:
              'Use pull_request for untrusted code builds/tests, or strictly avoid checking out PR head commits inside pull_request_target.',
            confidence: 'high',
          },
          idx++
        )
      );
    }
  }

  return findings;
}
