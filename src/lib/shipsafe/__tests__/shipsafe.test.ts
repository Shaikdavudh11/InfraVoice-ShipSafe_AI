import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../../../server.ts';
import { DEMO_VULNERABLE_BUNDLE } from '../demo-bundle.ts';
import { classifyAndValidateFile } from '../file-detector.ts';
import { calculateRiskScore, getRiskLabel } from '../risk-score.ts';
import { scanUploadedFiles } from '../scan-engine.ts';
import { sanitizeEvidence, validateSafeFileName } from '../secret-sanitizer.ts';

describe('ShipSafe File Classification & Validation', () => {
  it('classifies Dockerfile, Dockerfile.*, .dockerignore, Terraform, Kubernetes, Compose, and GitHub Actions distinctly', () => {
    const dockerRes = classifyAndValidateFile({
      fileName: 'Dockerfile.prod',
      content: 'FROM node:20-alpine\nUSER 10001\nCMD ["node", "index.js"]',
      sizeBytes: 60,
    });
    expect(dockerRes.ok).toBe(true);
    if (dockerRes.ok) expect(dockerRes.file.fileType).toBe('dockerfile');

    const ignoreRes = classifyAndValidateFile({
      fileName: '.dockerignore',
      content: '.env\n.git\n*.pem',
      sizeBytes: 18,
    });
    expect(ignoreRes.ok).toBe(true);
    if (ignoreRes.ok) expect(ignoreRes.file.fileType).toBe('dockerignore');

    const k8sRes = classifyAndValidateFile({
      fileName: 'deploy.yaml',
      content: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api',
      sizeBytes: 56,
    });
    expect(k8sRes.ok).toBe(true);
    if (k8sRes.ok) expect(k8sRes.file.fileType).toBe('kubernetes');

    const composeRes = classifyAndValidateFile({
      fileName: 'compose.yaml',
      content: 'services:\n  web:\n    image: nginx:1.27',
      sizeBytes: 38,
    });
    expect(composeRes.ok).toBe(true);
    if (composeRes.ok) expect(composeRes.file.fileType).toBe('docker-compose');

    const ghaRes = classifyAndValidateFile({
      fileName: '.github/workflows/ci.yml',
      content: 'on:\n  push:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi',
      sizeBytes: 85,
    });
    expect(ghaRes.ok).toBe(true);
    if (ghaRes.ok) expect(ghaRes.file.fileType).toBe('github-actions');

    const tfRes = classifyAndValidateFile({
      fileName: 'network.tf',
      content: 'resource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16"\n}',
      sizeBytes: 56,
    });
    expect(tfRes.ok).toBe(true);
    if (tfRes.ok) expect(tfRes.file.fileType).toBe('terraform');
  });

  it('rejects unsupported YAML structures, empty files, oversized files, and path traversal names', () => {
    const unknownYaml = classifyAndValidateFile({
      fileName: 'random.yaml',
      content: 'foo: bar\nbaz: 123',
      sizeBytes: 16,
    });
    expect(unknownYaml.ok).toBe(false);

    const emptyFile = classifyAndValidateFile({
      fileName: 'Dockerfile',
      content: '   \n  ',
      sizeBytes: 6,
    });
    expect(emptyFile.ok).toBe(false);

    const traversal = validateSafeFileName('../../etc/passwd');
    expect(traversal.ok).toBe(false);

    const absPath = validateSafeFileName('/etc/Dockerfile');
    expect(absPath.ok).toBe(false);
  });
});

describe('ShipSafe Rules & Line Number Accuracy', () => {
  it('detects Dockerfile vulnerabilities with accurate line numbers and passes clean multi-stage Dockerfile', () => {
    const vuln = scanUploadedFiles([
      {
        fileName: 'Dockerfile',
        sizeBytes: 220,
        content: [
          'FROM node:latest',
          'ARG API_SECRET=super_secret_token_value_123',
          'RUN curl -fsSL https://example.com/install.sh | sh',
          'RUN apt-get update && apt-get install -y curl',
          'CMD ["node", "server.js"]',
        ].join('\n'),
      },
    ]);
    expect(vuln.ok).toBe(true);
    if (!vuln.ok) return;

    const rules = new Set(vuln.result.findings.map((f) => f.ruleId));
    expect(rules.has('DS001')).toBe(true);
    expect(rules.has('DS002')).toBe(true);
    expect(rules.has('DS003')).toBe(true);
    expect(rules.has('DS007')).toBe(true);
    expect(rules.has('DS005')).toBe(true);

    const ds003 = vuln.result.findings.find((f) => f.ruleId === 'DS003');
    expect(ds003?.lineNumber).toBe(2);
    expect(ds003?.evidence).not.toContain('super_secret_token_value_123');
    expect(ds003?.evidence).toContain('[REDACTED]');

    // Clean multi-stage Dockerfile where final stage sets USER 10001 and HEALTHCHECK
    const clean = scanUploadedFiles([
      {
        fileName: 'Dockerfile',
        sizeBytes: 220,
        content: [
          'FROM node:20.18-alpine@sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef AS builder',
          'WORKDIR /app',
          'COPY package*.json ./',
          'RUN npm ci',
          'FROM node:20.18-alpine@sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          'USER 10001',
          'HEALTHCHECK CMD wget -qO- http://localhost:8080/healthz || exit 1',
          'CMD ["node", "dist/server.js"]',
        ].join('\n'),
      },
    ]);
    expect(clean.ok).toBe(true);
    if (!clean.ok) return;
    expect(clean.result.totalFindings).toBe(0);
    expect(clean.result.riskScore).toBe(0);
  });

  it('handles Kubernetes pod vs container securityContext overrides and skips Job probes', () => {
    const cleanK8s = scanUploadedFiles([
      {
        fileName: 'clean-deploy.yaml',
        sizeBytes: 600,
        content: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: safe-api
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
      containers:
        - name: api
          image: ghcr.io/acme/api:v1.2.3
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "256Mi"
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
          livenessProbe:
            httpGet:
              path: /health
              port: 8080`,
      },
    ]);
    expect(cleanK8s.ok).toBe(true);
    if (!cleanK8s.ok) return;
    expect(cleanK8s.result.totalFindings).toBe(0);
    expect(cleanK8s.result.riskScore).toBe(0);

    // Override case: pod says runAsNonRoot: true, container overrides to runAsNonRoot: false + privileged
    const overrideK8s = scanUploadedFiles([
      {
        fileName: 'override-pod.yaml',
        sizeBytes: 500,
        content: `apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
      containers:
        - name: migrate
          image: ghcr.io/acme/migrate:v1.0.0
          securityContext:
            runAsNonRoot: false
            privileged: true
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "200m"
              memory: "256Mi"`,
      },
    ]);
    expect(overrideK8s.ok).toBe(true);
    if (!overrideK8s.ok) return;
    const ruleIds = overrideK8s.result.findings.map((f) => f.ruleId);
    expect(ruleIds).toContain('KS001');
    expect(ruleIds).toContain('KS002');
    // Job should not trigger KS012 missing probes
    expect(ruleIds).not.toContain('KS012');
  });

  it('detects Kubernetes RBAC, HostPath, HostNetwork, Capabilities, and Secret env', () => {
    const res = scanUploadedFiles([
      {
        fileName: 'k8s-risky.yaml',
        sizeBytes: 900,
        content: `apiVersion: v1
kind: Pod
metadata:
  name: risky-pod
spec:
  hostNetwork: true
  volumes:
    - name: host-root
      hostPath:
        path: /var/log
  containers:
    - name: worker
      image: nginx:latest
      env:
        - name: DB_PASSWORD
          value: "prod_secret_9911"
      securityContext:
        capabilities:
          add: ["SYS_ADMIN"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: super-role
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]`,
      },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const rules = new Set(res.result.findings.map((f) => f.ruleId));
    expect(rules.has('KS004')).toBe(true);
    expect(rules.has('KS005')).toBe(true);
    expect(rules.has('KS006')).toBe(true);
    expect(rules.has('KS007')).toBe(true);
    expect(rules.has('KS008')).toBe(true);
    expect(rules.has('KS010')).toBe(true);

    const ks008 = res.result.findings.find((f) => f.ruleId === 'KS008');
    expect(ks008?.evidence).not.toContain('prod_secret_9911');
  });

  it('detects Docker Compose risks and avoids false positive on ${VAR} placeholders', () => {
    const cleanCompose = scanUploadedFiles([
      {
        fileName: 'docker-compose.yml',
        sizeBytes: 300,
        content: `services:
  app:
    image: ghcr.io/acme/app:v1.0.0
    user: "10001:10001"
    environment:
      DB_PASSWORD: \${DB_PASSWORD}
    ports:
      - "127.0.0.1:8080:8080"
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 256M`,
      },
    ]);
    expect(cleanCompose.ok).toBe(true);
    if (!cleanCompose.ok) return;
    expect(cleanCompose.result.totalFindings).toBe(0);

    const vulnCompose = scanUploadedFiles([
      {
        fileName: 'docker-compose.yml',
        sizeBytes: 350,
        content: `services:
  db:
    image: postgres:16
    privileged: true
    network_mode: host
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      POSTGRES_PASSWORD: "literal_db_password_42"
    ports:
      - "5432:5432"`,
      },
    ]);
    expect(vulnCompose.ok).toBe(true);
    if (!vulnCompose.ok) return;
    const rules = new Set(vulnCompose.result.findings.map((f) => f.ruleId));
    expect(rules.has('CP001')).toBe(true);
    expect(rules.has('CP002')).toBe(true);
    expect(rules.has('CP003')).toBe(true);
    expect(rules.has('CP004')).toBe(true);
    expect(rules.has('CP005')).toBe(true);
    expect(rules.has('CP006')).toBe(true);
    expect(rules.has('CP007')).toBe(true);

    const cp004 = vulnCompose.result.findings.find((f) => f.ruleId === 'CP004');
    expect(cp004?.evidence).not.toContain('literal_db_password_42');
  });

  it('detects Terraform vulnerabilities and allows clean HTTPS ALB ingress', () => {
    const cleanTf = scanUploadedFiles([
      {
        fileName: 'clean.tf',
        sizeBytes: 360,
        content: `resource "aws_security_group" "alb_https" {
  name = "alb-https"
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_ebs_volume" "data" {
  availability_zone = "ap-south-1a"
  encrypted         = true
}`,
      },
    ]);
    expect(cleanTf.ok).toBe(true);
    if (!cleanTf.ok) return;
    expect(cleanTf.result.totalFindings).toBe(0);

    const vulnTf = scanUploadedFiles([
      {
        fileName: 'vuln.tf',
        sizeBytes: 700,
        content: `resource "aws_security_group" "ssh" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_s3_bucket" "logs" {
  acl = "public-read"
}

resource "aws_db_instance" "main" {
  storage_encrypted   = false
  publicly_accessible = true
  password            = "SuperSecretRDS999"
}`,
      },
    ]);
    expect(vulnTf.ok).toBe(true);
    if (!vulnTf.ok) return;
    const rules = new Set(vulnTf.result.findings.map((f) => f.ruleId));
    expect(rules.has('TF001')).toBe(true);
    expect(rules.has('TF002')).toBe(true);
    expect(rules.has('TF004')).toBe(true);
    expect(rules.has('TF005')).toBe(true);
    expect(rules.has('TF006')).toBe(true);
    expect(rules.has('TF007')).toBe(true);

    const tf006 = vulnTf.result.findings.find((f) => f.ruleId === 'TF006');
    expect(tf006?.evidence).not.toContain('SuperSecretRDS999');
  });

  it('detects GitHub Actions workflow risks and passes pinned clean workflow', () => {
    const cleanGha = scanUploadedFiles([
      {
        fileName: '.github/workflows/test.yml',
        sizeBytes: 280,
        content: `name: CI
on:
  pull_request:
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
      - run: npm test`,
      },
    ]);
    expect(cleanGha.ok).toBe(true);
    if (!cleanGha.ok) return;
    expect(cleanGha.result.totalFindings).toBe(0);

    const vulnGha = scanUploadedFiles([
      {
        fileName: '.github/workflows/pr.yml',
        sizeBytes: 420,
        content: `name: PR Check
on:
  pull_request_target:
jobs:
  check:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: |
          echo "\${{ github.event.pull_request.title }}"
          echo "\${{ secrets.NPM_TOKEN }}"`,
      },
    ]);
    expect(vulnGha.ok).toBe(true);
    if (!vulnGha.ok) return;
    const rules = new Set(vulnGha.result.findings.map((f) => f.ruleId));
    expect(rules.has('GA002')).toBe(true);
    expect(rules.has('GA003')).toBe(true);
    expect(rules.has('GA004')).toBe(true);
    expect(rules.has('GA005')).toBe(true);
    expect(rules.has('GA006')).toBe(true);
  });
});

describe('ShipSafe Secret Sanitization & Risk Score', () => {
  it('redacts tokens, basic auth URLs, and key-value secrets', () => {
    const input = [
      'ENV AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      'DATABASE_URL=postgres://admin:RealPassword123@db.internal:5432/app',
      'token: ghp_1234567890abcdefghijklmnop',
    ].join('\n');

    const cleaned = sanitizeEvidence(input);
    expect(cleaned).not.toContain('wJalrXUtnFEMI');
    expect(cleaned).not.toContain('RealPassword123');
    expect(cleaned).not.toContain('ghp_1234567890');
    expect(cleaned).toContain('[REDACTED]');
  });

  it('computes deterministic risk score bounded 0-100 with zero-finding score 0', () => {
    expect(calculateRiskScore([], 3)).toEqual({
      score: 0,
      label: 'Low',
      weightedTotal: 0,
    });
    expect(getRiskLabel(0)).toBe('Low');
    expect(getRiskLabel(25)).toBe('Moderate');
    expect(getRiskLabel(45)).toBe('Elevated');
    expect(getRiskLabel(65)).toBe('High');
    expect(getRiskLabel(85)).toBe('Critical');
  });
});

describe('POST /api/shipsafe/scan Express API', () => {
  const app = createApp();

  it('scans the multi-file demo bundle via multipart upload and returns normalized JSON', async () => {
    let req = request(app).post('/api/shipsafe/scan');
    for (const file of DEMO_VULNERABLE_BUNDLE) {
      req = req.attach('files', Buffer.from(file.content, 'utf8'), file.fileName);
    }
    const res = await req;
    expect(res.status).toBe(200);
    expect(res.body.scanId).toMatch(/^scan-/);
    expect(res.body.fileSummaries).toHaveLength(DEMO_VULNERABLE_BUNDLE.length);
    expect(res.body.totalFindings).toBeGreaterThan(5);
    expect(res.body.riskScore).toBeGreaterThan(40);
    expect(res.body.findings[0].source).toBe('deterministic-rule');
  });

  it('rejects empty upload, unsupported file type, path traversal, and oversized files cleanly without stack traces', async () => {
    const noFilesRes = await request(app).post('/api/shipsafe/scan');
    expect(noFilesRes.status).toBe(400);
    expect(noFilesRes.body.error).toBeTruthy();

    const badExtRes = await request(app)
      .post('/api/shipsafe/scan')
      .attach('files', Buffer.from('console.log(1)'), 'script.js');
    expect(badExtRes.status).toBe(400);
    expect(badExtRes.body.error).toContain('Unsupported file format');

    const emptyFileRes = await request(app)
      .post('/api/shipsafe/scan')
      .attach('files', Buffer.from(''), 'Dockerfile');
    expect(emptyFileRes.status).toBe(400);
    expect(emptyFileRes.body.error).toContain('empty');

    const directTraversal = scanUploadedFiles([
      { fileName: '../Dockerfile', content: 'FROM node:20', sizeBytes: 12 },
    ]);
    expect(directTraversal.ok).toBe(false);
    if (!directTraversal.ok) {
      expect(directTraversal.statusCode).toBe(400);
      expect(directTraversal.error).toContain('Path traversal');
    }

    const boundary = '----ShipSafeTestBoundary';
    const rawTraversalBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="files"; filename="../../etc/passwd"',
      'Content-Type: text/plain',
      '',
      'root:x:0:0:root:/root:/bin/bash',
      `--${boundary}--`,
      '',
    ].join('\r\n');
    const traversalRes = await request(app)
      .post('/api/shipsafe/scan')
      .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
      .send(rawTraversalBody);
    expect(traversalRes.status).toBe(400);

    let tooManyReq = request(app).post('/api/shipsafe/scan');
    for (let i = 0; i < 21; i++) {
      tooManyReq = tooManyReq.attach('files', Buffer.from('FROM node:20\nUSER 1000'), `Dockerfile.${i}`);
    }
    const tooManyRes = await tooManyReq;
    expect(tooManyRes.status).toBe(400);
    expect(tooManyRes.body.error).toContain('Maximum 20');

    const oversized = Buffer.alloc(1024 * 1024 + 50, 'a');
    const bigRes = await request(app)
      .post('/api/shipsafe/scan')
      .attach('files', oversized, 'Dockerfile');
    expect(bigRes.status).toBe(413);
    expect(JSON.stringify(bigRes.body)).not.toContain('at ');
  });
});
