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

export type PortfolioFilterOperator = "present" | "missing" | "equals" | "contains" | "gt" | "gte" | "lt" | "lte";

export type PortfolioFilterClause = {
  field: string;
  operator: PortfolioFilterOperator;
  value?: string | number | boolean;
};

export type TaxRetrieverRequest = {
  query: string;
  taxYear?: number;
  jurisdiction?: string;
  clientId?: string;
  returnId?: string;
  documentIds?: string[];
  portfolioFilters?: PortfolioFilterClause[];
  maxResults?: number;
};

export type TaxRetrieverResult = {
  retrieverId: TaxRetrieverId;
  status: TaxRetrieverStatus;
  summary: string;
  sources: SourcePacketItem[];
  gaps: string[];
  reliability: TaxRetrieverReliability;
};

export type TaxRetrieverDefinition = {
  id: TaxRetrieverId;
  label: string;
  purpose: string;
  requiredParams: Array<keyof TaxRetrieverRequest>;
  optionalParams: Array<keyof TaxRetrieverRequest>;
  maxResultsDefault: number;
};

export const TAX_RETRIEVER_CATALOG: TaxRetrieverDefinition[] = [
  {
    id: "client_file",
    label: "Client-file retriever",
    purpose: "Retrieve relevant structured facts, documents, issues, missing documents, prior-year patterns, client claims, and review gates from one client file.",
    requiredParams: ["clientId", "query"],
    optionalParams: ["returnId", "taxYear", "maxResults"],
    maxResultsDefault: 12,
  },
  {
    id: "authority",
    label: "Authority retriever",
    purpose: "Retrieve tax law and administrative authority from IRC, Treasury regulations, IRS guidance, form instructions, publications, and available court/state sources.",
    requiredParams: ["query"],
    optionalParams: ["taxYear", "jurisdiction", "maxResults"],
    maxResultsDefault: 8,
  },
  {
    id: "portfolio",
    label: "Portfolio retriever",
    purpose: "Retrieve matching clients across the roster using source-backed filters, threshold clauses, issue status, document presence, missing documents, tags, and semantic text search.",
    requiredParams: ["query"],
    optionalParams: ["portfolioFilters", "taxYear", "jurisdiction", "maxResults"],
    maxResultsDefault: 12,
  },
  {
    id: "conversation",
    label: "Conversation retriever",
    purpose: "Search client messages, meeting transcripts, staff notes, prior chat turns, and cross-client topic mentions.",
    requiredParams: ["query"],
    optionalParams: ["clientId", "returnId", "taxYear", "maxResults"],
    maxResultsDefault: 10,
  },
  {
    id: "knowledge_graph",
    label: "Knowledge-graph retriever",
    purpose: "Find similar fact patterns, recurring issue patterns, reusable workpaper templates, and prior reviewer decisions.",
    requiredParams: ["query"],
    optionalParams: ["clientId", "returnId", "taxYear", "maxResults"],
    maxResultsDefault: 8,
  },
  {
    id: "document_content",
    label: "Document-content retriever",
    purpose: "Inspect specific uploaded documents and return extracted fields, quoted lines, and page/line references when available.",
    requiredParams: ["documentIds", "query"],
    optionalParams: ["clientId", "returnId", "taxYear", "maxResults"],
    maxResultsDefault: 8,
  },
];
