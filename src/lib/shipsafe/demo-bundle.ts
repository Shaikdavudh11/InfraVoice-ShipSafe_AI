export interface DemoBundleFile {
  fileName: string;
  content: string;
}

/**
 * Intentionally vulnerable configuration bundle used by "Try sample scan".
 * These files are submitted directly to POST /api/shipsafe/scan and evaluated
 * by the same deterministic rule engine as user-uploaded files.
 */
export const DEMO_VULNERABLE_BUNDLE: DemoBundleFile[] = [
  {
    fileName: 'Dockerfile',
    content: `FROM node:20-latest
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080
CMD ["node", "dist/server.js"]`,
  },
  {
    fileName: 'k8s-deployment.yaml',
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
            runAsUser: 0
          ports:
            - containerPort: 8080
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"`,
  },
  {
    fileName: 'main.tf',
    content: `resource "aws_security_group" "bastion_sg" {
  name        = "payments-bastion-sg"
  description = "Allow SSH access"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_iam_policy" "worker_policy" {
  name = "payments-worker-wildcard"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action   = ["s3:*", "kms:*"]
      Effect   = "Allow"
      Resource = "*"
    }]
  })
}`,
  },
  {
    fileName: '.github/workflows/deploy.yml',
    content: `name: Deploy Production
on:
  push:
    branches: [main]
permissions: write-all
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy release
        run: ./scripts/deploy.sh`,
  },
];
