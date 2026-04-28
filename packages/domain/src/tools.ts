import {
  artifactConfidence,
  type ClientQuestionArtifact,
  type PreparerTaskArtifact,
  type ReconciliationTableArtifact,
  type SourcePacketItem,
  type WorkpaperArtifact,
} from "./artifacts";
import { evaluateReviewGate } from "./engines";
import {
  getClientFile,
  retrieveAuthority,
  searchConversations,
  searchDocuments,
  searchIssues,
  searchPriorYearPatterns,
  searchTaxFacts,
  searchWorkpapers,
} from "./retrieval";
import { readDocketData } from "./store";
import type { DocketData } from "./types";

function sourceIdsForPackets(packets: SourcePacketItem[]): string[] {
  return packets.map((packet) => packet.id);
}

export function createClientQuestion(input: {
  id: string;
  relatedIssueId: string | null;
  question: string;
  reason: string;
  sourcePacketIds?: string[];
  reviewerApproved?: boolean;
}): ClientQuestionArtifact {
  return {
    id: input.id,
    relatedIssueId: input.relatedIssueId,
    question: input.question,
    reason: input.reason,
    sourcePacketIds: input.sourcePacketIds ?? [],
    reviewerState: input.reviewerApproved ? "PREPARER_READY" : "UNREVIEWED",
    confidence: artifactConfidence("Client question artifact was created by the Docket tool registry from issue-linked source packets.", {
      overall: input.reviewerApproved ? 0.82 : 0.68,
      sourceSupport: input.sourcePacketIds?.length ? 0.78 : 0.45,
      reviewState: input.reviewerApproved ? "PREPARER_READY" : "UNREVIEWED",
    }),
  };
}

export function createWorkpaper(input: {
  id: string;
  title: string;
  section: string;
  body: string;
  sourcePacketIds?: string[];
  approved?: boolean;
}): WorkpaperArtifact {
  return {
    id: input.id,
    title: input.title,
    section: input.section,
    body: input.body,
    sourcePacketIds: input.sourcePacketIds ?? [],
    reviewerState: input.approved ? "REVIEWER_APPROVED" : "PREPARER_READY",
    confidence: artifactConfidence("Workpaper artifact was created by the Docket tool registry and remains reviewer-controlled.", {
      overall: input.approved ? 0.9 : 0.74,
      sourceSupport: input.sourcePacketIds?.length ? 0.8 : 0.45,
      reviewState: input.approved ? "REVIEWER_APPROVED" : "PREPARER_READY",
    }),
  };
}

export function createPreparerTask(input: {
  id: string;
  relatedIssueId: string | null;
  task: string;
  sourcePacketIds?: string[];
  priority: number;
  blocker?: boolean;
}): PreparerTaskArtifact {
  return {
    id: input.id,
    relatedIssueId: input.relatedIssueId,
    task: input.task,
    sourcePacketIds: input.sourcePacketIds ?? [],
    priority: input.priority,
    confidence: artifactConfidence("Preparer task artifact was created from the issue's recommended action.", {
      overall: input.blocker ? 0.84 : 0.74,
      sourceSupport: input.sourcePacketIds?.length ? 0.8 : 0.55,
      reviewState: input.blocker ? "NEEDS_EVIDENCE" : "UNREVIEWED",
    }),
  };
}

export function buildReconciliationTable(returnId: string, query: string, relatedIssueId: string | null, data: DocketData = readDocketData()): ReconciliationTableArtifact | null {
  const packets = [
    ...searchTaxFacts(returnId, query, data),
    ...searchConversations(returnId, query, data),
    ...searchDocuments(returnId, query, data),
  ];
  const uniquePackets = Array.from(new Map(packets.map((packet) => [packet.id, packet])).values());
  const rows = uniquePackets.slice(0, 10).map((packet) => ({
    id: `row-${packet.sourceId}`,
    cells: [packet.label, packet.excerpt, packet.sourceType.replaceAll("_", " "), packet.reliability],
    sourcePacketIds: [packet.id],
    status: packet.sourceType === "client_claim" ? ("UNRESOLVED" as const) : ("MATCHED" as const),
  }));
  if (rows.length === 0) return null;
  return {
    id: `recon-${returnId}-${relatedIssueId ?? "return"}`,
    title: "Source reconciliation table",
    relatedIssueId,
    columns: ["Source", "Evidence", "Type", "Reliability"],
    rows,
    confidence: artifactConfidence("Reconciliation table was built by deterministic retrieval tools before model synthesis.", {
      overall: 0.78,
      sourceSupport: 0.82,
      retrievalConfidence: 0.84,
      authorityFit: 0.65,
    }),
  };
}

export function runReviewGateCheck(returnId: string, stage: "READY_FOR_REVIEW" | "READY_FOR_SIGNATURE" | "READY_TO_FILE" = "READY_TO_FILE", data: DocketData = readDocketData()) {
  return evaluateReviewGate(data, returnId, stage);
}

export const docketTools = {
  getClientFile,
  searchTaxFacts,
  searchDocuments,
  searchIssues,
  searchWorkpapers,
  searchConversations,
  searchPriorYearPatterns,
  retrieveAuthority,
  createClientQuestion,
  createWorkpaper,
  createPreparerTask,
  buildReconciliationTable,
  runReviewGateCheck,
  sourceIdsForPackets,
};

export type DocketToolRegistry = typeof docketTools;
