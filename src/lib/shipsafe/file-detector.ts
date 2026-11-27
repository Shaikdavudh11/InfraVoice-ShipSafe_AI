import { loadAll } from 'js-yaml';
import { validateSafeFileName } from './secret-sanitizer.ts';
import type { ClassifiedFile, RawUploadFile, ShipSafeFileType } from './types.ts';

export const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB
export const MAX_FILE_COUNT = 20;
export const MAX_TOTAL_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export type ClassificationOutcome =
  | { ok: true; file: ClassifiedFile }
  | { ok: false; fileName: string; reason: string };

function baseName(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1] || filePath;
}

function isBinaryContent(content: string): boolean {
  return content.includes('\u0000');
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function detectYamlType(
  fileName: string,
  docs: unknown[]
): { ok: true; fileType: ShipSafeFileType } | { ok: false; reason: string } {
  const normalizedPath = fileName.toLowerCase();
  const base = baseName(normalizedPath);

  const nonNullDocs = docs.filter((d) => d !== null && d !== undefined);
  if (nonNullDocs.length === 0) {
    return { ok: false, reason: 'YAML file does not contain any structured documents.' };
  }

  // 1. Check Kubernetes manifests: apiVersion + kind in any document
  const looksLikeK8s = nonNullDocs.some(
    (doc) => isRecord(doc) && typeof doc.apiVersion === 'string' && typeof doc.kind === 'string'
  );
  if (looksLikeK8s) {
    return { ok: true, fileType: 'kubernetes' };
  }

  // 2. Check GitHub Actions workflows: path under .github/workflows/ OR workflow schema (`jobs` + `on` / trigger)
  const firstDoc = nonNullDocs[0];
  if (isRecord(firstDoc)) {
    const hasJobs = isRecord(firstDoc.jobs);
    // Note: YAML 1.1 parsers may parse bare `on:` key as boolean `true` or string `'on'`
    const hasOnKey = 'on' in firstDoc || 'true' in firstDoc;
    if (
      normalizedPath.startsWith('.github/workflows/') ||
      (hasJobs && hasOnKey)
    ) {
      if (!hasJobs) {
        return {
          ok: false,
          reason: 'Workflow YAML under .github/workflows/ is missing a jobs mapping.',
        };
      }
      return { ok: true, fileType: 'github-actions' };
    }

    // 3. Check Docker Compose: `services` mapping or compose filename with valid service/version structure
    const hasServices = isRecord(firstDoc.services);
    const isComposeName =
      base.startsWith('docker-compose') || base === 'compose.yml' || base === 'compose.yaml';
    if (hasServices || (isComposeName && ('version' in firstDoc || 'networks' in firstDoc || 'volumes' in firstDoc))) {
      if (!hasServices) {
        return {
          ok: false,
          reason: 'Docker Compose file does not declare a services mapping.',
        };
      }
      return { ok: true, fileType: 'docker-compose' };
    }
  }

  return {
    ok: false,
    reason:
      'Unrecognized YAML structure. Supported YAML formats are Kubernetes manifests, Docker Compose files, and GitHub Actions workflows.',
  };
}

export function classifyAndValidateFile(raw: RawUploadFile): ClassificationOutcome {
  const nameCheck = validateSafeFileName(raw.fileName);
  if (!nameCheck.ok) {
    return { ok: false, fileName: String(raw.fileName || 'unknown'), reason: nameCheck.reason };
  }

  const fileName = nameCheck.fileName;
  const lower = fileName.toLowerCase();
  const base = baseName(lower);

  if (raw.sizeBytes <= 0 || !raw.content || raw.content.trim().length === 0) {
    return { ok: false, fileName, reason: 'File is empty.' };
  }

  if (raw.sizeBytes > MAX_FILE_SIZE_BYTES || Buffer.byteLength(raw.content, 'utf8') > MAX_FILE_SIZE_BYTES) {
    return { ok: false, fileName, reason: 'File exceeds the 1 MB individual file limit.' };
  }

  if (isBinaryContent(raw.content)) {
    return { ok: false, fileName, reason: 'Binary files are not supported.' };
  }

  const lines = raw.content.replace(/\r\n/g, '\n').split('\n');

  // 1. Dockerfile / Dockerfile.* / *.dockerfile
  if (base === 'dockerfile' || base.startsWith('dockerfile.') || base.endsWith('.dockerfile')) {
    const hasDockerInstruction = lines.some((l) =>
      /^\s*(FROM|ARG|RUN|CMD|ENTRYPOINT|COPY|ADD|ENV|EXPOSE|USER|WORKDIR|HEALTHCHECK)\b/i.test(l)
    );
    if (!hasDockerInstruction) {
      return {
        ok: false,
        fileName,
        reason: 'Dockerfile does not contain any recognizable Dockerfile instructions (e.g. FROM, RUN, CMD).',
      };
    }
    return {
      ok: true,
      file: {
        fileName,
        fileType: 'dockerfile',
        content: raw.content,
        lines,
        sizeBytes: raw.sizeBytes,
      },
    };
  }

  // 2. .dockerignore
  if (base === '.dockerignore' || base.endsWith('.dockerignore')) {
    return {
      ok: true,
      file: {
        fileName,
        fileType: 'dockerignore',
        content: raw.content,
        lines,
        sizeBytes: raw.sizeBytes,
      },
    };
  }

  // 3. Terraform .tf
  if (base.endsWith('.tf')) {
    return {
      ok: true,
      file: {
        fileName,
        fileType: 'terraform',
        content: raw.content,
        lines,
        sizeBytes: raw.sizeBytes,
      },
    };
  }

  // 4. YAML (.yaml / .yml) -> classify via content + path
  if (base.endsWith('.yaml') || base.endsWith('.yml')) {
    let parsedDocs: unknown[] = [];
    try {
      parsedDocs = loadAll(raw.content);
    } catch (err) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : 'Malformed YAML syntax';
      return {
        ok: false,
        fileName,
        reason: `Invalid YAML syntax: ${msg}`,
      };
    }

    const yamlClass = detectYamlType(fileName, parsedDocs);
    if (!yamlClass.ok) {
      return { ok: false, fileName, reason: yamlClass.reason };
    }

    return {
      ok: true,
      file: {
        fileName,
        fileType: yamlClass.fileType,
        content: raw.content,
        lines,
        sizeBytes: raw.sizeBytes,
        parsedYamlDocs: parsedDocs,
      },
    };
  }

  return {
    ok: false,
    fileName,
    reason:
      'Unsupported file format. Supported formats: Dockerfile, Dockerfile.*, .dockerignore, Kubernetes YAML, Docker Compose YAML, Terraform (.tf), and GitHub Actions workflows (.yml/.yaml).',
  };
}
