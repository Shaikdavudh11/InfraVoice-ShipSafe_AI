import { Type } from '@google/genai';
import { z } from 'zod';

export const PriorityLevelSchema = z.enum(['P0', 'P1', 'P2', 'P3']);

export const ShipSafeAiRecommendationSchema = z.object({
  priority: PriorityLevelSchema,
  title: z.string().min(1),
  ruleIds: z.array(z.string()),
  rationale: z.string().min(1),
  actionSteps: z.array(z.string().min(1)).min(1),
  exampleFix: z.string().optional(),
});

export const ShipSafeFindingInsightSchema = z.object({
  ruleId: z.string().min(1),
  fileName: z.string().min(1),
  whyItMatters: z.string().min(1),
  realWorldImpact: z.string().min(1),
  relatedRuleIds: z.array(z.string()).default([]),
});

export const ShipSafeAiAnalysisSchema = z.object({
  executiveSummary: z.string().min(1),
  overallAssessment: z.string().min(1),
  deploymentReadiness: z.enum([
    'Blocked — Fix Critical Risks',
    'Needs Review Before Production',
    'Ready With Minor Hardening',
    'Ready to Ship',
  ]),
  prioritizedPlan: z.array(ShipSafeAiRecommendationSchema),
  findingInsights: z.array(ShipSafeFindingInsightSchema),
  findingRelationships: z.array(z.string()),
  quickWins: z.array(z.string()),
  longTermImprovements: z.array(z.string()),
  validationSteps: z.array(z.string().min(1)).min(1),
  generalNotes: z.string().optional(),
});

export type ShipSafeAiAnalysis = z.infer<typeof ShipSafeAiAnalysisSchema>;

export const SHIPSAFE_ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    executiveSummary: { type: Type.STRING },
    overallAssessment: { type: Type.STRING },
    deploymentReadiness: {
      type: Type.STRING,
      enum: [
        'Blocked — Fix Critical Risks',
        'Needs Review Before Production',
        'Ready With Minor Hardening',
        'Ready to Ship',
      ],
    },
    prioritizedPlan: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          priority: { type: Type.STRING, enum: ['P0', 'P1', 'P2', 'P3'] },
          title: { type: Type.STRING },
          ruleIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          rationale: { type: Type.STRING },
          actionSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
          exampleFix: { type: Type.STRING },
        },
        required: ['priority', 'title', 'ruleIds', 'rationale', 'actionSteps'],
      },
    },
    findingInsights: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ruleId: { type: Type.STRING },
          fileName: { type: Type.STRING },
          whyItMatters: { type: Type.STRING },
          realWorldImpact: { type: Type.STRING },
          relatedRuleIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['ruleId', 'fileName', 'whyItMatters', 'realWorldImpact'],
      },
    },
    findingRelationships: { type: Type.ARRAY, items: { type: Type.STRING } },
    quickWins: { type: Type.ARRAY, items: { type: Type.STRING } },
    longTermImprovements: { type: Type.ARRAY, items: { type: Type.STRING } },
    validationSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
    generalNotes: { type: Type.STRING },
  },
  required: [
    'executiveSummary',
    'overallAssessment',
    'deploymentReadiness',
    'prioritizedPlan',
    'findingInsights',
    'findingRelationships',
    'quickWins',
    'longTermImprovements',
    'validationSteps',
  ],
};

export const IncidentInvestigationSchema = z.object({
  incidentSummary: z.string().min(1),
  severityEstimate: z.enum(['critical', 'high', 'medium', 'low']),
  symptoms: z.array(z.string().min(1)),
  confirmedEvidence: z.array(z.string().min(1)),
  inferredCauses: z.array(
    z.object({
      cause: z.string().min(1),
      confidence: z.enum(['high', 'medium', 'low']),
      supportingEvidence: z.string().min(1),
    })
  ),
  unverifiedHypotheses: z.array(z.string()),
  recommendedInvestigationSteps: z.array(
    z.object({
      step: z.string().min(1),
      command: z.string().optional(),
      riskNote: z.string().min(1),
    })
  ),
  immediateMitigation: z.array(
    z.object({
      action: z.string().min(1),
      command: z.string().optional(),
      safetyNote: z.string().min(1),
    })
  ),
  longTermPrevention: z.array(z.string().min(1)),
  verificationSteps: z.array(z.string().min(1)).min(1),
  missingEvidenceQuestions: z.array(z.string()).default([]),
});

export type IncidentInvestigationReport = z.infer<typeof IncidentInvestigationSchema>;

export const INCIDENT_INVESTIGATION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    incidentSummary: { type: Type.STRING },
    severityEstimate: { type: Type.STRING, enum: ['critical', 'high', 'medium', 'low'] },
    symptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
    confirmedEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
    inferredCauses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          cause: { type: Type.STRING },
          confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
          supportingEvidence: { type: Type.STRING },
        },
        required: ['cause', 'confidence', 'supportingEvidence'],
      },
    },
    unverifiedHypotheses: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommendedInvestigationSteps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          step: { type: Type.STRING },
          command: { type: Type.STRING },
          riskNote: { type: Type.STRING },
        },
        required: ['step', 'riskNote'],
      },
    },
    immediateMitigation: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING },
          command: { type: Type.STRING },
          safetyNote: { type: Type.STRING },
        },
        required: ['action', 'safetyNote'],
      },
    },
    longTermPrevention: { type: Type.ARRAY, items: { type: Type.STRING } },
    verificationSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
    missingEvidenceQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'incidentSummary',
    'severityEstimate',
    'symptoms',
    'confirmedEvidence',
    'inferredCauses',
    'unverifiedHypotheses',
    'recommendedInvestigationSteps',
    'immediateMitigation',
    'longTermPrevention',
    'verificationSteps',
  ],
};
