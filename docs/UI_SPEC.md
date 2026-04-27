# Docket UI Spec

## Firm App

Routes:

- `/dashboard/command-center`
- `/dashboard/clients`
- `/dashboard/clients/[clientId]`
- `/dashboard/returns`
- `/dashboard/returns/[returnId]/workbench`
- `/dashboard/documents`
- `/dashboard/conversations`
- `/dashboard/knowledge`
- `/dashboard/evals`
- `/dashboard/settings`

The firm app uses a left sidebar, top command/search bar, AI status indicator, knowledge freshness indicator, risk badges, readiness meters, evidence badges, review gates, and audit timeline.

## Client Portal

Routes:

- `/portal`
- `/portal/login`
- `/portal/client/[clientId]`
- `/portal/returns/[returnId]`
- `/portal/returns/[returnId]/checklist`
- `/portal/returns/[returnId]/clarifications`
- `/portal/returns/[returnId]/documents`
- `/portal/returns/[returnId]/signature`

The portal shows an adaptive checklist, targeted questions, upload placeholder, consent state, and signature/payment status placeholders.
