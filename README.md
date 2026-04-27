# Docket Tax Intelligence Platform

Docket is an AI-native tax intelligence foundation for tax firms. The foundation release is production-shaped: modular TypeScript packages, Next.js firm and portal surfaces, a Fastify API, seed data, typed domain engines, audit events, consent gates, review gates, and TaxPro Bench eval fixtures.

The core rule is simple: AI prepares, explains, flags, drafts, and recommends; humans approve material tax positions and filing readiness.

## What Is Included

- Firm dashboard with Command Center, Client 360, Return Workbench, Documents, Conversations, Knowledge, Evals, and Settings.
- Client portal with adaptive checklist, missing document requests, clarifications, document upload placeholder, consent, and signature status.
- Miguel Sandoval 2024 seed scenario with W-2, 1099-NEC, 1099-K, 1099-INT, mileage log, business expense summary, prior-year return summary, portal answer, and meeting transcript.
- Domain engines for document extraction, context reconciliation, tax fact graph confidence, risk/readiness/extension scoring, firm policy checks, review gates, consent gates, export packets, prompt injection checks, and evals.
- Repository-backed local persistence via `@docket/db`, with file, memory-test, and driver-based Postgres adapters plus table specs.
- Workflow orchestration via `@docket/jobs`, with an in-memory queue, production-shaped job names, blocked/failed/succeeded states, and audit event tracking.
- Consent grant/revoke workflows that mutate consent records and create audit events.
- RBAC enforcement for AI prep, fact approval, issue resolution, export packets, ready-for-signature, and ready-to-file actions.
- Return-level trust checklist with consent, evidence, review, firm policy, knowledge, signature, export freshness, prompt-injection, and audit coverage status.
- TaxPro Bench per-case evaluation results with pass counts, blocking-case counts, false-clearance cases, and prompt-injection/unsupported-area checks.
- Production-shaped adapter interfaces for AI, OCR, Meet/Zoom, IRS transcripts, tax software export, e-file, payment, and e-sign.

## Commands

```bash
pnpm install
pnpm dev:web
pnpm dev:api
pnpm setup:claude
pnpm typecheck
pnpm test
pnpm build
```

Local persistence defaults to `.docket/state.json`. Postgres is opt-in for async workers/services with:

```bash
DOCKET_PERSISTENCE=postgres
DOCKET_ENABLE_POSTGRES=true
DATABASE_URL=postgres://postgres:postgres@localhost:5432/docket
```

Then initialize and seed the database:

```bash
pnpm --filter @docket/db migrate
pnpm --filter @docket/domain seed:postgres
```

## Local Claude Code CLI Provider

Docket can use Claude Code CLI as a local-only AI provider for development and workstation demos. This avoids storing a Docket-managed Claude API key, but it still requires the local user to authenticate Claude Code.

Run browser auth:

```bash
pnpm setup:claude
```

Then enable the provider:

```bash
DOCKET_AI_PROVIDER=claude_code_cli
DOCKET_ENABLE_LOCAL_AI_CLI=true
DOCKET_CLAUDE_CODE_CLI_PATH=claude
```

The Settings page also includes an **Open Claude auth** button that launches the same local flow. Claude output remains AI-prepared work: Docket still requires evidence, knowledge snapshots, reviewer approval, and ready-to-file gates.

Workflow jobs can be run through the API control plane:

```bash
curl -X POST http://localhost:4000/api/returns/return-miguel-2024/jobs/ai.run-prep-workflow \
  -H 'content-type: application/json' \
  -d '{"runImmediately":true}'
curl http://localhost:4000/api/jobs
```

## Demo Flow

1. Open `/dashboard/command-center`.
2. Open Miguel Sandoval from Clients or the active return card.
3. Open `/dashboard/returns/return-miguel-2024/workbench`.
4. Review the red income mismatch, missing 1099-B, state residency issue, home office ambiguity, mileage substantiation issue, readiness score, and extension risk.
5. Open `/portal/returns/return-miguel-2024` to see the client checklist and targeted clarification questions.
6. Return to the workbench and review tax facts, evidence badges, workpapers, trust checklist, firm policy checks, review gates, export packet, and audit trail.

## Architecture

```text
apps/
  web/      Next.js firm app and client portal
  api/      Fastify read models and workflow routes
  worker/   background job registration shell
packages/
  domain/                    typed models, seed data, engines, selectors
  ai/                        model router, mock provider defaults
  audit/                     audit/redaction rules
  tax-fact-graph/            evidence and confidence facade
  client-context/            claims, contradictions, missing docs
  document-intelligence/     extraction pipeline facade
  conversation-intelligence/ transcript/message insight facade
  tax-knowledge/             authority ranking and sync facade
  ea-brain/                  EA reasoning protocol facade
  tax-engine/                deterministic tax scope matrix
  risk-engine/               readiness, extension, review gates
  consent/                   consent checks
  security/                  RBAC, PII, prompt injection helpers
  evals/                     TaxPro Bench facade
  jobs/                      workflow queue and job handlers
  db/                        table specs, migration pointer, repository boundary
infra/
  migrations/0001_initial.sql
```

## Safety Defaults

- No external AI calls by default.
- No real e-file submission.
- No PII in logs.
- Every write workflow returns audit events.
- AI workflows return an audited blocked state when required consent is missing or revoked.
- Every material tax fact requires evidence or human override.
- Ready-to-file is blocked by red flags, missing approvals, missing Form 8879, stale knowledge, open blocking issues, or enabled firm policy blockers.
- Export packets are marked stale when material facts, client answers, issues, documents, consent, or signatures change after generation.
