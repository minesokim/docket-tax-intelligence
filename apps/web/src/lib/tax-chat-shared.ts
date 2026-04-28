import type { AuthorityResearchResult } from "@docket/tax-knowledge";
import type { ChatArtifactEnvelope } from "@docket/domain";

export type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export type SourceIndexEntry = {
  id: string;
  type: string;
  label: string;
  detail: string;
};

export type ChatAnswer = {
  mode: "client-return" | "general-research";
  headline: string;
  answer: string[];
  verdict?: {
    filingStatus: string;
    blockerCount: number;
    readinessScore: number;
    extensionRiskScore: number;
    readinessMeaning: string;
  };
  actionQueues?: {
    clientFacing: string[];
    preparerFacing: string[];
  };
  reasoningSummary: string[];
  nextSteps: string[];
  professionalAnalyses?: ProfessionalAnalysisView[];
  sourceIds: string[];
  citationIds: string[];
  suggestedFollowups: string[];
  retrievedAuthority?: AuthorityResearchResult;
  artifacts?: ChatArtifactEnvelope;
  synthesizedBy?: "claude-code-cli";
  limitation?: string;
};

export type ProfessionalAnalysisView = {
  issueId: string;
  title: string;
  priority: number;
  statusLabel: string;
  situationMode: string;
  context: string;
  factPatternSummary: string;
  ruleSpace: string[];
  smellTests: string[];
  dollarExposure: string;
  professionalJudgment: string;
  establishedFacts: string[];
  clientClaims: string[];
  assumptionsToAvoid: string[];
  missingFacts: string[];
  authorityPosture: string;
  diligenceDuties: string[];
  riskRationale: string;
  reviewerChecklist: string[];
  clearanceStandard: string;
  clientQuestionStrategy: string;
  clientCommunicationDraft: string;
  preparerWorkPlan: string[];
  sourceIds: string[];
  citationIds: string[];
};

export type TaxChatResponse = {
  answer: ChatAnswer;
  sourceIndex: Record<string, SourceIndexEntry>;
  contextLabel: string | null;
  contextReturnId: string | null;
};

export const suggestedQuestions = [
  "What are the requirements for an S corporation election?",
  "What records are needed to substantiate business mileage?",
  "How should a preparer evaluate a home office deduction?",
  "When should a firm recommend filing an extension?",
  "What is the difference between a client claim and a verified tax fact?",
  "What sources are stronger than IRS publications?",
  "How should unsupported tax positions be escalated?",
  "What should a reviewer check before ready-to-file?",
];
