# Harvey-Style Tax Agent Architecture

Docket should follow the Harvey pattern for the next production architecture:

> Constrain the surface, free the reasoning.

The model should be allowed to decide what to retrieve and how to synthesize, but the product must strictly control refusal gates, retriever boundaries, citation provenance, and output validation.

This replaces the idea of a heavyweight ontology-constrained planner as the immediate architecture. The evidence ontology remains useful as vocabulary and backlog, but not as the runtime brain.

## Product Bet

Docket should feel like a senior tax associate with safe tools:

- It answers allowed tax questions directly.
- It retrieves from known tax and client sources.
- It cites what it uses.
- It names gaps without inventing facts.
- It refuses regulated or unsafe requests before retrieval.

The product should not depend on registering every possible user phrasing in advance.

## Runtime Layers

### 1. Deterministic Pre-Classifier

Runs before model retrieval.

Responsibilities:

- Detect refusal-required requests.
- Detect scope: research, client-file, portfolio, workflow, document, drafting.
- Preserve loaded-client context only when the user asks a single-client question.
- Prevent portfolio questions from being hijacked by a loaded client.

Refusal triggers include:

- Section 7216 disclosure: personal email export, unauthorized third-party disclosure.
- Section 7216 use: marketing, solicitation, upsell ranking from tax return information.
- Section 6103 / PII: full SSN display or unnecessary taxpayer identifying information.
- Unauthorized practice of law: contract drafting, Tax Court pleadings.
- Investment advice: investment selection or portfolio allocation.
- Scope mismatch: return-generation, filing approval, or unsupported regulated work.

If a refusal trigger fires, route to refusal synthesis with the relevant safe alternative. Do not run retrievers first.

### 2. Model-Driven Tool-Use Loop

The model receives:

- User prompt.
- Conversation context.
- Current client context, if any.
- Retriever catalog.
- Retrieval budget.
- Product guardrails.

The model chooses retrievers and query parameters. The orchestrator runs the retrievers. The model may iterate up to a fixed budget, then synthesizes the answer.

Default budget:

- Up to 4 retrieval rounds.
- Up to 8 total retriever calls.
- Up to 30 source snippets in the final synthesis packet.

### 3. Six Strong Retrievers

Docket should ship six retrievers first. Do not add more until these are strong.

#### Client-File Retriever

Purpose: retrieve relevant evidence from one client file.

Sources:

- structured return facts
- source documents
- open issues
- missing documents
- workpapers
- prior-year patterns
- client claims
- review gates

Use cases:

- "Confirm Miguel's 1099-NEC line."
- "What blocks Priya from filing?"
- "Does Ben's K-1 support at-risk basis?"

#### Authority Retriever

Purpose: retrieve tax law and administrative authority.

Sources:

- IRC
- Treasury regulations
- IRS publications
- form instructions
- IRS notices/news releases
- court cases when available
- state authority when available

Use cases:

- "Walk me through Section 199A for SSTBs."
- "What's required for FBAR?"
- "What authority controls home office exclusive use?"

#### Portfolio Retriever

Purpose: answer cross-client questions from the roster.

Query language should support:

- presence of fact
- absence of fact
- threshold on amount
- issue status/severity
- missing document status
- document class present
- tag/profile signal
- text search across client evidence
- AND / OR composition
- safe zero-result response

Use cases:

- "Who has open red issues?"
- "Which clients have FBAR exposure?"
- "Which files have CA residency questions and Schedule C income over $50K?"
- "Who's missing 8867 due diligence?"

The portfolio retriever must never return the default queue for a specific filter request. If it cannot run the filter, it returns a typed no-signal or field-unavailable result.

#### Conversation Retriever

Purpose: search client and firm conversations.

Sources:

- client messages
- meeting transcripts
- prior chat turns
- staff notes
- cross-client topic mentions

Use cases:

- "Miguel mentioned a Tesla sale. Where?"
- "Who said they moved states?"
- "Have any clients mentioned foreign accounts?"

#### Knowledge-Graph Retriever

Purpose: find patterns across firm history.

Sources:

- recurring issues
- similar fact patterns
- prior workpapers
- issue templates
- reviewer decisions

Use cases:

- "Which clients have similar fact patterns to Miguel?"
- "Have we seen this 1099-K/1099-NEC overlap before?"
- "What workpaper template should we reuse?"

#### Document-Content Retriever

Purpose: inspect one or more specific documents.

Sources:

- uploaded PDF/document text
- extracted fields
- page/line references when available

Use cases:

- "Quote the exact line on Ben's K-1."
- "What does Miguel's Stripe 1099-K say for January?"
- "Pull the W-2 Box 16 state wage line."

## Synthesis

The synthesis layer stays powerful. It should:

- answer the question directly;
- structure the response like a senior tax professional;
- cite retrieved sources only;
- distinguish facts, client claims, assumptions, and gaps;
- refuse only when the pre-classifier or output validator requires it;
- produce no-signal answers instead of unsupported dead ends.

Good answer shapes:

- client list with evidence;
- research memo with authority ranking;
- single-client status or issue memo;
- no-signal result with searched sources and data gaps;
- clarification when the requested deadline/entity/year is ambiguous;
- refusal with safe alternative.

## Output Validator

Runs after synthesis.

Checks:

- No citations to sources outside retrieved results.
- No client names from unsupported portfolio filters.
- No default queue for specific filter questions.
- No full SSNs or unnecessary PII.
- No Section 7216 disclosure/use violations.
- No unauthorized legal drafting or investment advice.
- Required caveats present for screening lists and no-signal results.

If validation fails, return a safe correction rather than the model output.

## Role Of The Evidence Ontology

The ontology in `docs/tax-evidence-ontology.md` is not the runtime planner yet.

Use it as:

- retriever vocabulary;
- data-model backlog;
- Antonio review artifact;
- evidence coverage checklist;
- future planner substrate if the product becomes compliance-first.

For now, the model can reason beyond the ontology, but retrievers can only return evidence that exists in Docket or authorized tax sources.

## Build Sequence

1. Harden pre-classifier and refusal routing.
2. Lock the six retriever interfaces.
3. Implement model-driven retriever selection with a retrieval budget.
4. Normalize retriever outputs into source-backed snippets.
5. Add output validation and citation enforcement.
6. Run the full prompt battery through the new loop.

## Success Criteria

- Specific portfolio questions never fall through to the generic queue.
- Novel allowed tax questions get useful no-signal, partial, or source-backed answers.
- Unsafe requests are refused before retrieval.
- Every substantive claim cites retrieved evidence.
- The product still feels intelligent, not mechanical.
