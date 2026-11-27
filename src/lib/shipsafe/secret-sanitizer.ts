const SENSITIVE_KEY_PATTERN =
  /(password|passwd|pwd|secret|token|api[_-]?key|apikey|private[_-]?key|access[_-]?key|client[_-]?secret|auth[_-]?key|signing[_-]?key|jwt[_-]?secret|db[_-]?pass|database[_-]?url|connection[_-]?string|bearer)/i;

const LITERAL_TOKEN_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/g,
  /ASIA[0-9A-Z]{16}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /xox[baprs]-[0-9A-Za-z-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

const PLACEHOLDER_VALUE_PATTERNS: RegExp[] = [
  /^\$\{[^}]+\}$/,
  /^\$\{\{[^}]+\}\}$/,
  /^\$\([^)]+\)$/,
  /^var\.[a-zA-Z0-9_.-]+$/,
  /^local\.[a-zA-Z0-9_.-]+$/,
  /^data\.[a-zA-Z0-9_.-]+$/,
  /^random_password\.[a-zA-Z0-9_.-]+$/,
  /^<[^>]+>$/,
  /^replace[-_]?me$/i,
  /^your[-_]?.*[-_]?here$/i,
];

/**
 * Checks whether a key name looks like a credential or secret identifier.
 */
export function isSensitiveKeyName(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/**
 * Checks whether a value is a dynamic reference/template rather than a literal secret.
 */
export function isTemplateOrReference(value: string): boolean {
  const trimmed = value.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return true;
  if (trimmed === 'null' || trimmed === 'true' || trimmed === 'false') return true;
  return PLACEHOLDER_VALUE_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Checks if a raw string matches well-known credential or token formats.
 */
export function containsKnownCredentialToken(text: string): boolean {
  for (const pattern of LITERAL_TOKEN_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }
  // Check URLs with embedded credentials: scheme://user:pass@host
  if (/[a-z]+:\/\/[^:\s/@]+:[^@\s/]+@[^\s/]+/i.test(text) && !/\$\{[^}]+\}/.test(text)) {
    return true;
  }
  return false;
}

/**
 * Redacts literal secret values, tokens, private keys, and credential URLs
 * from evidence snippets before returning findings or logs.
 */
export function sanitizeEvidence(rawSnippet: string, maxLength = 260): string {
  let out = rawSnippet;

  // Redact PEM key blocks
  out = out.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    '[REDACTED_PRIVATE_KEY]'
  );

  // Redact known token formats
  for (const pattern of LITERAL_TOKEN_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, '[REDACTED_TOKEN]');
  }

  // Redact embedded basic auth / DB URL passwords: scheme://user:secret@host
  out = out.replace(
    /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:\s/@]+:)([^@\s/]+)(@)/g,
    (_m, prefix: string, secretPart: string, at: string) => {
      if (isTemplateOrReference(secretPart)) return `${prefix}${secretPart}${at}`;
      return `${prefix}[REDACTED]${at}`;
    }
  );

  // Redact sensitive key assignments line by line (ENV KEY=VAL, YAML key: val, TF key = "val")
  out = out
    .split('\n')
    .map((line) => {
      // Match ENV / shell / YAML / HCL key=value or key: value
      const assignMatch = line.match(
        /^(\s*(?:ENV|ARG)?\s*["']?[A-Za-z0-9_.-]+["']?\s*(?:=|:)\s*)(.+)$/i
      );
      if (assignMatch) {
        const [, lhs, rhs] = assignMatch;
        if (isSensitiveKeyName(lhs) && !isTemplateOrReference(rhs)) {
          return `${lhs}[REDACTED]`;
        }
      }

      // Match YAML list "- NAME: KEY" / "value: SECRET" style or "KEY=SECRET" inside list items
      const listKvMatch = line.match(/^(\s*-\s*["']?[A-Za-z0-9_.-]+=)(.+)$/);
      if (listKvMatch) {
        const [, lhs, rhs] = listKvMatch;
        if (isSensitiveKeyName(lhs) && !isTemplateOrReference(rhs)) {
          return `${lhs}[REDACTED]`;
        }
      }

      return line;
    })
    .join('\n');

  if (out.length > maxLength) {
    return `${out.slice(0, maxLength - 3)}...`;
  }
  return out;
}

/**
 * Validates and normalizes an uploaded file name, rejecting path traversal or control characters.
 */
export function validateSafeFileName(rawName: string): { ok: true; fileName: string } | { ok: false; reason: string } {
  if (!rawName || typeof rawName !== 'string') {
    return { ok: false, reason: 'Missing file name.' };
  }

  const trimmed = rawName.trim();
  if (!trimmed) {
    return { ok: false, reason: 'Empty file name.' };
  }

  // Reject null bytes, control chars, backslashes, leading slashes, or traversal segments
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    return { ok: false, reason: 'File name contains invalid control characters.' };
  }
  if (trimmed.includes('\\') || trimmed.startsWith('/')) {
    return { ok: false, reason: 'Absolute paths and backslashes are not allowed in uploaded file names.' };
  }

  const segments = trimmed.split('/');
  if (segments.some((seg) => seg === '..' || seg === '.' || seg === '')) {
    return { ok: false, reason: 'Path traversal or empty path segments are not allowed.' };
  }

  if (trimmed.length > 200) {
    return { ok: false, reason: 'File name exceeds 200 character limit.' };
  }

  return { ok: true, fileName: trimmed };
}
