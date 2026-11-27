import type {
  ActivityEvent,
  ChatMessage,
  EvidenceItem,
  Incident,
  NotificationItem,
  ScanFinding,
  ScanHistoryRecord,
  UploadedConfigFile,
  Workspace,
} from '../types/infravoice';

export const CURRENT_USER = {
  name: 'Shaik Davudh',
  role: 'Staff Site Reliability Engineer',
  email: 'shaik.davudh@shipsafe-demo.dev',
  initials: 'SD',
  avatarUrl: '/src/assets/images/avatar_engineer_profile_1795759857850.jpg',
};

export const WORKSPACES: Workspace[] = [
  {
    id: 'ws-payments-prod',
    name: 'payments-prod',
    region: 'ap-south-1 (Mumbai)',
    cluster: 'eks-payments-prod-01',
    environment: 'production',
    riskScore: 38,
    riskLabel: 'Moderate',
    openFindings: { critical: 2, high: 4, medium: 5, low: 3 },
    activeIncidents: 2,
    investigatingIncidents: 1,
    healthPercent: '99.94%',
    podsReady: '42 / 44 pods ready',
    lastScanSummary: {
      repository: 'acme-fin/payments-settlement-api',
      commitSha: '9f3a21c',
      scannedAt: '14 mins ago',
      duration: '3.2s',
      verdict: 'needs_review',
    },
    riskTrend: [54, 52, 49, 51, 46, 44, 47, 43, 41, 40, 42, 39, 38, 38],
  },
  {
    id: 'ws-upi-core',
    name: 'upi-gateway-core',
    region: 'ap-south-2 (Hyderabad)',
    cluster: 'eks-upi-core-02',
    environment: 'production',
    riskScore: 19,
    riskLabel: 'Low',
    openFindings: { critical: 0, high: 1, medium: 4, low: 6 },
    activeIncidents: 1,
    investigatingIncidents: 0,
    healthPercent: '99.99%',
    podsReady: '68 / 68 pods ready',
    lastScanSummary: {
      repository: 'acme-fin/upi-switch-router',
      commitSha: '4c81e0b',
      scannedAt: '1 hr ago',
      duration: '2.8s',
      verdict: 'passed',
    },
    riskTrend: [32, 30, 29, 27, 26, 25, 24, 22, 22, 21, 20, 20, 19, 19],
  },
  {
    id: 'ws-checkout-stg',
    name: 'checkout-staging',
    region: 'ap-south-1 (Mumbai)',
    cluster: 'eks-checkout-stg-01',
    environment: 'staging',
    riskScore: 64,
    riskLabel: 'Elevated',
    openFindings: { critical: 3, high: 6, medium: 7, low: 2 },
    activeIncidents: 1,
    investigatingIncidents: 1,
    healthPercent: '97.40%',
    podsReady: '19 / 22 pods ready',
    lastScanSummary: {
      repository: 'acme-fin/checkout-infra-tf',
      commitSha: 'e71d940',
      scannedAt: '6 mins ago',
      duration: '4.1s',
      verdict: 'blocked',
    },
    riskTrend: [41, 43, 48, 46, 52, 55, 58, 60, 59, 63, 66, 65, 64, 64],
  },
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Critical risk blocked in checkout-infra-tf',
    description: 'Wildcard IAM policy (*:*) detected on EKS worker role in eks-iam.tf.',
    timestamp: '6m ago',
    read: false,
    severity: 'critical',
    route: '/shipsafe',
  },
  {
    id: 'notif-2',
    title: 'INC-2041: CrashLoopBackOff on payments-settlement-api',
    description: '2 replicas restarted after OOMKilled (Exit Code 137) in payments-prod.',
    timestamp: '18m ago',
    read: false,
    severity: 'high',
    route: '/incidents',
  },
  {
    id: 'notif-3',
    title: 'Scan completed for upi-switch-router',
    description: 'Risk score improved from 24 to 19. 0 critical findings.',
    timestamp: '1h ago',
    read: true,
    severity: 'info',
    route: '/history',
  },
];

export const ACTIVITY_EVENTS: ActivityEvent[] = [
  {
    id: 'act-1',
    workspaceId: 'ws-payments-prod',
    type: 'incident',
    title: 'CrashLoopBackOff detected on payments-settlement-api',
    target: 'payments-prod / pod-7f8d9c',
    actor: 'kube-controller-manager',
    timestamp: '22:04 IST',
    outcome: 'critical',
    route: '/incidents',
  },
  {
    id: 'act-2',
    workspaceId: 'ws-payments-prod',
    type: 'scan',
    title: 'ShipSafe pre-deploy scan flagged 2 critical risks',
    target: 'payments-settlement-api@9f3a21c',
    actor: 'GitHub Actions',
    timestamp: '21:56 IST',
    outcome: 'warning',
    route: '/shipsafe',
  },
  {
    id: 'act-3',
    workspaceId: 'ws-payments-prod',
    type: 'deployment',
    title: 'Canary rollout paused at 25% traffic weight',
    target: 'ledger-worker-v2.14.3',
    actor: 'ArgoCD Sync',
    timestamp: '21:41 IST',
    outcome: 'warning',
    route: '/incidents',
  },
  {
    id: 'act-4',
    workspaceId: 'ws-payments-prod',
    type: 'scan',
    title: 'Dockerfile baseline verified with non-root user',
    target: 'fraud-scoring-svc@12a8bc4',
    actor: 'Rohan Kulkarni',
    timestamp: '20:18 IST',
    outcome: 'success',
    route: '/history',
  },
  {
    id: 'act-5',
    workspaceId: 'ws-upi-core',
    type: 'deployment',
    title: 'Production rollout completed across 3 AZs',
    target: 'upi-switch-router@4c81e0b',
    actor: 'ArgoCD Sync',
    timestamp: '19:45 IST',
    outcome: 'success',
    route: '/history',
  },
  {
    id: 'act-6',
    workspaceId: 'ws-checkout-stg',
    type: 'scan',
    title: 'Terraform plan blocked by ShipSafe policy gate',
    target: 'checkout-infra-tf@e71d940',
    actor: 'CI Pipeline #812',
    timestamp: '22:01 IST',
    outcome: 'critical',
    route: '/shipsafe',
  },
];

export const SAMPLE_CONFIG_PRESETS: Record<string, UploadedConfigFile> = {
  dockerfile: {
    id: 'sample-dockerfile',
    name: 'Dockerfile',
    format: 'Dockerfile',
    sizeBytes: 642,
    content: `FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/server.js"]`,
  },
  kubernetes: {
    id: 'sample-k8s',
    name: 'k8s-deployment.yaml',
    format: 'YAML',
    sizeBytes: 1120,
    content: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-settlement-api
  namespace: payments-prod
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: settlement-api
          image: ghcr.io/acme-fin/payments-settlement:latest
          securityContext:
            privileged: true
          ports:
            - containerPort: 8080
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"`,
  },
  terraform: {
    id: 'sample-tf',
    name: 'eks-iam.tf',
    format: 'Terraform',
    sizeBytes: 890,
    content: `resource "aws_iam_policy" "eks_worker_custom" {
  name        = "payments-worker-policy"
  description = "Custom policy for EKS worker nodes"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action   = ["s3:*", "kms:*", "sts:AssumeRole"]
      Effect   = "Allow"
      Resource = "*"
    }]
  })
}

resource "aws_security_group_rule" "ingress_all" {
  type              = "ingress"
  from_port         = 0
  to_port           = 65535
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.eks_nodes.id
}`,
  },
  workflow: {
    id: 'sample-gha',
    name: 'deploy-prod.yml',
    format: 'GitHub Actions',
    sizeBytes: 760,
    content: `name: Deploy Production
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS
        run: echo "AWS_SECRET_ACCESS_KEY=\${{ secrets.AWS_KEY }}"
      - name: Apply manifests
        run: kubectl apply -f k8s/`,
  },
};

export const INITIAL_SCAN_FINDINGS: ScanFinding[] = [
  {
    id: 'find-101',
    ruleId: 'SS-K8S-001',
    title: 'Privileged container enabled in Deployment spec',
    severity: 'critical',
    category: 'kubernetes',
    fileName: 'k8s-deployment.yaml',
    lineRange: 'Line 14–15',
    explanation:
      'Setting securityContext.privileged: true grants the container full host kernel capabilities and access to host devices, bypassing namespace isolation.',
    impact: 'Container breakout can compromise the underlying EKS worker node and co-located payment pods.',
    snippet: `securityContext:\n  privileged: true`,
    remediation: `securityContext:\n  privileged: false\n  allowPrivilegeEscalation: false\n  runAsNonRoot: true\n  readOnlyRootFilesystem: true`,
  },
  {
    id: 'find-102',
    ruleId: 'SS-IAM-004',
    title: 'Wildcard IAM actions and resource scope in Terraform policy',
    severity: 'critical',
    category: 'iam',
    fileName: 'eks-iam.tf',
    lineRange: 'Line 7–11',
    explanation:
      'The IAM policy grants s3:* and kms:* across Resource = "*", violating least-privilege boundaries for worker nodes.',
    impact: 'Any compromised pod with node IAM role access can decrypt KMS keys or read/delete all S3 buckets in the account.',
    snippet: `Action   = ["s3:*", "kms:*", "sts:AssumeRole"]\nEffect   = "Allow"\nResource = "*"`,
    remediation: `Action   = ["s3:GetObject", "s3:PutObject"]\nEffect   = "Allow"\nResource = "arn:aws:s3:::acme-payments-ledger-prod/*"`,
  },
  {
    id: 'find-103',
    ruleId: 'SS-K8S-009',
    title: 'Missing memory limit risks node-level OOM eviction',
    severity: 'high',
    category: 'kubernetes',
    fileName: 'k8s-deployment.yaml',
    lineRange: 'Line 18–21',
    explanation:
      'Memory requests are defined (256Mi), but resources.limits.memory is omitted. Unbounded heap growth can trigger OOMKilled (Exit Code 137) under traffic spikes.',
    impact: 'Matches recent INC-2041 pod restarts on payments-settlement-api during peak UPI settlement batches.',
    snippet: `resources:\n  requests:\n    memory: "256Mi"\n    cpu: "250m"`,
    remediation: `resources:\n  requests:\n    memory: "512Mi"\n    cpu: "250m"\n  limits:\n    memory: "1024Mi"\n    cpu: "1000m"`,
  },
  {
    id: 'find-104',
    ruleId: 'SS-CNT-002',
    title: 'Container runs as default root user without USER directive',
    severity: 'high',
    category: 'container',
    fileName: 'Dockerfile',
    lineRange: 'Line 1–8',
    explanation:
      'No USER instruction is declared in the Dockerfile and the base node:20 image defaults to UID 0 (root).',
    impact: 'Increases blast radius if a Node.js dependency vulnerability allows arbitrary file writes.',
    snippet: `FROM node:20\nWORKDIR /app\n...\nCMD ["node", "dist/server.js"]`,
    remediation: `FROM node:20-alpine\nRUN addgroup -S app && adduser -S app -G app\nUSER app\nCMD ["node", "dist/server.js"]`,
  },
  {
    id: 'find-105',
    ruleId: 'SS-K8S-014',
    title: 'Mutable :latest container image tag used in production manifest',
    severity: 'medium',
    category: 'kubernetes',
    fileName: 'k8s-deployment.yaml',
    lineRange: 'Line 12',
    explanation:
      'Referencing ghcr.io/acme-fin/payments-settlement:latest prevents deterministic rollbacks and makes image provenance ambiguous.',
    impact: 'Rollouts across nodes may pull mismatched builds if the registry tag is overwritten.',
    snippet: `image: ghcr.io/acme-fin/payments-settlement:latest`,
    remediation: `image: ghcr.io/acme-fin/payments-settlement:v2.14.4@sha256:8e4b91...`,
  },
  {
    id: 'find-106',
    ruleId: 'SS-CICD-007',
    title: 'Unpinned third-party GitHub Action and broad write permissions',
    severity: 'medium',
    category: 'cicd',
    fileName: 'deploy-prod.yml',
    lineRange: 'Line 8–13',
    explanation:
      'Workflow grants contents: write globally and uses floating @v4 tag instead of an immutable commit SHA.',
    impact: 'Supply-chain compromise in an upstream tag could modify repository contents or inject deploy steps.',
    snippet: `permissions:\n  contents: write\n  id-token: write`,
    remediation: `permissions:\n  contents: read\n  id-token: write\n# Pin actions to full 40-char commit SHA`,
  },
  {
    id: 'find-107',
    ruleId: 'SS-CNT-011',
    title: 'npm install used instead of deterministic npm ci',
    severity: 'low',
    category: 'container',
    fileName: 'Dockerfile',
    lineRange: 'Line 4',
    explanation:
      'Using npm install in CI/image builds can drift from package-lock.json and leaves cache artifacts inside the layer.',
    impact: 'Slightly larger container image and non-reproducible dependency trees.',
    snippet: `RUN npm install`,
    remediation: `RUN npm ci --omit=dev && npm cache clean --force`,
  },
];

export function analyzeConfigFiles(files: UploadedConfigFile[]): ScanFinding[] {
  const generated: ScanFinding[] = [];
  let idx = 200;

  for (const file of files) {
    const content = file.content;
    const lower = content.toLowerCase();

    if (file.format === 'Dockerfile' || file.name.toLowerCase().includes('dockerfile')) {
      if (!lower.includes('user ')) {
        generated.push({
          id: `dyn-${idx++}`,
          ruleId: 'SS-CNT-002',
          title: 'Container runs as root (missing USER directive)',
          severity: 'high',
          category: 'container',
          fileName: file.name,
          lineRange: 'Line 1–end',
          explanation: `No non-root USER instruction found in ${file.name}. Running Node/Python/Go processes as root expands container breakout risk.`,
          impact: 'Elevated host exposure if application RCE occurs.',
          snippet: content.split('\n').slice(0, 4).join('\n'),
          remediation: `RUN addgroup -S app && adduser -S app -G app\nUSER app`,
        });
      }
      if (lower.includes('npm install')) {
        generated.push({
          id: `dyn-${idx++}`,
          ruleId: 'SS-CNT-011',
          title: 'Non-deterministic npm install in container build',
          severity: 'low',
          category: 'container',
          fileName: file.name,
          lineRange: `Line ${findLineNumber(content, 'npm install')}`,
          explanation: 'npm install ignores lockfile strictness compared to npm ci.',
          impact: 'Build drift across environments.',
          snippet: 'RUN npm install',
          remediation: 'RUN npm ci --omit=dev && npm cache clean --force',
        });
      }
      if (lower.includes(':latest') || /from\s+node:\d+\s*$/im.test(content)) {
        generated.push({
          id: `dyn-${idx++}`,
          ruleId: 'SS-CNT-006',
          title: 'Base image lacks pinned digest or minimal variant',
          severity: 'medium',
          category: 'container',
          fileName: file.name,
          lineRange: 'Line 1',
          explanation: 'Using floating base image tags introduces unverified OS package updates and larger CVE surface.',
          impact: 'Unpredictable base layer CVEs between builds.',
          snippet: content.split('\n')[0] || 'FROM node:20',
          remediation: 'FROM node:20-alpine@sha256:<verified-digest>',
        });
      }
    }

    if (file.format === 'YAML' || file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
      if (lower.includes('privileged: true')) {
        generated.push({
          id: `dyn-${idx++}`,
          ruleId: 'SS-K8S-001',
          title: 'Privileged container enabled in Kubernetes manifest',
          severity: 'critical',
          category: 'kubernetes',
          fileName: file.name,
          lineRange: `Line ${findLineNumber(content, 'privileged')}`,
          explanation: 'privileged: true disables seccomp/AppArmor isolation and grants root device access.',
          impact: 'Full node compromise risk.',
          snippet: 'securityContext:\n  privileged: true',
          remediation: 'securityContext:\n  privileged: false\n  allowPrivilegeEscalation: false\n  runAsNonRoot: true',
        });
      }
      if (lower.includes(':latest')) {
        generated.push({
          id: `dyn-${idx++}`,
          ruleId: 'SS-K8S-014',
          title: 'Mutable :latest image tag detected',
          severity: 'medium',
          category: 'kubernetes',
          fileName: file.name,
          lineRange: `Line ${findLineNumber(content, ':latest')}`,
          explanation: 'Deployment pulls :latest tag without an immutable version or SHA digest.',
          impact: 'Non-deterministic rollbacks during incident recovery.',
          snippet: getMatchingLine(content, ':latest'),
          remediation: 'Pin image tag to an immutable semantic version and SHA256 digest.',
        });
      }
      if (lower.includes('kind: deployment') && !lower.includes('limits:')) {
        generated.push({
          id: `dyn-${idx++}`,
          ruleId: 'SS-K8S-009',
          title: 'Missing CPU/Memory resource limits on Deployment',
          severity: 'high',
          category: 'kubernetes',
          fileName: file.name,
          lineRange: `Line ${findLineNumber(content, 'resources')}`,
          explanation: 'Containers without memory limits can starve neighboring pods and trigger OOMKilled events.',
          impact: 'High likelihood of CrashLoopBackOff under burst load.',
          snippet: 'resources:\n  requests:\n    memory: "256Mi"',
          remediation: 'resources:\n  limits:\n    memory: "1024Mi"\n    cpu: "1000m"',
        });
      }
      if (lower.includes('secrets.') && lower.includes('echo')) {
        generated.push({
          id: `dyn-${idx++}`,
          ruleId: 'SS-CICD-003',
          title: 'Potential secret exposure in workflow shell step',
          severity: 'critical',
          category: 'cicd',
          fileName: file.name,
          lineRange: `Line ${findLineNumber(content, 'secrets.')}`,
          explanation: 'Printing or interpolating secrets inside raw shell commands risks leaking credentials in runner logs.',
          impact: 'Cloud credentials exposed in CI build artifacts.',
          snippet: getMatchingLine(content, 'secrets.'),
          remediation: 'Use OIDC federation (aws-actions/configure-aws-credentials) instead of static secret echo.',
        });
      }
      if (lower.includes('contents: write')) {
        generated.push({
          id: `dyn-${idx++}`,
          ruleId: 'SS-CICD-007',
          title: 'Over-permissive GITHUB_TOKEN contents: write scope',
          severity: 'medium',
          category: 'cicd',
          fileName: file.name,
          lineRange: `Line ${findLineNumber(content, 'contents: write')}`,
          explanation: 'Deployment workflows should request contents: read unless explicitly pushing commits/releases.',
          impact: 'Expanded blast radius for compromised build steps.',
          snippet: 'permissions:\n  contents: write',
          remediation: 'permissions:\n  contents: read\n  id-token: write',
        });
      }
    }

    if (file.format === 'Terraform' || file.name.endsWith('.tf')) {
      if (content.includes('"*"') && (lower.includes('iam') || lower.includes('action'))) {
        generated.push({
          id: `dyn-${idx++}`,
          ruleId: 'SS-IAM-004',
          title: 'Wildcard IAM policy Resource or Action detected',
          severity: 'critical',
          category: 'iam',
          fileName: file.name,
          lineRange: `Line ${findLineNumber(content, '"*"')}`,
          explanation: 'Terraform IAM statement permits broad wildcard access across AWS resources.',
          impact: 'Violates least-privilege IAM compliance and enables lateral movement.',
          snippet: getMatchingLine(content, 'Resource'),
          remediation: 'Scope Action and Resource ARNs to specific buckets/keys required by the service.',
        });
      }
      if (content.includes('0.0.0.0/0')) {
        generated.push({
          id: `dyn-${idx++}`,
          ruleId: 'SS-IAM-011',
          title: 'Unrestricted 0.0.0.0/0 ingress security group rule',
          severity: 'high',
          category: 'iam',
          fileName: file.name,
          lineRange: `Line ${findLineNumber(content, '0.0.0.0/0')}`,
          explanation: 'Security group rule allows inbound TCP traffic from the entire public internet.',
          impact: 'Exposes internal worker ports directly to automated scanners.',
          snippet: getMatchingLine(content, '0.0.0.0/0'),
          remediation: 'Restrict cidr_blocks to VPC CIDR (10.0.0.0/16) or ALB security group ID.',
        });
      }
    }
  }

  // Fallback generic advisory finding if user uploads a custom valid file with no triggered patterns
  if (generated.length === 0 && files.length > 0) {
    generated.push({
      id: `dyn-${idx++}`,
      ruleId: 'SS-GEN-001',
      title: 'Baseline configuration check passed with minor hardening note',
      severity: 'low',
      category: 'kubernetes',
      fileName: files[0].name,
      lineRange: 'Line 1',
      explanation:
        'No critical misconfigurations matched in local Phase 1A static preview. Recommend adding explicit owner labels and PDB annotations.',
      impact: 'Low operational impact; improves observability attribution.',
      snippet: files[0].content.split('\n').slice(0, 3).join('\n') || '# Checked config',
      remediation: 'Add metadata.labels.team and PodDisruptionBudget before production rollout.',
    });
  }

  return generated;
}

function findLineNumber(content: string, needle: string): number {
  const lines = content.split('\n');
  const idx = lines.findIndex((l) => l.toLowerCase().includes(needle.toLowerCase()));
  return idx >= 0 ? idx + 1 : 1;
}

function getMatchingLine(content: string, needle: string): string {
  const lines = content.split('\n');
  const match = lines.find((l) => l.toLowerCase().includes(needle.toLowerCase()));
  return match ? match.trim() : lines[0] || '';
}

export const INCIDENTS: Incident[] = [
  {
    id: 'INC-2041',
    workspaceId: 'ws-payments-prod',
    title: 'CrashLoopBackOff on payments-settlement-api',
    severity: 'critical',
    affectedService: 'payments-settlement-api',
    namespace: 'payments-prod',
    timestamp: '2026-11-26 22:04 IST',
    duration: '14m ongoing',
    status: 'investigating',
    summary:
      '2 of 3 replicas are restarting every 45 seconds after hitting container memory ceiling during end-of-day NEFT/IMPS batch reconciliation.',
    rootCause: {
      summary:
        'Commit 9f3a21c increased batch chunk size from 500 to 5,000 records in memory while k8s-deployment.yaml lacks an explicit memory limit aligned with JVM/Node heap flags.',
      commitRef: 'payments-settlement-api@9f3a21c',
      confidence: 'High confidence (correlates with Exit Code 137 + OOMKilled events)',
      evidencePoints: [
        'Container settlement-api terminated with Reason: OOMKilled (Exit Code 137) at 22:03:41 IST.',
        'RSS memory spiked from 210MiB to 518MiB within 18 seconds of batch cron trigger.',
        'ShipSafe scan SS-K8S-009 flagged missing memory limits on the same Deployment spec.',
      ],
    },
    timeline: [
      {
        id: 'ev-1',
        timestamp: '21:58:10 IST',
        source: 'ArgoCD',
        title: 'Deployment revision 48 synced',
        detail: 'Rolled out image v2.14.3 (commit 9f3a21c) to payments-prod.',
        level: 'info',
      },
      {
        id: 'ev-2',
        timestamp: '22:01:00 IST',
        source: 'Batch Scheduler',
        title: 'Settlement reconciliation job started',
        detail: 'Loaded 42,800 pending ledger entries into worker queue.',
        level: 'info',
      },
      {
        id: 'ev-3',
        timestamp: '22:03:41 IST',
        source: 'kubelet / ap-south-1b',
        title: 'Pod payments-settlement-api-7f8d9c OOMKilled',
        detail: 'Memory cgroup limit exceeded; kernel killed PID 1 (Exit Code 137).',
        level: 'error',
      },
      {
        id: 'ev-4',
        timestamp: '22:04:19 IST',
        source: 'kube-controller-manager',
        title: 'Back-off restarting failed container',
        detail: 'Entered CrashLoopBackOff (restart count: 4). Alert routed to on-call.',
        level: 'warn',
      },
    ],
    logs: [
      {
        id: 'log-1',
        timestamp: '22:03:12.104',
        level: 'INFO',
        pod: 'payments-settlement-api-7f8d9c',
        message: 'Starting batch reconciliation chunk=5000 tenant=upi-merchant-pool',
      },
      {
        id: 'log-2',
        timestamp: '22:03:29.442',
        level: 'WARN',
        pod: 'payments-settlement-api-7f8d9c',
        message: 'Heap usage at 89% (448MB / 500MB); GC pause 412ms',
      },
      {
        id: 'log-3',
        timestamp: '22:03:40.910',
        level: 'ERROR',
        pod: 'payments-settlement-api-7f8d9c',
        message: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      },
      {
        id: 'log-4',
        timestamp: '22:03:41.003',
        level: 'ERROR',
        pod: 'kubelet-node-04',
        message: 'Container settlement-api terminated with exitCode=137 reason=OOMKilled',
      },
    ],
    recoveryActions: [
      {
        id: 'rec-1',
        title: 'Roll back Deployment to revision 47 (safe immediate mitigation)',
        rationale: 'Restores chunk size=500 baseline image v2.14.2 with zero schema changes.',
        riskLevel: 'safe',
        command: 'kubectl rollout undo deployment/payments-settlement-api -n payments-prod --to-revision=47',
      },
      {
        id: 'rec-2',
        title: 'Patch container memory limit and Node max-old-space-size',
        rationale: 'Prevents unbounded allocation and aligns V8 heap with cgroup limits.',
        riskLevel: 'verify',
        command:
          'kubectl set resources deployment/payments-settlement-api -n payments-prod --limits=memory=1024Mi,cpu=1000m --requests=memory=512Mi,cpu=250m',
      },
    ],
  },
  {
    id: 'INC-2039',
    workspaceId: 'ws-payments-prod',
    title: 'EKS Node Group Memory Pressure in ap-south-1b',
    severity: 'high',
    affectedService: 'ledger-worker',
    namespace: 'payments-prod',
    timestamp: '2026-11-26 21:41 IST',
    duration: '37m',
    status: 'mitigated',
    summary:
      'Worker node ip-10-24-18-92 reported MemoryPressure=True, pausing ArgoCD canary rollout at 25% weight.',
    rootCause: {
      summary:
        'Concurrent log-shipping DaemonSet spike combined with unthrottled ledger-worker canary pods pushed node allocatable memory above 92%.',
      commitRef: 'ledger-worker@v2.14.3-rc1',
      confidence: 'High confidence (kubelet NodeCondition MemoryPressure)',
      evidencePoints: [
        'NodeCondition MemoryPressure transitioned to True at 21:39 IST.',
        'Argo Rollouts paused canary progression automatically on Prometheus memory alert.',
      ],
    },
    timeline: [
      {
        id: 'ev-21',
        timestamp: '21:39:02 IST',
        source: 'kubelet',
        title: 'Node MemoryPressure=True',
        detail: 'Available memory dropped below 350Mi eviction threshold.',
        level: 'warn',
      },
      {
        id: 'ev-22',
        timestamp: '21:41:15 IST',
        source: 'Argo Rollouts',
        title: 'Canary rollout automatically paused',
        detail: 'AnalysisRun failed on node_memory_pressure metric.',
        level: 'info',
      },
      {
        id: 'ev-23',
        timestamp: '21:46:30 IST',
        source: 'Cluster Autoscaler',
        title: 'Provisioned m6i.xlarge replacement node',
        detail: 'New capacity joined ap-south-1b; pressure cleared.',
        level: 'resolved',
      },
    ],
    logs: [
      {
        id: 'log-21',
        timestamp: '21:39:02.118',
        level: 'WARN',
        pod: 'kubelet-ip-10-24-18-92',
        message: 'Attempting to reclaim memory; available=312Mi threshold=350Mi',
      },
      {
        id: 'log-22',
        timestamp: '21:41:15.004',
        level: 'INFO',
        pod: 'argo-rollouts-controller',
        message: 'Pausing rollout ledger-worker due to failed AnalysisTemplate check',
      },
    ],
    recoveryActions: [
      {
        id: 'rec-21',
        title: 'Verify node allocatable headroom before resuming canary',
        rationale: 'Confirms DaemonSet and pod requests fit comfortably across AZs.',
        riskLevel: 'safe',
        command: 'kubectl describe nodes -l topology.kubernetes.io/zone=ap-south-1b | grep -A 6 "Allocated resources"',
      },
    ],
  },
  {
    id: 'INC-2036',
    workspaceId: 'ws-checkout-stg',
    title: 'Terraform IAM Policy Gate Blocked Staging Apply',
    severity: 'high',
    affectedService: 'checkout-infra-tf',
    namespace: 'checkout-staging',
    timestamp: '2026-11-26 22:01 IST',
    duration: '9m',
    status: 'investigating',
    summary:
      'CI pipeline #812 halted before terraform apply after ShipSafe detected wildcard IAM and 0.0.0.0/0 ingress rules.',
    rootCause: {
      summary: 'New EKS node group module introduced wildcard s3:* / kms:* permissions and open TCP ingress.',
      commitRef: 'checkout-infra-tf@e71d940',
      confidence: 'Confirmed by static policy inspection',
      evidencePoints: [
        'eks-iam.tf line 8 defines Resource = "*" with Action = ["s3:*", "kms:*"].',
        'eks-iam.tf line 18 allows 0.0.0.0/0 across ports 0–65535.',
      ],
    },
    timeline: [
      {
        id: 'ev-31',
        timestamp: '22:00:44 IST',
        source: 'GitHub Actions',
        title: 'Terraform plan generated (4 to add, 1 to change)',
        detail: 'Triggered on push to staging branch.',
        level: 'info',
      },
      {
        id: 'ev-32',
        timestamp: '22:01:02 IST',
        source: 'ShipSafe Policy Gate',
        title: 'Pipeline blocked: 2 Critical / 1 High findings',
        detail: 'Wildcard IAM policy and unrestricted ingress SG rule detected.',
        level: 'error',
      },
    ],
    logs: [
      {
        id: 'log-31',
        timestamp: '22:01:02.310',
        level: 'ERROR',
        pod: 'ci-runner-ubuntu-812',
        message: 'Policy violation SS-IAM-004: Resource="*" not permitted for kms:* actions',
      },
    ],
    recoveryActions: [
      {
        id: 'rec-31',
        title: 'Scope Terraform IAM policy and restrict ingress CIDR',
        rationale: 'Replaces wildcard permissions with bucket-scoped ARNs.',
        riskLevel: 'safe',
        command: 'terraform plan -var-file=staging.tfvars -out=tfplan.safe',
      },
    ],
  },
  {
    id: 'INC-2032',
    workspaceId: 'ws-upi-core',
    title: 'Elevated TLS Handshake Latency on upi-edge-ingress',
    severity: 'medium',
    affectedService: 'upi-edge-ingress',
    namespace: 'upi-core',
    timestamp: '2026-11-26 18:15 IST',
    duration: '22m',
    status: 'resolved',
    summary:
      'P99 TLS handshake latency rose from 14ms to 190ms due to OCSP stapling cache miss after cert-manager rotation.',
    rootCause: {
      summary: 'Envoy ingress pods did not reload OCSP staple response cache cleanly on intermediate CA update.',
      commitRef: 'upi-edge-ingress@b41c22d',
      confidence: 'Resolved and verified post-reload',
      evidencePoints: ['P99 latency normalized to 13.8ms immediately after rolling restart of ingress pods.'],
    },
    timeline: [
      {
        id: 'ev-41',
        timestamp: '18:15:00 IST',
        source: 'Prometheus Alertmanager',
        title: 'TLS handshake P99 > 150ms',
        detail: 'Observed across ap-south-2 edge ingress listeners.',
        level: 'warn',
      },
      {
        id: 'ev-42',
        timestamp: '18:37:12 IST',
        source: 'On-Call SRE',
        title: 'Graceful ingress reload restored OCSP stapling',
        detail: 'Latency returned to 13.8ms baseline.',
        level: 'resolved',
      },
    ],
    logs: [
      {
        id: 'log-41',
        timestamp: '18:16:04.220',
        level: 'WARN',
        pod: 'upi-edge-ingress-envoy-02',
        message: 'OCSP response stale; falling back to upstream responder',
      },
    ],
    recoveryActions: [
      {
        id: 'rec-41',
        title: 'Verify OCSP staple status on edge endpoints',
        rationale: 'Confirms zero upstream OCSP latency spikes.',
        riskLevel: 'safe',
        command: 'kubectl rollout status deployment/upi-edge-ingress -n upi-core',
      },
    ],
  },
];

export const EVIDENCE_ITEMS: Record<string, EvidenceItem> = {
  'ev-k8s-oom': {
    id: 'ev-k8s-oom',
    type: 'k8s_event',
    title: 'Pod Terminated: OOMKilled (Exit Code 137)',
    source: 'payments-prod / payments-settlement-api-7f8d9c',
    timestamp: '22:03:41 IST',
    severity: 'critical',
    detail: 'Container exceeded cgroup memory threshold during 5,000-record batch load; restarted 4 times.',
  },
  'ev-scan-limits': {
    id: 'ev-scan-limits',
    type: 'scan_finding',
    title: 'SS-K8S-009: Missing resources.limits.memory',
    source: 'k8s-deployment.yaml (Line 18–21)',
    timestamp: '21:56:10 IST',
    severity: 'high',
    detail: 'Manifest declares memory request 256Mi without upper memory limit or Node heap cap.',
  },
  'ev-log-heap': {
    id: 'ev-log-heap',
    type: 'log_excerpt',
    title: 'JavaScript heap out of memory',
    source: 'payments-settlement-api logs',
    timestamp: '22:03:40 IST',
    severity: 'critical',
    detail: 'Heap usage reached 89% with 412ms GC pauses immediately before kernel SIGKILL.',
  },
  'ev-scan-iam': {
    id: 'ev-scan-iam',
    type: 'scan_finding',
    title: 'SS-IAM-004: Wildcard IAM Actions (s3:*, kms:*)',
    source: 'eks-iam.tf (Line 7–11)',
    timestamp: '22:01:02 IST',
    severity: 'critical',
    detail: 'Worker role permits full S3 and KMS operations across Resource="*".',
  },
  'ev-scan-priv': {
    id: 'ev-scan-priv',
    type: 'scan_finding',
    title: 'SS-K8S-001: Privileged Container Flag',
    source: 'k8s-deployment.yaml (Line 14–15)',
    timestamp: '21:56:10 IST',
    severity: 'critical',
    detail: 'securityContext.privileged: true disables container isolation boundaries.',
  },
  'ev-cost-nodes': {
    id: 'ev-cost-nodes',
    type: 'metric',
    title: 'Cluster CPU Utilization: 21% Average',
    source: 'eks-payments-prod-01 (12x m6i.xlarge)',
    timestamp: 'Last 7 days',
    severity: 'medium',
    detail: 'Over-provisioned on-demand worker nodes during off-peak hours (01:00–07:00 IST).',
  },
};

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-welcome',
    role: 'assistant',
    timestamp: '22:05 IST',
    content:
      'Workspace context loaded for payments-prod (eks-payments-prod-01). Select a prompt below or ask about active incidents, CrashLoopBackOff diagnostics, ShipSafe findings, or cluster cost optimization.',
  },
];

export const SUGGESTED_PROMPTS = [
  {
    id: 'prompt-fail',
    label: 'Why is my Kubernetes deployment failing?',
    hint: 'Correlates INC-2041 pod restarts & OOM events',
  },
  {
    id: 'prompt-risks',
    label: 'Analyze my recent deployment risks.',
    hint: 'Summarizes critical ShipSafe findings',
  },
  {
    id: 'prompt-crash',
    label: 'Explain CrashLoopBackOff.',
    hint: 'Diagnostics checklist & exit code guide',
  },
  {
    id: 'prompt-cost',
    label: 'How can I reduce cloud infrastructure costs?',
    hint: 'Right-sizing & spot capacity recommendations',
  },
];

export function generateMockAssistantResponse(query: string): Omit<ChatMessage, 'id' | 'role' | 'timestamp'> {
  const q = query.toLowerCase();

  if (q.includes('fail') || q.includes('payments-settlement') || q.includes('inc-2041')) {
    return {
      content: 'Your Kubernetes deployment payments-settlement-api is failing due to repeated OOMKilled terminations.',
      structured: {
        summary:
          '2 of 3 replicas in payments-prod are entering CrashLoopBackOff with Exit Code 137 (OOMKilled) after deployment revision 48 (commit 9f3a21c) increased batch memory usage.',
        causes: [
          'Batch reconciliation chunk size increased 10x (500 to 5,000 records), driving RSS memory past 512MiB.',
          'k8s-deployment.yaml specifies a 256Mi memory request without an explicit memory limit or --max-old-space-size cap.',
        ],
        remediationSteps: [
          {
            step: 'Roll back immediately to revision 47 to restore stable batch memory footprint.',
            command: 'kubectl rollout undo deployment/payments-settlement-api -n payments-prod --to-revision=47',
          },
          {
            step: 'Add explicit memory requests (512Mi) and limits (1024Mi) before re-deploying revision 48.',
            command:
              'kubectl set resources deployment/payments-settlement-api -n payments-prod --limits=memory=1024Mi --requests=memory=512Mi',
          },
        ],
        safetyNote: 'Safe recovery: rollback preserves all committed ledger rows and avoids ungraceful mid-batch kills.',
      },
      evidenceIds: ['ev-k8s-oom', 'ev-log-heap', 'ev-scan-limits'],
    };
  }

  if (q.includes('risk') || q.includes('shipsafe') || q.includes('privileged') || q.includes('iam')) {
    return {
      content: 'Your latest ShipSafe scans show 2 critical and 4 high-severity risks across Kubernetes and Terraform.',
      structured: {
        summary:
          'The highest-impact risks are privileged container execution in k8s-deployment.yaml and wildcard IAM permissions in eks-iam.tf.',
        causes: [
          'SS-K8S-001 (Critical): securityContext.privileged: true in payments-settlement-api allows host-level escape.',
          'SS-IAM-004 (Critical): eks_worker_custom IAM policy grants s3:* and kms:* on Resource="*".',
          'SS-CNT-002 (High): Dockerfile runs as root without a dedicated non-root USER.',
        ],
        remediationSteps: [
          {
            step: 'Set privileged: false, allowPrivilegeEscalation: false, and runAsNonRoot: true in pod securityContext.',
          },
          {
            step: 'Replace wildcard IAM Resource="*" with explicit S3 bucket and KMS key ARNs in eks-iam.tf.',
          },
        ],
        safetyNote: 'Verify IAM action list against CloudTrail read-only logs before applying in production.',
      },
      evidenceIds: ['ev-scan-priv', 'ev-scan-iam', 'ev-scan-limits'],
    };
  }

  if (q.includes('crashloop') || q.includes('oom') || q.includes('137')) {
    return {
      content: 'CrashLoopBackOff means Kubernetes started a container, it exited repeatedly, and kubelet is applying exponential backoff.',
      structured: {
        summary:
          'CrashLoopBackOff is a symptom rather than the root error. Inspecting the Last State termination reason and exit code reveals whether the crash is OOMKilled (137), an application panic (1), or a failing readiness/liveness probe.',
        causes: [
          'Exit Code 137 (SIGKILL): Container exceeded cgroup memory limit or was killed by node OOM killer.',
          'Exit Code 1: Unhandled application exception, missing environment variable, or bad database connection string.',
          'Probe Timeout: Slow startup triggers livenessProbe failure before the HTTP server binds.',
        ],
        remediationSteps: [
          {
            step: 'Inspect previous container logs and pod events to isolate the exact exit code.',
            command: 'kubectl logs <pod-name> -n payments-prod --previous --tail=100',
          },
          {
            step: 'Check pod termination reason and restart count.',
            command: 'kubectl describe pod <pod-name> -n payments-prod',
          },
        ],
        safetyNote: 'Read-only diagnostic commands; safe to run directly against production clusters.',
      },
      evidenceIds: ['ev-k8s-oom', 'ev-log-heap'],
    };
  }

  if (q.includes('cost') || q.includes('reduce') || q.includes('spend') || q.includes('bill')) {
    return {
      content: 'Cluster telemetry shows ~34% potential monthly savings in eks-payments-prod-01 without impacting SLOs.',
      structured: {
        summary:
          'Average CPU utilization across your 12 m6i.xlarge nodes sits at 21%, with predictable off-peak troughs between 01:00 and 07:00 IST.',
        causes: [
          'Stateless API deployments request 2–3x more CPU than P95 actual consumption.',
          'Non-critical batch and staging workloads run on 100% On-Demand instances instead of Spot capacity.',
        ],
        remediationSteps: [
          {
            step: 'Enable Karpenter or Cluster Autoscaler consolidation with right-sized pod CPU requests.',
          },
          {
            step: 'Move checkout-staging and async reconciliation jobs onto EC2 Spot node groups with On-Demand fallback.',
          },
        ],
        safetyNote: 'Keep core synchronous payment gateways on On-Demand / Savings Plan nodes to protect P99 latency.',
      },
      evidenceIds: ['ev-cost-nodes', 'ev-scan-limits'],
    };
  }

  return {
    content: `Analyzed workspace context for "${query}". Here is a grounded summary based on sample Phase 1A telemetry.`,
    structured: {
      summary:
        'payments-prod currently has 1 active investigating incident (INC-2041) and 2 critical ShipSafe configuration findings ready for remediation.',
      causes: [
        'Primary operational blocker: payments-settlement-api memory spikes hitting OOMKilled.',
        'Primary pre-deploy blocker: privileged securityContext and wildcard IAM permissions in staging Terraform.',
      ],
      remediationSteps: [
        {
          step: 'Review INC-2041 logs and execute the safe revision 47 rollback if batch latency continues.',
          command: 'kubectl get events -n payments-prod --sort-by=.lastTimestamp',
        },
        {
          step: 'Inspect the latest findings inside ShipSafe before approving pending PRs.',
        },
      ],
      safetyNote: 'Phase 1A uses simulated workspace evidence; live Gemini + cluster API queries arrive in Phase 2.',
    },
    evidenceIds: ['ev-k8s-oom', 'ev-scan-priv'],
  };
}

export const SCAN_HISTORY_RECORDS: ScanHistoryRecord[] = [
  {
    id: 'scan-908',
    workspaceId: 'ws-checkout-stg',
    repository: 'acme-fin/checkout-infra-tf',
    branch: 'feat/eks-worker-iam',
    commitSha: 'e71d940',
    fileTypes: ['Terraform'],
    scannedAt: '2026-11-26 22:01 IST',
    duration: '4.1s',
    riskScore: 76,
    findings: { critical: 2, high: 2, medium: 1, low: 0 },
    status: 'blocked',
    triggeredBy: 'CI Pipeline #812',
  },
  {
    id: 'scan-907',
    workspaceId: 'ws-payments-prod',
    repository: 'acme-fin/payments-settlement-api',
    branch: 'main',
    commitSha: '9f3a21c',
    fileTypes: ['YAML', 'Dockerfile'],
    scannedAt: '2026-11-26 21:56 IST',
    duration: '3.2s',
    riskScore: 52,
    findings: { critical: 1, high: 2, medium: 2, low: 1 },
    status: 'needs_review',
    triggeredBy: 'GitHub Actions',
  },
  {
    id: 'scan-906',
    workspaceId: 'ws-upi-core',
    repository: 'acme-fin/upi-switch-router',
    branch: 'main',
    commitSha: '4c81e0b',
    fileTypes: ['YAML', 'Dockerfile'],
    scannedAt: '2026-11-26 20:44 IST',
    duration: '2.8s',
    riskScore: 19,
    findings: { critical: 0, high: 0, medium: 2, low: 3 },
    status: 'passed',
    triggeredBy: 'ArgoCD PreSync',
  },
  {
    id: 'scan-905',
    workspaceId: 'ws-payments-prod',
    repository: 'acme-fin/fraud-scoring-svc',
    branch: 'release/v1.9',
    commitSha: '12a8bc4',
    fileTypes: ['Dockerfile', 'GitHub Actions'],
    scannedAt: '2026-11-26 20:18 IST',
    duration: '2.4s',
    riskScore: 14,
    findings: { critical: 0, high: 0, medium: 1, low: 2 },
    status: 'passed',
    triggeredBy: 'Rohan Kulkarni',
  },
  {
    id: 'scan-904',
    workspaceId: 'ws-payments-prod',
    repository: 'acme-fin/ledger-worker',
    branch: 'canary/v2.14.3',
    commitSha: '77d0a3e',
    fileTypes: ['YAML'],
    scannedAt: '2026-11-26 19:30 IST',
    duration: '1.9s',
    riskScore: 41,
    findings: { critical: 0, high: 2, medium: 3, low: 1 },
    status: 'needs_review',
    triggeredBy: 'GitHub Actions',
  },
  {
    id: 'scan-903',
    workspaceId: 'ws-upi-core',
    repository: 'acme-fin/upi-edge-ingress',
    branch: 'main',
    commitSha: 'b41c22d',
    fileTypes: ['YAML', 'Terraform'],
    scannedAt: '2026-11-26 17:12 IST',
    duration: '3.7s',
    riskScore: 22,
    findings: { critical: 0, high: 1, medium: 1, low: 2 },
    status: 'passed',
    triggeredBy: 'Ananya Iyer',
  },
  {
    id: 'scan-902',
    workspaceId: 'ws-checkout-stg',
    repository: 'acme-fin/cart-session-redis',
    branch: 'fix/persistence',
    commitSha: '3a90f12',
    fileTypes: ['YAML', 'Dockerfile'],
    scannedAt: '2026-11-25 23:40 IST',
    duration: '2.6s',
    riskScore: 29,
    findings: { critical: 0, high: 1, medium: 2, low: 1 },
    status: 'passed',
    triggeredBy: 'CI Pipeline #809',
  },
  {
    id: 'scan-901',
    workspaceId: 'ws-payments-prod',
    repository: 'acme-fin/kyc-webhook-relay',
    branch: 'feat/mtls',
    commitSha: '65c19e4',
    fileTypes: ['Terraform', 'GitHub Actions'],
    scannedAt: '2026-11-25 18:05 IST',
    duration: '3.5s',
    riskScore: 68,
    findings: { critical: 1, high: 3, medium: 2, low: 0 },
    status: 'blocked',
    triggeredBy: 'Shaik Davudh',
  },
];
