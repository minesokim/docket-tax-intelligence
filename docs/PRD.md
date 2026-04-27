# Docket Foundation PRD Summary

The source PRD defines Docket as a tax intelligence operating system for tax firms. This repository implements the foundation release with Docket naming throughout.

## Foundation Goals

- Understand a full client tax file across documents, prior-year patterns, messages, transcripts, portal answers, staff notes, and reviewer decisions.
- Create source-backed tax facts and preserve evidence metadata.
- Detect missing documents, contradictions, deduction opportunities, red/yellow/green risk flags, readiness, and extension risk.
- Generate targeted client questions, reviewer-ready workpapers, and structured export packets.
- Require human review for material tax positions and filing readiness.
- Track consent, model runs, prompt versions, costs, knowledge snapshots, rule packages, and audit events.

## Seed Scenario

Miguel Sandoval has a 2024 Individual 1040 + Schedule C return with:

- Acme W-2
- Bluepeak 1099-NEC
- Stripe 1099-K
- Chase 1099-INT
- Q4 mileage log
- business expense summary
- prior-year return summary
- portal answer claiming about 85000 of freelance income
- meeting transcript mentioning a Tesla stock sale, CA to TX move, and ambiguous home office use

Expected findings include income mismatch, possible 1099-K/1099-NEC overlap, missing 1099-B, state residency issue, home office ambiguity, mileage substantiation issue, and high extension risk.
