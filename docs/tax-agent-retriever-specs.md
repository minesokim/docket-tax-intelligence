# Tax Agent Retriever Specs v0.1

This document turns the Harvey-style architecture into buildable retriever contracts. The runtime bet is model-driven tool use over a small set of strong retrievers.

## Shared Rules

Every retriever receives a shared `RetrieverContext` plus retriever-specific params.

Context fields:

- `firmId`
- `userId`
- `loadedClientId`
- `taxYear`
- `conversationId`
- `requestId`
- `originalPrompt`

Every retriever returns a typed result envelope:

- `evidence`: typed evidence items with source, content, citation, provenance, and confidence.
- `metadata`: query actually run, result count, truncation flag, latency, and typed errors.
- `gaps`: missing fields or unavailable evidence the synthesis layer should surface.
- `reliability`: overall reliability band.

Failure modes are typed:

- `EMPTY_RESULT`: the retriever queried correctly and found nothing.
- `FIELD_NOT_AVAILABLE`: the requested field or source does not exist in the data model yet.
- `RETRIEVAL_ERROR`: source outage, auth failure, invalid ID, or implementation failure.
- `USE_RESTRICTION_TRIGGERED`: a portfolio query would use tax return information for solicitation, marketing, upsell, or another prohibited Section 7216 purpose.

Rules:

- Retrievers are read-only.
- Retrievers never invent facts.
- Retrievers never silently fall back to a different query.
- Drafting, emailing, marking review status, creating workpapers, and sending client requests are actions, not retrieval.
- Synthesis writes prose. Retrievers return evidence.

## Retriever 1: Client-File Retriever

Name: `clientFile.retrieve`

Purpose: Given a client and topic, return the relevant subset of that client's structured facts, intake answers, documents, issues, prior conversations, prior returns, and workflow state.

Input:

```ts
type ClientFileRetrieverRequest = {
  context: RetrieverContext;
  clientId: string;
  topic?: string;
  taxYear?: number;
  evidenceTypes?: EvidenceType[];
  scope?: "summary" | "full" | "topic_focused";
  includeHistorical?: boolean;
};
```

Output highlights:

- client identity and one-paragraph profile summary
- structured facts
- intake answers
- document refs and extracted summaries
- open issues
- relevant conversation snippets
- prior-year summary
- readiness, extension risk, blocker count, review gate

Expected query patterns:

- `topic: "reconcile schedule c income"` returns NEC/K docs, gross receipts facts, intake estimates, and related issues.
- `topic: "residency CA to TX move"` returns residency facts, W-2 state lines, and move-date conversation snippets.
- `topic: "home office substantiation"` returns home-office intake, exclusive-use facts, and related docs.
- no topic returns the full case-file summary.

In scope:

- single-client structured facts
- single-client documents and issues
- missing-document signals
- unanswered clarifications
- topic-focused semantic filtering inside one client file

Out of scope:

- cross-client queries: use `portfolio.retrieve`
- external authority: use `authority.retrieve`
- reading exact content inside one document: use `documentContent.retrieve`
- firm-wide pattern matching: use `knowledgeGraph.retrieve`

Error handling:

- `EMPTY_RESULT`: valid client, no data on the topic.
- `FIELD_NOT_AVAILABLE`: requested evidence type is not implemented.
- `RETRIEVAL_ERROR`: invalid client ID or auth failure.

Latency budget:

- cached: 800ms
- first hit: 2000ms

Implementation notes:

- Cache aggressively per client per session.
- Build `profileSummary` once per client per day.
- Topic search should match issue descriptions, document classes, extracted text, conversation topics, and intake keys.

## Retriever 2: Authority Retriever

Name: `authority.retrieve`

Purpose: Given a tax topic or citation request, return authoritative snippets with full citations and authority ranking.

Input:

```ts
type AuthorityRetrieverRequest = {
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
```

Output highlights:

- ranked authority snippets
- canonical citation
- URL and full-text URL
- retrieved date
- relevance score
- authority confidence
- recency confidence
- freshness check

Expected query patterns:

- `OBBBA tip deduction qualified occupations`
- `home office exclusive use`
- citation-specific lookup for IRC Section 199A
- California part-year residency authority

In scope:

- IRC
- Treasury regulations
- IRS publications and form instructions
- IRS notices, news releases, and fact sheets
- Tax Court and federal cases when indexed
- state tax authority when indexed

Out of scope:

- client facts
- firm patterns
- uploaded document content
- internal firm policy

Error handling:

- `EMPTY_RESULT`: no relevant authority found.
- `FIELD_NOT_AVAILABLE`: requested authority corpus is not indexed.
- `RETRIEVAL_ERROR`: source outage; return cached authority if available with staleness flag.

Critical requirements:

- Apply authority ranking before synthesis.
- Statute ranks above regulations; regulations rank above sub-regulatory guidance; court precedent ranks above nonprecedential guidance.
- Query expansion is internal to the retriever. The model passes one query; the retriever fans out across the right corpora.

Latency budget:

- first hit: 2-4 seconds

## Retriever 3: Portfolio Retriever

Name: `portfolio.retrieve`

Purpose: Given a filter expression, return matching clients with supporting evidence. This is the structural replacement for registry-only portfolio answers.

Input:

```ts
type PortfolioRetrieverRequest = {
  context: RetrieverContext;
  filterExpression: FilterExpression;
  ranking?: {
    by: string;
    direction: "asc" | "desc";
  };
  limit?: number;
  includeEvidence?: boolean;
};
```

Filter language:

```ts
type FilterExpression =
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
```

Expected query patterns:

- "Who has FBAR exposure?" becomes an OR filter over foreign-account intake, Form 8938, FinCEN 114, and conversation mentions.
- "Audit risk going into filing" becomes a composite risk filter.
- "Missing 8867 due diligence" becomes a credit-eligibility signal plus missing/absent 8867 status.
- "CA part-year and Schedule C over $50K" becomes an AND filter over residency and income threshold.
- "Highest income clients" becomes ranking by income field.

In scope:

- cross-client structured filters
- Boolean composition
- ranking and limits
- evidence-supported matches
- zero-result responses

Out of scope:

- authority retrieval
- single-client deep file review
- action execution
- filters that violate Section 7216 use restrictions

Error handling:

- `EMPTY_RESULT`: filter evaluated correctly, no clients matched.
- `FIELD_NOT_AVAILABLE`: one or more referenced fields are not in the data model.
- `USE_RESTRICTION_TRIGGERED`: financial attributes were requested for solicitation, marketing, upsell, or another prohibited use.
- `RETRIEVAL_ERROR`: normal failures.

Critical requirements:

- Never return the default queue for a specific filter request.
- Echo the filter actually evaluated.
- Return unavailable fields separately from empty results.
- Run the Section 7216 use-restriction pre-check before evaluating financial filters.

Latency budget:

- indexed fields: 1500ms
- text search across conversations: 4000ms

## Retriever 4: Conversation Retriever

Name: `conversation.retrieve`

Purpose: Search across client communications, current thread, and firm-wide conversation patterns.

Input:

```ts
type ConversationRetrieverRequest = {
  context: RetrieverContext;
  scope: "current_thread" | "client_history" | "firm_wide";
  clientId?: string;
  query?: string;
  topic?: string;
  dateRange?: { from: string; to: string };
  participantFilter?: Array<"client" | "preparer" | "ai">;
  maxResults?: number;
};
```

Output highlights:

- message snippets
- timestamp
- participant
- client ID
- topic tags
- surrounding thread context
- relevance score

Expected query patterns:

- "What did Miguel say about the stock sale?"
- "Catch me up on the last two weeks of conversations."
- "What did we decide about residency?"
- "Have any clients mentioned offshore accounts?"

In scope:

- full-text message search
- topic-tagged retrieval
- date filters
- firm-wide conversation aggregation

Out of scope:

- structured client facts
- document content
- unprocessed voice transcripts

Error handling:

- `EMPTY_RESULT`: no matching messages.
- `FIELD_NOT_AVAILABLE`: requested transcript source not processed.
- `RETRIEVAL_ERROR`: normal failures.

Latency budget:

- current thread: 1000ms
- client history: 2500ms
- firm-wide: 5000ms

## Retriever 5: Knowledge-Graph Retriever

Name: `knowledgeGraph.retrieve`

Purpose: Pattern-match the current case against prior cases, issue patterns, templates, and outcomes.

Input:

```ts
type KnowledgeGraphRetrieverRequest = {
  context: RetrieverContext;
  queryType: "similar_clients" | "issue_pattern" | "reconciliation_template" | "outcome_history";
  currentFacts?: FactReference[];
  currentClientId?: string;
  topic?: string;
  excludeClientId?: string;
  maxResults?: number;
};
```

Expected query patterns:

- "Which clients have similar fact patterns to Miguel?"
- "Have we seen this 1099-K vs NEC overlap before?"
- "What's the workpaper template for Schedule C reconciliation?"
- "How was a similar audit resolved?"

In scope:

- similar-client matching
- reusable issue patterns
- reconciliation templates
- prior outcome history when tracked

Out of scope:

- authority lookup
- single-client deep retrieval
- document inspection

Error handling:

- `EMPTY_RESULT`: no patterns match.
- `FIELD_NOT_AVAILABLE`: requested pattern type is not built yet.
- `RETRIEVAL_ERROR`: normal failures.

Latency budget:

- first hit: 1500ms

Implementation notes:

- Start with similar-client matching across return type, key issues, key documents, and tags.
- Add workpaper templates as a small library.
- Outcome history will remain partial until Docket tracks audit/resolution outcomes.

## Retriever 6: Document-Content Retriever

Name: `documentContent.retrieve`

Purpose: Read inside one uploaded document and extract summaries, fields, structured maps, or verbatim passages.

Input:

```ts
type DocumentContentRetrieverRequest = {
  context: RetrieverContext;
  documentId: string;
  query?: string;
  extractType?: "summary" | "specific_field" | "verbatim_passage" | "structured_fields";
  fieldName?: string;
  pageRange?: { from: number; to: number };
};
```

Expected query patterns:

- "Open Miguel's W-2. What's in Box 12 code D?"
- "What does Bluepeak's 1099-NEC say about state withholding?"
- "From Ben's K-1, what's his at-risk amount entering 2024?"
- "Pull the largest Stripe monthly gross amount."

In scope:

- structured tax document extraction
- exact field lookup
- verbatim passages with page references when available
- structured field maps for parsed documents

Out of scope:

- searching across many documents
- authority retrieval
- document modification
- OCR of unprocessed documents

Error handling:

- `EMPTY_RESULT`: no matching content in the document.
- `FIELD_NOT_AVAILABLE`: extraction for that document type or field is not implemented, or OCR is incomplete.
- `RETRIEVAL_ERROR`: invalid document ID or auth failure.

Latency budget:

- cached: 500ms
- first hit: 3000ms

Implementation notes:

- Start with W-2, 1099-NEC, 1099-K, 1099-INT, 1099-DIV, 1099-B, 1095-A, 1098, and K-1.
- Fall back to OCR plus semantic search for less common document types.
- Exact field extraction should cite the document, field name, and page/line-style locator when available.

## Orchestrator Usage

The orchestrator stays small:

1. Run deterministic pre-classifier.
2. If refusal required, route directly to refusal synthesis.
3. Otherwise give the model the prompt, context, retriever catalog, and retrieval budget.
4. Let the model call retrievers for up to 4 rounds / 8 calls.
5. Pass results to synthesis.
6. Run output validator.

Pseudocode:

```ts
async function orchestrateTaxAgent(prompt: string, context: RetrieverContext) {
  const preflight = classifyAndCheckRefusals(prompt, context);
  if (preflight.refusalRequired) return synthesizeRefusal(preflight);

  const loop = new ToolUseLoop({
    tools: TAX_RETRIEVER_CATALOG,
    maxIterations: 4,
    maxToolCalls: 8,
    prompt,
    context,
  });

  const draft = await loop.run();
  return validateTaxAgentOutput(draft);
}
```

## Build Order

1. `clientFile.retrieve`
2. `authority.retrieve`
3. model-driven synthesis loop over those two retrievers
4. `portfolio.retrieve` with Section 7216 use-restriction pre-check
5. `conversation.retrieve`
6. `documentContent.retrieve`
7. `knowledgeGraph.retrieve`
8. output validator and full prompt eval battery
