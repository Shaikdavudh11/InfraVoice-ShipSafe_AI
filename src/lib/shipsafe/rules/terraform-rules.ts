import {
  containsKnownCredentialToken,
  isSensitiveKeyName,
  isTemplateOrReference,
} from '../secret-sanitizer.ts';
import type { ClassifiedFile, ShipSafeFinding } from '../types.ts';
import { createFinding, findLineInRange } from './helpers.ts';

interface TerraformBlock {
  header: string;
  blockType: string;
  resourceType: string;
  resourceName: string;
  startLine: number;
  endLine: number;
  body: string;
}

const SENSITIVE_PORTS = new Set([22, 23, 3389, 5432, 3306, 6379, 9200, 27017, 1433]);

function parseTopLevelBlocks(lines: string[]): TerraformBlock[] {
  const blocks: TerraformBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      i++;
      continue;
    }

    const headerMatch = trimmed.match(
      /^(resource|data|module|provider|variable|locals)\b([^{]*)\{/
    );
    if (!headerMatch) {
      i++;
      continue;
    }

    const blockType = headerMatch[1];
    const restHeader = headerMatch[2].trim();
    const quoted = Array.from(restHeader.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
    const resourceType = quoted[0] || '';
    const resourceName = quoted[1] || quoted[0] || blockType;

    let depth = 0;
    const startLine = i + 1;
    let endLine = startLine;
    const bodyLines: string[] = [];

    for (let j = i; j < lines.length; j++) {
      const curr = lines[j];
      bodyLines.push(curr);
      // Naive quote-safe brace count per line
      let inStr = false;
      for (let c = 0; c < curr.length; c++) {
        const ch = curr[c];
        if (ch === '"' && curr[c - 1] !== '\\') inStr = !inStr;
        if (!inStr) {
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
        }
      }
      if (depth <= 0 && j >= i) {
        endLine = j + 1;
        i = j + 1;
        break;
      }
      if (j === lines.length - 1) {
        endLine = lines.length;
        i = lines.length;
      }
    }

    blocks.push({
      header: trimmed,
      blockType,
      resourceType,
      resourceName,
      startLine,
      endLine,
      body: bodyLines.join('\n'),
    });
  }

  return blocks;
}

function isWebOnlyPortRange(body: string): boolean {
  const fromMatch = body.match(/from_port\s*=\s*(\d+)/);
  const toMatch = body.match(/to_port\s*=\s*(\d+)/);
  if (!fromMatch || !toMatch) return false;
  const fromPort = Number(fromMatch[1]);
  const toPort = Number(toMatch[1]);
  return (fromPort === 80 && toPort === 80) || (fromPort === 443 && toPort === 443);
}

function getPortExposureContext(body: string): { isSensitive: boolean; detail: string } {
  const fromMatch = body.match(/from_port\s*=\s*(-?\d+)/);
  const toMatch = body.match(/to_port\s*=\s*(-?\d+)/);
  const protoMatch = body.match(/protocol\s*=\s*"([^"]+)"/);
  const proto = protoMatch ? protoMatch[1] : '';

  if (proto === '-1') {
    return { isSensitive: true, detail: 'all protocols/ports (-1)' };
  }
  if (!fromMatch || !toMatch) {
    return { isSensitive: false, detail: 'unspecified port range' };
  }
  const fromPort = Number(fromMatch[1]);
  const toPort = Number(toMatch[1]);

  if (fromPort === 0 && toPort >= 65535) {
    return { isSensitive: true, detail: 'all TCP/UDP ports (0-65535)' };
  }
  for (const p of SENSITIVE_PORTS) {
    if (p >= fromPort && p <= toPort) {
      return { isSensitive: true, detail: `sensitive port ${p} (${fromPort}-${toPort})` };
    }
  }
  return { isSensitive: false, detail: `port range ${fromPort}-${toPort}` };
}

export function scanTerraform(file: ClassifiedFile): ShipSafeFinding[] {
  const findings: ShipSafeFinding[] = [];
  let idx = 1;
  const blocks = parseTopLevelBlocks(file.lines);

  for (const block of blocks) {
    const label = block.resourceType
      ? `${block.resourceType}.${block.resourceName}`
      : block.resourceName;

    // TF001 & TF002: Security group ingress / egress 0.0.0.0/0 or ::/0
    const isSgResource =
      block.resourceType === 'aws_security_group' ||
      block.resourceType === 'aws_security_group_rule' ||
      block.resourceType === 'google_compute_firewall';

    if (isSgResource) {
      // Check ingress blocks or ingress rule
      const isIngressRule =
        block.resourceType === 'aws_security_group_rule' && /type\s*=\s*"ingress"/.test(block.body);
      const isGcpIngress =
        block.resourceType === 'google_compute_firewall' && !/direction\s*=\s*"EGRESS"/.test(block.body);
      const ingressSubBlocks = Array.from(
        block.body.matchAll(/ingress\s*\{([\s\S]*?)\}/g)
      ).map((m) => m[1]);

      const ingressSegments = [
        ...(isIngressRule || isGcpIngress ? [block.body] : []),
        ...ingressSubBlocks,
      ];

      for (const seg of ingressSegments) {
        if (/0\.0\.0\.0\/0|::\/0/.test(seg) && !isWebOnlyPortRange(seg)) {
          const ctx = getPortExposureContext(seg);
          const ln =
            findLineInRange(file.lines, /0\.0\.0\.0\/0|::\/0/, block.startLine, block.endLine) ??
            block.startLine;
          findings.push(
            createFinding(
              {
                ruleId: 'TF001',
                title: `Public ingress from 0.0.0.0/0 exposing ${ctx.detail} (${label})`,
                description:
                  'Security group or firewall allows inbound traffic from the entire internet (0.0.0.0/0) on non-HTTPS/sensitive ports.',
                severity: ctx.isSensitive ? 'critical' : 'high',
                category: 'terraform',
                fileName: file.fileName,
                lineNumber: ln,
                evidence: file.lines[ln - 1]?.trim() || '0.0.0.0/0',
                impact: 'Exposes SSH, database, or internal service ports directly to internet scanners and brute-force attacks.',
                recommendation: 'Restrict cidr_blocks / source_ranges to corporate VPN, bastion, or internal VPC CIDR blocks.',
                fixExample: 'cidr_blocks = ["10.0.0.0/16"]',
                confidence: 'high',
              },
              idx++
            )
          );
        }
      }

      // TF002: Unrestricted egress
      const isEgressRule =
        block.resourceType === 'aws_security_group_rule' && /type\s*=\s*"egress"/.test(block.body);
      const egressSubBlocks = Array.from(
        block.body.matchAll(/egress\s*\{([\s\S]*?)\}/g)
      ).map((m) => m[1]);
      const egressSegments = [...(isEgressRule ? [block.body] : []), ...egressSubBlocks];

      for (const seg of egressSegments) {
        if (/0\.0\.0\.0\/0|::\/0/.test(seg)) {
          const ln =
            findLineInRange(file.lines, /\begress\b/, block.startLine, block.endLine) ??
            block.startLine;
          findings.push(
            createFinding(
              {
                ruleId: 'TF002',
                title: `Unrestricted egress (0.0.0.0/0) in ${label}`,
                description:
                  'Security group allows outbound traffic to all destinations (0.0.0.0/0). While common for NAT-backed services, it widens exfiltration paths during SSRF or pod compromise.',
                severity: 'info',
                category: 'terraform',
                fileName: file.fileName,
                lineNumber: ln,
                evidence: file.lines[ln - 1]?.trim() || 'egress { cidr_blocks = ["0.0.0.0/0"] }',
                impact: 'Compromised workloads can initiate outbound connections to arbitrary external endpoints.',
                recommendation: 'Restrict egress CIDRs/ports to required VPC endpoints or known upstream APIs where feasible.',
                confidence: 'medium',
              },
              idx++
            )
          );
        }
      }
    }

    // TF003: Broad IAM permissions / wildcard actions
    const hasWildcardAction =
      /Action\s*[:=]\s*(?:\[[^\]]*"(?:\*|[a-z0-9-]+:\*)"[^\]]*\]|"(?:\*|[a-z0-9-]+:\*)")/i.test(
        block.body
      ) ||
      /actions\s*=\s*\[[^\]]*"(?:\*|[a-z0-9-]+:\*)"[^\]]*\]/i.test(block.body);
    const hasWildcardResource =
      /Resource\s*[:=]\s*(?:\[[^\]]*"\*"[^\]]*\]|"\*")/i.test(block.body) ||
      /resources\s*=\s*\[[^\]]*"\*"[^\]]*\]/i.test(block.body);
    const hasGcpBroadRole =
      /roles\/(owner|editor)\b/.test(block.body) &&
      block.resourceType.includes('iam');

    if (hasWildcardAction || hasGcpBroadRole) {
      const ln =
        findLineInRange(
          file.lines,
          /Action|actions|roles\/(owner|editor)/i,
          block.startLine,
          block.endLine
        ) ?? block.startLine;
      findings.push(
        createFinding(
          {
            ruleId: 'TF003',
            title: `Overly broad IAM permissions in ${label}`,
            description:
              'IAM policy grants wildcard (*) actions or broad Owner/Editor primitives instead of least-privilege permissions.',
            severity: hasWildcardResource || hasGcpBroadRole || /"\*"/.test(block.body) ? 'critical' : 'high',
            category: 'terraform',
            fileName: file.fileName,
            lineNumber: ln,
            evidence: file.lines[ln - 1]?.trim() || block.header,
            impact: 'Compromised workloads assuming this role can escalate privileges or access unintended cloud resources.',
            recommendation: 'Enumerate specific IAM actions and scope Resource ARNs to dedicated buckets/keys/tables.',
            fixExample: 'Action   = ["s3:GetObject", "s3:PutObject"]\nResource = "arn:aws:s3:::my-service-bucket/*"',
            confidence: 'high',
          },
          idx++
        )
      );
    }

    // TF004: Public storage bucket configuration
    const isPublicAcl =
      /acl\s*=\s*"public-read(-write)?"/.test(block.body) ||
      (block.resourceType === 'aws_s3_bucket_public_access_block' &&
        /(block_public_acls|block_public_policy|ignore_public_acls|restrict_public_buckets)\s*=\s*false/.test(
          block.body
        )) ||
      ((block.resourceType.includes('storage_bucket_iam') ||
        block.resourceType.includes('google_storage')) &&
        /\b(allUsers|allAuthenticatedUsers)\b/.test(block.body));

    if (isPublicAcl) {
      const ln =
        findLineInRange(
          file.lines,
          /public-read|false|allUsers|allAuthenticatedUsers/,
          block.startLine,
          block.endLine
        ) ?? block.startLine;
      findings.push(
        createFinding(
          {
            ruleId: 'TF004',
            title: `Public storage bucket access configured (${label})`,
            description:
              'Object storage bucket enables public ACLs, disables public access blocks, or grants allUsers/allAuthenticatedUsers access.',
            severity: 'high',
            category: 'terraform',
            fileName: file.fileName,
            lineNumber: ln,
            evidence: file.lines[ln - 1]?.trim() || block.header,
            impact: 'Risk of exposing sensitive application backups, logs, or customer uploads to the public internet.',
            recommendation: 'Enable all S3 Public Access Block flags or remove allUsers IAM bindings unless serving intentionally public static assets.',
            confidence: 'high',
          },
          idx++
        )
      );
    }

    // TF005: Encryption explicitly disabled
    const encDisabledMatch = block.body.match(
      /\b(encrypted|storage_encrypted|enable_encryption|kms_encryption|node_to_node_encryption_enabled|at_rest_encryption_enabled)\s*=\s*false/
    );
    if (encDisabledMatch) {
      const ln =
        findLineInRange(file.lines, encDisabledMatch[0], block.startLine, block.endLine) ??
        block.startLine;
      findings.push(
        createFinding(
          {
            ruleId: 'TF005',
            title: `Encryption explicitly disabled in ${label}`,
            description: `Configuration sets ${encDisabledMatch[1]} = false, leaving data at rest or in transit unencrypted.`,
            severity: 'high',
            category: 'terraform',
            fileName: file.fileName,
            lineNumber: ln,
            evidence: file.lines[ln - 1]?.trim() || encDisabledMatch[0],
            impact: 'Violates compliance baselines and exposes raw storage snapshots if media or snapshots are accessed.',
            recommendation: `Set ${encDisabledMatch[1]} = true and attach a managed KMS key.`,
            fixExample: `${encDisabledMatch[1]} = true`,
            confidence: 'high',
          },
          idx++
        )
      );
    }

    // TF006: Hardcoded credential patterns
    for (let lineIdx = block.startLine - 1; lineIdx < block.endLine; lineIdx++) {
      const rawLine = file.lines[lineIdx];
      const kv = rawLine.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*"([^"]*)"\s*(?:#.*)?$/);
      if (kv) {
        const [, key, val] = kv;
        if (
          (isSensitiveKeyName(key) && !isTemplateOrReference(val) && val.length > 0) ||
          containsKnownCredentialToken(val)
        ) {
          findings.push(
            createFinding(
              {
                ruleId: 'TF006',
                title: `Hardcoded credential in Terraform attribute "${key}" (${label})`,
                description:
                  'A literal secret or password string is committed in Terraform configuration, which will also be persisted in Terraform state.',
                severity: 'critical',
                category: 'secrets',
                fileName: file.fileName,
                lineNumber: lineIdx + 1,
                evidence: `${key} = "[REDACTED]"`,
                impact: 'Credentials leak into Git history and Terraform state files.',
                recommendation: 'Pass secrets via sensitive Terraform input variables (var.*) or fetch from Cloud Secret Manager at runtime.',
                fixExample: `${key} = var.${key}`,
                confidence: 'high',
              },
              idx++
            )
          );
        }
      }
    }

    // TF007: Public IP or public exposure configuration (context-sensitive)
    const publicIpMatch = block.body.match(
      /\b(publicly_accessible|associate_public_ip_address|map_public_ip_on_launch)\s*=\s*true/
    );
    if (publicIpMatch) {
      const attr = publicIpMatch[1];
      const isDatabase = block.resourceType.includes('db_') || block.resourceType.includes('rds') || block.resourceType.includes('sql');
      const ln =
        findLineInRange(file.lines, publicIpMatch[0], block.startLine, block.endLine) ??
        block.startLine;
      findings.push(
        createFinding(
          {
            ruleId: 'TF007',
            title: isDatabase
              ? `Database instance configured as publicly accessible (${label})`
              : `Public IP auto-assignment enabled (${attr} = true in ${label})`,
            description: isDatabase
              ? 'Database resource sets publicly_accessible = true, assigning a public DNS/IP endpoint.'
              : 'Resource assigns public IP addresses automatically. Verify whether public internet reachability is intentional (e.g. bastion/ALB subnet) vs private application subnet.',
            severity: isDatabase ? 'high' : 'info',
            category: 'terraform',
            fileName: file.fileName,
            lineNumber: ln,
            evidence: file.lines[ln - 1]?.trim() || publicIpMatch[0],
            impact: isDatabase
              ? 'Direct database exposure expands attack surface for credential stuffing or zero-days.'
              : 'Resources launched in this configuration receive routable public IPv4 addresses.',
            recommendation: isDatabase
              ? 'Set publicly_accessible = false and place the database inside private subnets.'
              : 'Place internal application workloads in private subnets behind a load balancer or NAT gateway.',
            confidence: 'high',
          },
          idx++
        )
      );
    }
  }

  return findings;
}
