# 0001 - Docket Foundation Scaffold

## Decision

Use a TypeScript monorepo with Next.js, Fastify, deterministic domain engines, seed data, and production-shaped adapter boundaries.

## Rationale

Docket must demonstrate tax intelligence behavior without requiring external AI, OCR, IRS, tax software, payment, or e-sign credentials. The foundation therefore keeps workflows local and deterministic while modeling the interfaces, audit events, consent records, and review gates needed for production.

## Consequences

- The UI is fully navigable from seed data.
- API workflow routes return auditable results but do not persist between requests.
- The database schema is production-shaped, but local demo does not require Postgres.
- E-file remains explicitly stubbed.
