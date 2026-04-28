# Docket Architecture

## Runtime

- `apps/web`: Next.js App Router firm app and client portal.
- `apps/api`: Fastify read-model and workflow routes.
- `apps/worker`: background job registration shell for production queues.
- `packages/domain`: canonical TypeScript schemas, seed data, deterministic engines, and selectors.
- `packages/jobs`: queue abstraction, job catalog, default deterministic workflow handlers, and job status records.

## Engine Packages

The packages under `packages/` mirror Docket's core engines. In the foundation release, most facades re-export deterministic implementations from `@docket/domain` so the system remains small and testable while preserving production ownership boundaries.

## Local AI Providers

`@docket/ai` keeps `mock` as the default provider. A local-only `claude_code_cli` provider is available for development and workstation demos when both flags are set:

- `DOCKET_AI_PROVIDER=claude_code_cli`
- `DOCKET_ENABLE_LOCAL_AI_CLI=true`

Claude Code CLI authentication is owned by the local user. Docket does not store a Claude API key; `pnpm setup:claude` or the Settings page **Open Claude auth** button launches Claude Code so its browser login flow can run. CLI output is still recorded as AI-prepared work and remains subject to consent checks, evidence requirements, knowledge snapshots, reviewer approval, and ready-to-file gates.

## Workflow Jobs

`@docket/jobs` provides the production-shaped orchestration boundary. It defines stable job names for document extraction, client context reconciliation, AI prep, reviewer checks, client clarifications, workpapers, export packets, knowledge sync, evals, and review lifecycle actions. The foundation uses `InMemoryDocketJobQueue`; it records queued, running, succeeded, blocked, and failed states and captures audit event IDs produced by each workflow.

The queue fails closed. A blocked review gate becomes a `BLOCKED` job, and thrown workflow errors become `FAILED` jobs with redacted error messages. Redis, Inngest, or Temporal can replace the in-memory queue behind the same job names later.

The API exposes this control plane through:

- `GET /api/jobs/catalog`
- `POST /api/jobs`
- `POST /api/returns/:returnId/jobs/:jobName`
- `POST /api/jobs/run-next`
- `POST /api/jobs/run-all`
- `GET /api/jobs`
- `GET /api/jobs/:id`

## Tax Knowledge Source Hierarchy

`@docket/tax-knowledge` owns the ranked source registry that determines which sources can support trusted tax conclusions and which sources are only risk or community signals. The registry is intentionally not one flat vector soup. Docket now exposes the same six-tier hierarchy in code and in the Knowledge Admin screen:

1. **Primary authoritative ground truth**: Internal Revenue Code / 26 USC through OLRC, govinfo, law.gov-style structured access, and Cornell LII mirrors; Treasury Regulations / 26 CFR through eCFR and the eCFR API; IRS Direct File / OpenFile fact graph; IRS Internal Revenue Bulletin; and IRS forms, instructions, and publications.
2. **Authoritative interpretation**: U.S. Tax Court opinions and ef-cms patterns, Federal tax court decisions through CourtListener/PACER/court channels, IRS Written Determinations including Chief Counsel Advice and PLRs, and state tax authorities such as California FTB and New York DTF.
3. **Practitioner risk and enforcement**: IRS OPR Disciplinary Actions, OPR Final Agency Decisions, IRS e-News for Tax Professionals, DOJ Tax Division press releases, and TIGTA reports. This is the Antonio "name-and-shame" layer for compliance risk, not substantive tax conclusions.
4. **Curated practitioner sources**: TheTaxBook, Parker Tax Publishing, Spidell, NATP, and NAEA materials. These are useful secondary practitioner references, but they do not outrank official sources.
5. **Community signal**: TaxProTalk, r/taxpros, NAEA WebBoard, Drake Software Forum, TaxAct Pro Community, CSEA chapter networks, and TaxTwitter/X tags such as `#TaxTwitter` and `#EATax`. These only create candidate research tasks and must pass human review before anything reaches the graph.
6. **Premium licensed**: Thomson Reuters Checkpoint, Bloomberg Tax, and CCH AnswerConnect for later licensed editorial research.

Supplemental registry entries such as Federal Register/Treasury Decisions, IRS MeF schemas, the Internal Revenue Manual, Circular 230, and IRS Criminal Investigation releases remain available to Docket workflows, but the product-facing source hierarchy follows the six tiers above.

Only sources marked `canSupportTrustedTaxConclusion` may support a trusted tax answer, and even those must match tax year, jurisdiction, effective date, freshness, and review status. Forums, newsletters, enforcement releases, and social sources never write directly into the authority graph. They create candidate research tasks and risk signals that require official-source backing and human review.

## Persistence

`infra/migrations/0001_initial.sql` defines the PostgreSQL-compatible schema for firms, users, clients, engagements, returns, documents, evidence, tax facts, claims, conversations, issues, opportunities, knowledge, AI runs, consent, audit, policies, signatures, exports, and post-filing events.

`@docket/db` owns the persistence boundary. The current runtime uses `JsonFileDocketRepository`, which stores the mutable demo state at `.docket/state.json` and keeps workflow actions durable across page refreshes. Tests can swap in `InMemoryDocketRepository` through `setDocketRepository`, and `PostgresDocketRepository` is scaffolded as the next adapter target once table mappers are wired to the migration schema.

`PostgresDocketRepository` now maps Docket collections to the migration schema through `DocketTableSpec` definitions. Operational records such as returns, documents, evidence, facts, issues, consent, audit, signatures, and export packets use relational tables. Volatile model-risk and evaluation objects such as benchmark cases, prompt versions, provider records, reviewer corrections, and subprocessor records use document-style tables with `payload jsonb` so their shapes can evolve without blocking the foundation.

This means engines and UI actions call the repository contract instead of reading or writing the state file directly. The local runtime remains file-backed until a concrete Postgres driver is supplied.

The Postgres path is now wired behind environment flags:

- `DOCKET_PERSISTENCE=file` keeps the app on the local file repository.
- `DOCKET_PERSISTENCE=postgres` plus `DOCKET_ENABLE_POSTGRES=true` creates an async `pg` pool-backed repository.
- The synchronous app runtime intentionally rejects Postgres mode until the calling surface opts into the async repository path.

Postgres setup commands:

- `pnpm --filter @docket/db migrate` applies `infra/migrations/0001_initial.sql` and records it in `docket_schema_migrations`.
- `pnpm --filter @docket/domain seed:postgres` resets the async Postgres repository with the Miguel Sandoval seed data.

## Safety Boundaries

- Client documents and messages are untrusted input.
- AI provider routing defaults to mock and blocks real external calls unless explicitly enabled.
- Consent grant and revoke actions are persisted workflows and create audit events.
- Required consent is checked before affected AI workflows run; missing consent returns an audited blocked workflow state.
- RBAC checks fail closed for AI prep, tax fact approval, issue resolution, export packet generation, ready-for-signature, and ready-to-file progression.
- Enabled firm policies are evaluated as structured review inputs; hard `BLOCK` policies become ready-to-file blockers.
- Material tax facts require evidence or human override.
- Tax conclusions must be attached to a knowledge snapshot.
- Generated export packets are marked `STALE_DUE_TO_CHANGE` when downstream facts, issues, answers, documents, signatures, or consent records change.
- The Return Workbench includes a trust checklist and audit summary so reviewers can inspect consent, evidence, approvals, policy blockers, knowledge freshness, signature status, export freshness, prompt-injection flags, and audit coverage in one place.
- TaxPro Bench produces per-case deterministic results, false-clearance cases, blocking-case counts, and prompt-injection/unsupported-area pass checks.
- Ready-to-file is a stubbed status and never submits to the IRS.
