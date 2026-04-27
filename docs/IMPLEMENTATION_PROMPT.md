# Implementation Prompt

Build and maintain Docket as a production-shaped tax intelligence platform.

Use the PRD and `AGENTS.md` as binding instructions. Do not build a shallow static mockup. Keep the core workflows deterministic and testable by default, with mock AI and adapter interfaces for external services.

Required checks before completion:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Manual demo starts at `/dashboard/command-center` and continues through Miguel Sandoval's Client 360, Return Workbench, portal checklist, workpapers, export packet, and audit trail.
