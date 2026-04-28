import { createHash } from "node:crypto";

import {
  artifactConfidence,
  authorityTierForSourceType,
  reviewStateFromStatus,
  type ChatArtifactEnvelope,
  type FactNode,
  type SourceReliabilityBand,
  type SourcePacketItem,
} from "./artifacts";
import { evaluateReviewGate, scoreExtensionRisk, scoreReadiness } from "./engines";
import { getReturnWorkbench } from "./selectors";
import { readDocketData } from "./store";
import type { DocketData, TaxAuthoritySource, TaxCitation } from "./types";

const NOW = "2026-04-26T12:00:00.000Z";
const SEARCH_STOP_WORDS = new Set([
  "and",
  "client",
  "current",
  "credit",
  "document",
  "expected",
  "filing",
  "form",
  "irs",
  "issue",
  "missing",
  "return",
  "review",
  "source",
  "status",
  "tax",
  "with",
]);

function packetId(sourceType: SourcePacketItem["sourceType"], id: string): string {
  return `packet-${sourceType}-${id}`;
}

function freshnessForDate(date: string | null | undefined): number {
  if (!date) return 0.55;
  const year = Number(date.slice(0, 4));
  if (!Number.isFinite(year)) return 0.55;
  if (year >= 2025) return 0.95;
  if (year >= 2024) return 0.85;
  if (year >= 2022) return 0.7;
  return 0.5;
}

function sourceReliabilityForType(type: SourcePacketItem["sourceType"]): number {
  if (type === "tax_authority" || type === "tax_citation") return 0.94;
  if (type === "tax_fact" || type === "document" || type === "prior_year_pattern") return 0.84;
  if (type === "workpaper" || type === "review_gate" || type === "issue") return 0.78;
  if (type === "client_claim" || type === "conversation" || type === "client_question") return 0.62;
  return 0.55;
}

function reliabilityBand(score: number): SourceReliabilityBand {
  if (score >= 0.92) return "very_high";
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

function sourcePacketItem(input: {
  id: string;
  sourceType: SourcePacketItem["sourceType"];
  label: string;
  excerpt: string;
  sourceId?: string;
  sourceUrl?: string | null;
  sourceDate?: string | null;
  taxYear?: number | null;
  jurisdiction?: string | null;
  authorityTier?: SourcePacketItem["authorityTier"];
  authorityLevel?: SourcePacketItem["authorityLevel"];
  evidenceRefIds?: string[];
  retrievalConfidence?: number;
}): SourcePacketItem {
  const sourceReliability = sourceReliabilityForType(input.sourceType);
  return {
    id: packetId(input.sourceType, input.id),
    sourceType: input.sourceType,
    label: input.label,
    excerpt: input.excerpt,
    sourceId: input.sourceId ?? input.id,
    sourceUrl: input.sourceUrl ?? null,
    sourceDate: input.sourceDate ?? null,
    retrievedAt: NOW,
    taxYear: input.taxYear ?? null,
    jurisdiction: input.jurisdiction ?? null,
    authorityTier: input.authorityTier ?? (input.sourceType === "tax_authority" || input.sourceType === "tax_citation" ? "OFFICIAL_INTERPRETIVE" : "CLIENT_EVIDENCE"),
    authorityLevel: input.authorityLevel ?? null,
    reliability: reliabilityBand(sourceReliability),
    sourceReliability,
    recencyConfidence: freshnessForDate(input.sourceDate),
    retrievalConfidence: input.retrievalConfidence ?? 0.82,
    evidenceRefIds: input.evidenceRefIds ?? [],
  };
}

function authorityPacket(source: TaxAuthoritySource): SourcePacketItem {
  return sourcePacketItem({
    id: source.id,
    sourceType: "tax_authority",
    label: source.title,
    excerpt: `${source.title}. Authority level: ${source.authorityLevel.replaceAll("_", " ")}. Tags: ${source.topicTags.join(", ")}.`,
    sourceId: source.id,
    sourceUrl: source.sourceUrl,
    sourceDate: source.publishedAt,
    taxYear: null,
    jurisdiction: source.jurisdiction,
    authorityLevel: source.authorityLevel,
  });
}

function citationPacket(citation: TaxCitation, source: TaxAuthoritySource | undefined): SourcePacketItem {
  return sourcePacketItem({
    id: citation.id,
    sourceType: "tax_citation",
    label: citation.label,
    excerpt: citation.quote,
    sourceId: citation.id,
    sourceUrl: source?.sourceUrl ?? null,
    sourceDate: source?.publishedAt ?? null,
    taxYear: null,
    jurisdiction: source?.jurisdiction ?? "US",
    authorityLevel: citation.authorityLevel,
  });
}

export function buildReturnSourcePacket(returnId: string, data: DocketData = readDocketData()): SourcePacketItem[] {
  const taxReturn = data.taxReturns.find((item) => item.id === returnId);
  if (!taxReturn) return [];
  const client = data.clients.find((item) => item.id === taxReturn.clientId);
  const packets: SourcePacketItem[] = [];
  if (client) {
    packets.push(
      sourcePacketItem({
        id: client.id,
        sourceType: "client",
        label: client.displayName,
        excerpt: `Client context tags: ${client.tags.join(", ")}. Average response time: ${client.averageResponseDays} days.`,
        taxYear: taxReturn.taxYear,
        jurisdiction: taxReturn.jurisdiction,
        authorityTier: "CLIENT_EVIDENCE",
      }),
    );
  }

  for (const document of data.sourceDocuments.filter((item) => item.taxReturnId === returnId)) {
    packets.push(
      sourcePacketItem({
        id: document.id,
        sourceType: "document",
        label: document.fileName,
        excerpt: `${document.documentClass.replaceAll("_", " ")} received ${document.receivedAt.slice(0, 10)}; ${document.processedAt ? "processed" : "not processed"}. ${document.fixtureFields.map((field) => `${field.label}: ${String(field.value)}`).join("; ") || "No extracted fields yet."}`,
        sourceId: document.id,
        sourceUrl: document.storageKey.startsWith("http") ? document.storageKey : null,
        sourceDate: document.receivedAt,
        taxYear: document.taxYear,
        jurisdiction: taxReturn.jurisdiction,
        authorityTier: authorityTierForSourceType(document.sourceType),
      }),
    );
  }

  for (const fact of data.taxFacts.filter((item) => item.taxReturnId === returnId)) {
    packets.push(
      sourcePacketItem({
        id: fact.id,
        sourceType: "tax_fact",
        label: fact.label,
        excerpt: `${fact.label}: ${String(fact.value)}. Status ${fact.status}; review ${fact.reviewStatus}; confidence ${Math.round(fact.confidence * 100)}%.`,
        sourceId: fact.id,
        sourceDate: fact.acceptedAt,
        taxYear: fact.taxYear,
        jurisdiction: fact.jurisdiction,
        evidenceRefIds: fact.evidenceRefs.map((evidence) => evidence.id),
        retrievalConfidence: fact.confidence,
      }),
    );
  }

  for (const claim of data.clientClaims.filter((item) => item.taxReturnId === returnId)) {
    packets.push(
      sourcePacketItem({
        id: claim.id,
        sourceType: "client_claim",
        label: claim.claimType.replaceAll("_", " "),
        excerpt: claim.statement,
        sourceId: claim.id,
        sourceDate: claim.createdAt,
        taxYear: taxReturn.taxYear,
        jurisdiction: taxReturn.jurisdiction,
        authorityTier: "UNTRUSTED_INPUT",
        evidenceRefIds: claim.evidenceRefs.map((evidence) => evidence.id),
      }),
    );
  }

  for (const insight of data.conversationInsights.filter((item) => item.taxReturnId === returnId)) {
    packets.push(
      sourcePacketItem({
        id: insight.id,
        sourceType: "conversation",
        label: insight.insightType.replaceAll("_", " "),
        excerpt: `${insight.summary} Quote: ${insight.sourceQuote}`,
        sourceId: insight.id,
        taxYear: taxReturn.taxYear,
        jurisdiction: taxReturn.jurisdiction,
        authorityTier: "UNTRUSTED_INPUT",
      }),
    );
  }

  for (const pattern of data.priorYearPatterns.filter((item) => item.taxReturnId === returnId)) {
    packets.push(
      sourcePacketItem({
        id: pattern.id,
        sourceType: "prior_year_pattern",
        label: pattern.patternType.replaceAll("_", " "),
        excerpt: pattern.description,
        sourceId: pattern.id,
        taxYear: pattern.priorTaxYear,
        jurisdiction: taxReturn.jurisdiction,
      }),
    );
  }

  for (const missingDocument of data.missingDocuments.filter((item) => item.taxReturnId === returnId)) {
    packets.push(
      sourcePacketItem({
        id: missingDocument.id,
        sourceType: "missing_document",
        label: missingDocument.expectedDocumentClass.replaceAll("_", " "),
        excerpt: `${missingDocument.reason} Status ${missingDocument.status}; severity ${missingDocument.severity}.`,
        sourceId: missingDocument.id,
        taxYear: taxReturn.taxYear,
        jurisdiction: taxReturn.jurisdiction,
      }),
    );
  }

  for (const issue of data.taxIssues.filter((item) => item.taxReturnId === returnId)) {
    packets.push(
      sourcePacketItem({
        id: issue.id,
        sourceType: "issue",
        label: issue.title,
        excerpt: `${issue.description} Recommended action: ${issue.recommendedAction}. Status ${issue.status}; risk ${issue.riskLevel}; blocker ${issue.blocker}.`,
        sourceId: issue.id,
        taxYear: taxReturn.taxYear,
        jurisdiction: taxReturn.jurisdiction,
      }),
    );
  }

  for (const question of data.clientClarifications.filter((item) => item.taxReturnId === returnId)) {
    packets.push(
      sourcePacketItem({
        id: question.id,
        sourceType: "client_question",
        label: question.question,
        excerpt: question.answer ? `Answer: ${question.answer}` : `Question status: ${question.status}`,
        sourceId: question.id,
        sourceDate: question.answeredAt,
        taxYear: taxReturn.taxYear,
        jurisdiction: taxReturn.jurisdiction,
      }),
    );
  }

  for (const workpaper of data.workpapers.filter((item) => item.taxReturnId === returnId)) {
    packets.push(
      sourcePacketItem({
        id: workpaper.id,
        sourceType: "workpaper",
        label: workpaper.title,
        excerpt: workpaper.body,
        sourceId: workpaper.id,
        taxYear: taxReturn.taxYear,
        jurisdiction: taxReturn.jurisdiction,
        authorityTier: "FIRM_WORK_PRODUCT",
        evidenceRefIds: workpaper.evidenceRefIds,
      }),
    );
  }

  const readiness = scoreReadiness(data, returnId);
  const extension = scoreExtensionRisk(data, returnId);
  const gate = evaluateReviewGate(data, returnId, "READY_TO_FILE");
  packets.push(
    sourcePacketItem({
      id: `${returnId}-ready-to-file-gate`,
      sourceType: "review_gate",
      label: "Ready-to-file review gate",
      excerpt: `Pass: ${gate.pass}. Blockers: ${gate.blockers.join("; ") || "none"}. Readiness ${readiness.readinessScore}%. Extension risk ${extension.extensionRiskScore}%.`,
      sourceId: `${returnId}-ready-to-file-gate`,
      taxYear: taxReturn.taxYear,
      jurisdiction: taxReturn.jurisdiction,
      authorityTier: "FIRM_WORK_PRODUCT",
    }),
  );

  for (const citation of data.taxCitations) {
    packets.push(citationPacket(citation, data.taxAuthoritySources.find((source) => source.id === citation.sourceId)));
  }
  for (const source of data.taxAuthoritySources) {
    packets.push(authorityPacket(source));
  }

  return packets;
}

export function buildReturnFactGraph(returnId: string, sourcePacket: SourcePacketItem[], data: DocketData = readDocketData()): FactNode[] {
  const packetIdsBySource = new Map(sourcePacket.map((packet) => [packet.sourceId, packet.id]));
  return data.taxFacts
    .filter((fact) => fact.taxReturnId === returnId)
    .map((fact) => ({
      id: `fact-node-${fact.id}`,
      factType: fact.factType,
      label: fact.label,
      value: fact.value,
      status: fact.status,
      materiality: fact.materiality,
      taxYear: fact.taxYear,
      jurisdiction: fact.jurisdiction,
      evidenceRefIds: fact.evidenceRefs.map((evidence) => evidence.id),
      sourcePacketIds: [packetIdsBySource.get(fact.id)].filter((id): id is string => Boolean(id)),
      derivedFromFactIds: [],
      contradictsFactIds: data.contradictions
        .filter((contradiction) => contradiction.taxReturnId === returnId && contradiction.sourceIds.includes(fact.id))
        .map((contradiction) => contradiction.id),
      confidence: artifactConfidence(`${fact.label} confidence is derived from extraction confidence, evidence count, and review state.`, {
        overall: fact.confidence,
        sourceSupport: fact.evidenceRefs.length > 0 ? 0.9 : 0.25,
        retrievalConfidence: fact.confidence,
        reviewState: reviewStateFromStatus(fact.reviewStatus),
      }),
      reviewerState: reviewStateFromStatus(fact.reviewStatus),
    }));
}

export function searchReturnSourcePacket(returnId: string, query: string, data: DocketData = readDocketData()): SourcePacketItem[] {
  return searchPacketsByQuery(buildReturnSourcePacket(returnId, data), query);
}

function normalizeTaxSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bk[\s-]?1\b/g, " k1 ")
    .replace(/\b1099[\s-]?b\b/g, " 1099b ")
    .replace(/\b1099[\s-]?nec\b/g, " 1099nec ")
    .replace(/\b1099[\s-]?k\b/g, " 1099k ")
    .replace(/\b1095[\s-]?a\b/g, " 1095a ")
    .replace(/\btax[\s-]?lot\b/g, " taxlot ")
    .replace(/\bwash[\s-]?sale\b/g, " washsale ");
}

function expandSearchQuery(query: string): string {
  const normalized = normalizeTaxSearchText(query);
  const aliases: string[] = [];
  if (/\bk1\b|partnership|partner|schedule e/.test(normalized)) aliases.push("schedule e partnership s corporation estate trust k1 partner pass through");
  if (/1099b|broker|stock|capital|washsale/.test(normalized)) aliases.push("1099b form 8949 schedule d capital gain broker basis washsale investment");
  if (/crypto|digital asset|virtual currency|taxlot/.test(normalized)) aliases.push("digital assets virtual currency cryptocurrency capital gain form 8949 schedule d unsupported taxlot");
  if (/1095a|marketplace|premium|aca/.test(normalized)) aliases.push("1095a marketplace premium tax credit aca");
  if (/education|student|1098t|tuition/.test(normalized)) aliases.push("education credit student 1098t tuition");
  if (/1099r|retirement|pension|ira|distribution/.test(normalized)) aliases.push("retirement pension ira distribution 1099r");
  if (/resident|residency|domicile|state|california|texas/.test(normalized)) aliases.push("state residency domicile part year nonresident allocation");
  return [query, ...aliases].join(" ");
}

function searchPacketsByQuery(packets: SourcePacketItem[], query: string): SourcePacketItem[] {
  const terms = normalizeTaxSearchText(expandSearchQuery(query))
    .split(/\W+/)
    .filter((term) => (term.length > 2 || ["k1"].includes(term)) && !SEARCH_STOP_WORDS.has(term));
  if (terms.length === 0) return packets;
  return packets
    .map((packet) => {
      const haystack = normalizeTaxSearchText(`${packet.label} ${packet.excerpt}`);
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { packet, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.packet);
}

function filterReturnPackets(returnId: string, query: string, sourceTypes: SourcePacketItem["sourceType"][], data: DocketData = readDocketData()): SourcePacketItem[] {
  const packets = buildReturnSourcePacket(returnId, data).filter((packet) => sourceTypes.includes(packet.sourceType));
  return searchPacketsByQuery(packets, query);
}

export function searchTaxFacts(returnId: string, query: string, data: DocketData = readDocketData()): SourcePacketItem[] {
  return filterReturnPackets(returnId, query, ["tax_fact"], data);
}

export function searchDocuments(returnId: string, query: string, data: DocketData = readDocketData()): SourcePacketItem[] {
  return filterReturnPackets(returnId, query, ["document"], data);
}

export function searchIssues(returnId: string, query: string, data: DocketData = readDocketData()): SourcePacketItem[] {
  return filterReturnPackets(returnId, query, ["issue", "missing_document"], data);
}

export function searchWorkpapers(returnId: string, query: string, data: DocketData = readDocketData()): SourcePacketItem[] {
  return filterReturnPackets(returnId, query, ["workpaper"], data);
}

export function searchConversations(returnId: string, query: string, data: DocketData = readDocketData()): SourcePacketItem[] {
  return filterReturnPackets(returnId, query, ["conversation", "client_claim", "client_question"], data);
}

export function searchPriorYearPatterns(returnId: string, query: string, data: DocketData = readDocketData()): SourcePacketItem[] {
  return filterReturnPackets(returnId, query, ["prior_year_pattern"], data);
}

export function retrieveAuthority(topic: string, taxYear?: number | null, jurisdiction = "US", data: DocketData = readDocketData()): SourcePacketItem[] {
  const authorityPackets = [
    ...data.taxCitations.map((citation) => citationPacket(citation, data.taxAuthoritySources.find((source) => source.id === citation.sourceId))),
    ...data.taxAuthoritySources.map((source) => authorityPacket(source)),
  ].filter((packet) => {
    if (packet.jurisdiction && packet.jurisdiction !== jurisdiction) return false;
    if (taxYear && packet.taxYear && packet.taxYear !== taxYear) return false;
    return true;
  });
  return searchPacketsByQuery(authorityPackets, topic).slice(0, 8);
}

export function contentHashForEnvelope(input: Omit<ChatArtifactEnvelope, "immutableContentHash">): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function getClientFile(identifier: { returnId?: string; clientId?: string } | string, data: DocketData = readDocketData()) {
  const returnId = typeof identifier === "string"
    ? identifier
    : identifier.returnId ?? data.taxReturns.find((taxReturn) => taxReturn.clientId === identifier.clientId)?.id;
  if (!returnId) return null;
  const workbench = getReturnWorkbench(returnId, data);
  if (!workbench) return null;
  const sourcePacket = buildReturnSourcePacket(returnId, data);
  const factGraph = buildReturnFactGraph(returnId, sourcePacket, data);
  return { workbench, sourcePacket, factGraph };
}

export const getClientFileTool = getClientFile;
