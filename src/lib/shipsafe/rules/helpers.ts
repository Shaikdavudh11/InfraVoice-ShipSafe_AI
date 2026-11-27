import { sanitizeEvidence } from '../secret-sanitizer.ts';
import type {
  FindingConfidence,
  ShipSafeCategory,
  ShipSafeFinding,
  ShipSafeSeverity,
} from '../types.ts';

export interface CreateFindingInput {
  ruleId: string;
  title: string;
  description: string;
  severity: ShipSafeSeverity;
  category: ShipSafeCategory;
  fileName: string;
  lineNumber: number | null;
  evidence: string;
  impact: string;
  recommendation: string;
  fixExample?: string;
  confidence?: FindingConfidence;
  references?: string[];
}

export function createFinding(
  input: CreateFindingInput,
  index: number
): ShipSafeFinding {
  return {
    id: `${input.ruleId}-${index}`,
    ruleId: input.ruleId,
    title: input.title,
    description: input.description,
    severity: input.severity,
    category: input.category,
    fileName: input.fileName,
    lineNumber: input.lineNumber,
    evidence: sanitizeEvidence(input.evidence),
    impact: input.impact,
    recommendation: input.recommendation,
    fixExample: input.fixExample,
    confidence: input.confidence ?? 'high',
    source: 'deterministic-rule',
    references: input.references,
  };
}

/**
 * Finds the 1-indexed line number matching a regex or substring within an optional [startLine, endLine] 1-indexed range.
 */
export function findLineInRange(
  lines: string[],
  matcher: RegExp | string,
  startLine = 1,
  endLine = lines.length
): number | null {
  const from = Math.max(0, startLine - 1);
  const to = Math.min(lines.length - 1, endLine - 1);

  for (let i = from; i <= to; i++) {
    const line = lines[i];
    if (typeof matcher === 'string') {
      if (line.includes(matcher)) return i + 1;
    } else {
      matcher.lastIndex = 0;
      if (matcher.test(line)) return i + 1;
    }
  }
  return null;
}

/**
 * Splits a multi-document YAML file into approximate 1-indexed line ranges per document.
 */
export function getYamlDocumentRanges(lines: string[]): Array<{ startLine: number; endLine: number }> {
  const docStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*---\s*(#.*)?$/.test(lines[i])) {
      docStarts.push(i + 1);
    }
  }

  if (docStarts.length === 0) {
    return [{ startLine: 1, endLine: lines.length }];
  }

  const ranges: Array<{ startLine: number; endLine: number }> = [];
  // Include content before the first '---' only if non-empty/non-comment
  const hasLeadingContent = lines
    .slice(0, docStarts[0] - 1)
    .some((l) => l.trim() !== '' && !l.trim().startsWith('#'));

  if (hasLeadingContent) {
    ranges.push({ startLine: 1, endLine: docStarts[0] - 1 });
  }

  for (let i = 0; i < docStarts.length; i++) {
    const start = docStarts[i];
    const end = i + 1 < docStarts.length ? docStarts[i + 1] - 1 : lines.length;
    ranges.push({ startLine: start, endLine: end });
  }

  return ranges;
}

export function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function extractSnippet(lines: string[], lineNumber: number | null, contextLines = 0): string {
  if (!lineNumber || lineNumber < 1 || lineNumber > lines.length) {
    return lines[0] || '';
  }
  const start = Math.max(0, lineNumber - 1 - contextLines);
  const end = Math.min(lines.length, lineNumber + contextLines);
  return lines.slice(start, end).join('\n');
}
