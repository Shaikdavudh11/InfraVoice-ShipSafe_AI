import type {
  RiskLabel,
  SeverityCounts,
  ShipSafeFinding,
  ShipSafeSeverity,
} from './types.ts';

export const SEVERITY_WEIGHTS: Record<ShipSafeSeverity, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
  info: 1,
};

export const RISK_FORMULA_DESCRIPTION =
  'ShipSafe Risk Score = round(100 * (1 - exp(-W / (35 + 10 * N)))), where W = 25*Critical + 15*High + 8*Medium + 3*Low + 1*Info and N = scanned files (0 findings always scores 0).';

export function computeSeverityCounts(findings: ShipSafeFinding[]): SeverityCounts {
  const counts: SeverityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const f of findings) {
    counts[f.severity] += 1;
  }

  return counts;
}

export function getRiskLabel(score: number): RiskLabel {
  if (score <= 19) return 'Low';
  if (score <= 39) return 'Moderate';
  if (score <= 59) return 'Elevated';
  if (score <= 79) return 'High';
  return 'Critical';
}

/**
 * Computes deterministic ShipSafe Risk Score in [0, 100].
 * A scan with zero findings always returns 0.
 */
export function calculateRiskScore(
  findings: ShipSafeFinding[],
  scannedFileCount: number
): { score: number; label: RiskLabel; weightedTotal: number } {
  if (findings.length === 0) {
    return { score: 0, label: 'Low', weightedTotal: 0 };
  }

  const weightedTotal = findings.reduce(
    (sum, f) => sum + SEVERITY_WEIGHTS[f.severity],
    0
  );

  const n = Math.max(1, scannedFileCount);
  const scale = 35 + 10 * n;
  const rawScore = Math.round(100 * (1 - Math.exp(-weightedTotal / scale)));
  const score = Math.max(1, Math.min(100, rawScore));

  return {
    score,
    label: getRiskLabel(score),
    weightedTotal,
  };
}
