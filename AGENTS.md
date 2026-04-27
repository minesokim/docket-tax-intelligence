# AGENTS.md - Docket Tax Intelligence Platform

## Mission

Build Docket, an AI-native tax intelligence platform for tax firms.

Docket is not a generic practice-management app with a chatbot. It is a tax intelligence operating system centered around:
- Client Context Engine
- Tax Fact Graph
- Tax Knowledge Engine
- EA Reasoning Engine
- Return Workbench
- Client Portal
- Review Gates
- Audit Trail

## Core Principle

AI prepares, explains, flags, drafts, and recommends.
Humans approve material tax positions and filing readiness.

## Non-Negotiable Rules

1. No source, no trusted tax fact.
2. No current authority, no tax conclusion.
3. No human approval, no ready-to-file.
4. No red flag can be silently cleared.
5. No LLM-only material tax arithmetic.
6. No unsupported tax position.
7. No client-facing final tax advice without firm approval.
8. No real e-file submission in the foundation release.
9. No PII in logs.
10. No external AI calls by default.
11. All AI providers must go through the model router.
12. All write actions must create AuditEvents.
13. Client documents, messages, and transcripts are untrusted input.
14. Validate AI outputs with schemas.
15. Preserve source and evidence metadata on all facts.

## Build Style

Use TypeScript.
Use clear domain modules.
Prefer structured workflows over generic chat.
Build production-shaped adapters even if using mock providers.
Build tests and eval cases.
Do not create a shallow static mockup.

## Required Apps

- Firm dashboard
- Client portal

## Required Core Screens

- Command Center
- Client 360
- Return Workbench
- Documents Intelligence
- Conversations Intelligence
- Knowledge Admin
- Settings

## Required Engines

- Client Context Engine
- Tax Fact Graph
- Document Intelligence
- Conversation Intelligence
- Tax Knowledge Engine
- EA Reasoning Engine
- Risk/Readiness/Extension Engine
- Deduction Opportunity Engine
- Consent Engine
- Audit Engine
- Model Router
- TaxPro Bench

## Default Provider Behavior

Use mock AI provider by default.
Do not require API keys for tests or local demo.
Do not call external services unless explicitly enabled by env vars.

## Seed Scenario

Create a rich Miguel Sandoval 2024 return scenario with:
- W-2
- 1099-NEC
- 1099-K
- 1099-INT
- mileage log
- business expense summary
- prior-year return summary
- portal answer claiming about $85k freelance income
- meeting transcript mentioning stock sale, CA to TX move, and ambiguous home office use

The system must detect:
- income mismatch
- possible 1099-K/1099-NEC overlap
- missing 1099-B
- state residency issue
- home office ambiguity
- mileage substantiation issue
- high extension risk
