import type { SourcePacketItem } from "@docket/domain";

export type TaxAgentScope = "research" | "client-file" | "portfolio" | "workflow" | "document" | "drafting" | "refusal";

export type TaxRetrieverId =
  | "client_file"
  | "authority"
  | "portfolio"
  | "conversation"
  | "knowledge_graph"
  | "document_content";

export type TaxRetrieverStatus = "hit" | "partial" | "miss" | "field_not_implemented" | "blocked";

export type TaxRetrieverReliability = "very_high" | "high" | "medium" | "low";

export type RetrieverErrorCode = "EMPTY_RESULT" | "FIELD_NOT_AVAILABLE" | "RETRIEVAL_ERROR" | "USE_RESTRICTION_TRIGGERED";

export type RetrieverContext = {
  firmId: string;
  userId: string;
  conversationId: string;
  requestId: string;
  loadedClientId?: string | null;
  taxYear?: number | null;
  originalPrompt?: string;
};

export type RetrieverError = {
  code: RetrieverErrorCode;
  message: string;
  field?: string;
  retriable: boolean;
};

export type RetrieverMetadata = {
  queryActuallyRun: string;
  resultCount: number;
  truncated: boolean;
  latencyMs: number;
  errors: RetrieverError[];
};

export type EvidenceCitation = {
  label: string;
  sourceId: string;
  sourceUrl?: string | null;
  locator?: string | null;
};

export type EvidenceProvenance = {
  sourceSystem: string;
  capturedAt?: string | null;
  capturedBy?: string | null;
  reviewStatus?: string | null;
};

export type EvidenceConfidence = {
  sourceReliability: TaxRetrieverReliability;
  retrievalConfidence: number;
  extractionConfidence?: number | null;
};

export type EvidenceItem = {
  id: string;
  source: {
    type: string;
    id: string;
    label: string;
  };
  content: string | number | boolean | Record<string, unknown> | null;
  citation: EvidenceCitation;
  provenance: EvidenceProvenance;
  confidence: EvidenceConfidence;
  sourcePacket?: SourcePacketItem;
};

export type BaseRetrieverResult = {
  retrieverId: TaxRetrieverId;
  status: TaxRetrieverStatus;
  evidence: EvidenceItem[];
  metadata: RetrieverMetadata;
  gaps: string[];
  reliability: TaxRetrieverReliability;
};

export type EvidenceType = string;

export type ClientFileRetrieverRequest = {
  context: RetrieverContext;
  clientId: string;
  topic?: string;
  taxYear?: number;
  evidenceTypes?: EvidenceType[];
  scope?: "summary" | "full" | "topic_focused";
  includeHistorical?: boolean;
};

export type ClientFileRetrieverResult = BaseRetrieverResult & {
  retrieverId: "client_file";
  client: {
    id: string;
    displayName: string;
    returnType: string;
    taxYear: number;
    profileSummary: string;
  } | null;
  workflowState?: {
    readinessScore: number;
    extensionRisk: number;
    blockersCount: number;
    reviewGateStatus: string;
  };
};

export type AuthorityType =
  | "irc"
  | "treas_reg"
  | "rev_proc"
  | "rev_rul"
  | "notice"
  | "pub"
  | "form_instructions"
  | "tax_court"
  | "federal_court"
  | "irs_news_release"
  | "obbba_provision"
  | "state_authority"
  | "treaty";

export type AuthorityRetrieverRequest = {
  context: RetrieverContext;
  query: string;
  authorityTypes?: AuthorityType[];
  jurisdiction?: "federal" | "state" | string;
  taxYear?: number;
  citationSpecific?: {
    type: AuthorityType;
    identifier: string;
  };
  recencyFilter?: "current" | "all" | { after: string };
  maxResults?: number;
};

export type AuthoritySnippet = {
  authorityType: AuthorityType;
  title: string;
  citation: string;
  url: string;
  retrievedAt: string;
  snippet: string;
  fullTextUrl: string;
  relevanceScore: number;
  authorityConfidence: TaxRetrieverReliability;
  recencyConfidence: "current" | "stale" | "unclear";
};

export type AuthorityRetrieverResult = BaseRetrieverResult & {
  retrieverId: "authority";
  results: AuthoritySnippet[];
  queryUsed: string;
  authorityRankingApplied: boolean;
  freshnessCheck: {
    mostRecentSourceDate: string | null;
    sourcesWithin90Days: number;
  };
};

export type FilterExpression =
  | { op: "and"; filters: FilterExpression[] }
  | { op: "or"; filters: FilterExpression[] }
  | { op: "not"; filter: FilterExpression }
  | { op: "field_present"; field: string }
  | { op: "field_absent"; field: string }
  | { op: "field_equals"; field: string; value: unknown }
  | { op: "field_gt"; field: string; value: number }
  | { op: "field_lt"; field: string; value: number }
  | { op: "field_contains"; field: string; value: string }
  | { op: "issue_open"; severity?: "red" | "yellow" | "green"; topic?: string }
  | { op: "document_present"; documentType: string }
  | { op: "document_absent"; documentType: string }
  | { op: "conversation_mentions"; topic: string }
  | { op: "behavioral_signal"; signal: string };

export type PortfolioRetrieverRequest = {
  context: RetrieverContext;
  filterExpression: FilterExpression;
  ranking?: {
    by: string;
    direction: "asc" | "desc";
  };
  limit?: number;
  includeEvidence?: boolean;
};

export type ClientMatch = {
  clientId: string;
  displayName: string;
  returnType: string;
  matchedFilterPath: string;
  evidence: EvidenceItem[];
  rankingValue: number | null;
};

export type PortfolioRetrieverResult = BaseRetrieverResult & {
  retrieverId: "portfolio";
  matches: ClientMatch[];
  filterEvaluated: FilterExpression;
  fieldsUnavailable: string[];
  totalClientsEvaluated: number;
};

export type ConversationRetrieverRequest = {
  context: RetrieverContext;
  scope: "current_thread" | "client_history" | "firm_wide";
  clientId?: string;
  query?: string;
  topic?: string;
  dateRange?: { from: string; to: string };
  participantFilter?: Array<"client" | "preparer" | "ai">;
  maxResults?: number;
};

export type ConversationSnippet = {
  conversationId: string;
  messageId: string;
  timestamp: string;
  participant: "client" | "preparer" | "ai" | "system";
  content: string;
  topicTags: string[];
  clientId: string | null;
  threadContext: string;
  relevanceScore: number;
};

export type ConversationRetrieverResult = BaseRetrieverResult & {
  retrieverId: "conversation";
  snippets: ConversationSnippet[];
};

export type FactReference = {
  type: string;
  value?: unknown;
  description?: string;
};

export type KnowledgeGraphRetrieverRequest = {
  context: RetrieverContext;
  queryType: "similar_clients" | "issue_pattern" | "reconciliation_template" | "outcome_history";
  currentFacts?: FactReference[];
  currentClientId?: string;
  topic?: string;
  excludeClientId?: string;
  maxResults?: number;
};

export type KnowledgeGraphMatch = {
  matchType: "similar_client" | "issue_pattern" | "template" | "outcome";
  matchScore: number;
  matchedClientId?: string;
  matchedFacts: string[];
  outcome?: {
    resolution: string;
    workpapersUsed: string[];
    timeToResolveDays: number;
  };
  templateContent?: string;
  description: string;
};

export type KnowledgeGraphRetrieverResult = BaseRetrieverResult & {
  retrieverId: "knowledge_graph";
  patterns: KnowledgeGraphMatch[];
};

export type DocumentContentRetrieverRequest = {
  context: RetrieverContext;
  documentId: string;
  query?: string;
  extractType?: "summary" | "specific_field" | "verbatim_passage" | "structured_fields";
  fieldName?: string;
  pageRange?: { from: number; to: number };
};

export type VerbatimPassage = {
  page: number;
  text: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  contextBefore: string;
  contextAfter: string;
};

export type DocumentContentRetrieverResult = BaseRetrieverResult & {
  retrieverId: "document_content";
  documentMetadata: {
    id: string;
    name: string;
    type: string;
    uploadDate: string;
    uploadedBy: string;
    pageCount: number | null;
  } | null;
  content: {
    extractedSummary?: string;
    specificFieldValue?: unknown;
    verbatimPassages?: VerbatimPassage[];
    structuredFields?: Record<string, unknown>;
  };
  confidence: {
    extractionConfidence: number;
    ocrConfidence?: number;
  };
};

export type TaxRetrieverRequest =
  | ClientFileRetrieverRequest
  | AuthorityRetrieverRequest
  | PortfolioRetrieverRequest
  | ConversationRetrieverRequest
  | KnowledgeGraphRetrieverRequest
  | DocumentContentRetrieverRequest;

export type TaxRetrieverResult =
  | ClientFileRetrieverResult
  | AuthorityRetrieverResult
  | PortfolioRetrieverResult
  | ConversationRetrieverResult
  | KnowledgeGraphRetrieverResult
  | DocumentContentRetrieverResult;

export type TaxRetrieverDefinition = {
  id: TaxRetrieverId;
  label: string;
  purpose: string;
  requiredParams: string[];
  optionalParams: string[];
  maxResultsDefault: number;
  latencyBudgetMs: {
    cached?: number;
    firstHit: number;
    broadSearch?: number;
  };
};

export const TAX_RETRIEVER_CATALOG: TaxRetrieverDefinition[] = [
  {
    id: "client_file",
    label: "Client-file retriever",
    purpose: "Retrieve relevant structured facts, intake answers, documents, issues, prior conversations, prior returns, and workflow state from one client file.",
    requiredParams: ["context", "clientId"],
    optionalParams: ["topic", "taxYear", "evidenceTypes", "scope", "includeHistorical"],
    maxResultsDefault: 12,
    latencyBudgetMs: { cached: 800, firstHit: 2000 },
  },
  {
    id: "authority",
    label: "Authority retriever",
    purpose: "Retrieve tax law and administrative authority with canonical citation, authority ranking, relevance score, and freshness metadata.",
    requiredParams: ["context", "query"],
    optionalParams: ["authorityTypes", "jurisdiction", "taxYear", "citationSpecific", "recencyFilter", "maxResults"],
    maxResultsDefault: 6,
    latencyBudgetMs: { firstHit: 4000 },
  },
  {
    id: "portfolio",
    label: "Portfolio retriever",
    purpose: "Evaluate source-backed cross-client filters, ranking clauses, issue status, document presence, text-search clauses, and safe zero-result behavior.",
    requiredParams: ["context", "filterExpression"],
    optionalParams: ["ranking", "limit", "includeEvidence"],
    maxResultsDefault: 50,
    latencyBudgetMs: { cached: 1500, firstHit: 4000, broadSearch: 4000 },
  },
  {
    id: "conversation",
    label: "Conversation retriever",
    purpose: "Search current thread, client history, or firm-wide conversations with timestamps, participants, topic tags, and surrounding context.",
    requiredParams: ["context", "scope"],
    optionalParams: ["clientId", "query", "topic", "dateRange", "participantFilter", "maxResults"],
    maxResultsDefault: 20,
    latencyBudgetMs: { cached: 1000, firstHit: 2500, broadSearch: 5000 },
  },
  {
    id: "knowledge_graph",
    label: "Knowledge-graph retriever",
    purpose: "Find similar clients, recurring issue patterns, reconciliation templates, and prior outcome history from Docket-internal firm knowledge.",
    requiredParams: ["context", "queryType"],
    optionalParams: ["currentFacts", "currentClientId", "topic", "excludeClientId", "maxResults"],
    maxResultsDefault: 5,
    latencyBudgetMs: { firstHit: 1500 },
  },
  {
    id: "document_content",
    label: "Document-content retriever",
    purpose: "Inspect one uploaded document for summaries, specific fields, structured fields, or verbatim passages with page/line-style provenance when available.",
    requiredParams: ["context", "documentId"],
    optionalParams: ["query", "extractType", "fieldName", "pageRange"],
    maxResultsDefault: 8,
    latencyBudgetMs: { cached: 500, firstHit: 3000 },
  },
];
