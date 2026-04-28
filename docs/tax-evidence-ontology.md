# Docket Evidence Ontology v0.1

This is the working ontology for Docket's evidence planner. It is a living document.

Every evidence type has:

- **Name**: the canonical token the planner may reference.
- **Category**: the evidence family it belongs to.
- **Description**: what the evidence means.
- **Query interface**: the function signature the retrieval orchestrator calls.
- **Availability status**: whether the field exists in the product today.
- **Reliability rating**: how trustworthy the returned evidence is.

The ontology is the only vocabulary the planner is allowed to compose evidence plans from. Anything not in the ontology either gets added as engineering work, or gets surfaced during synthesis as: "I would check X, but it is not in the data model."

## Status And Reliability

Status legend:

- `live`: field exists, is populated, and is queryable.
- `partial`: field exists, but coverage is sparse.
- `planned`: in the schema or backlog, but not yet implemented.
- `gap`: not in the schema; evidence type is acknowledged but uncomputable.

Reliability legend:

- `very_high`: primary statute, audited fact, or final computed return fact.
- `high`: extracted from an authoritative document or controlled workflow state.
- `medium`: inferred from intake, documents, or sparse structured data.
- `low`: derived from conversation or behavioral signals.

## Category 1: Return-Level Facts

These are structured tax facts computed onto the return. Every one is a candidate for retrieval and provenance tracking.

**1.1 gross_receipts_schedule_c** - Schedule C line 1 gross receipts for a specified tax year. Query: `getReturnFact(clientId, taxYear, "schedule_c_gross_receipts")`. Status: `live`. Reliability: `high` when reconciled, `medium` when from intake estimate.

**1.2 gross_receipts_components** - Breakdown of gross receipts by source: 1099-NEC, 1099-K, cash, invoiced. Query: `getReturnFactComponents(clientId, taxYear, "schedule_c_gross_receipts")`. Status: `live`. Reliability: `high`.

**1.3 schedule_c_expense_by_category** - Each Schedule C expense category with amount, substantiation status, and prior-year comparison. Query: `getScheduleCExpenses(clientId, taxYear)`. Status: `partial`. Reliability: `medium`.

**1.4 self_employment_tax** - SE tax computation for a return. Query: `getReturnFact(clientId, taxYear, "se_tax")`. Status: `planned`. Reliability: `very_high` once computed.

**1.5 estimated_tax_payments** - All estimated tax payments made in a tax year. Query: `getEstimatedPayments(clientId, taxYear)`. Status: `planned`. Reliability: `high`.

**1.6 wages_w2** - All W-2 wages reported. Query: `getReturnFact(clientId, taxYear, "wages_w2")`. Status: `live`. Reliability: `high`.

**1.7 interest_income** - Schedule B interest income. Query: `getReturnFact(clientId, taxYear, "interest_income")`. Status: `live`. Reliability: `high`.

**1.8 dividend_income** - Schedule B dividend income, ordinary and qualified. Query: `getReturnFact(clientId, taxYear, "dividend_income")`. Status: `planned`. Reliability: `high`.

**1.9 capital_gains_short_term** - Form 8949 / Schedule D short-term gains. Query: `getReturnFact(clientId, taxYear, "capital_gains_short_term")`. Status: `planned`. Reliability: `high`.

**1.10 capital_gains_long_term** - Long-term gains. Query: `getReturnFact(clientId, taxYear, "capital_gains_long_term")`. Status: `planned`. Reliability: `high`.

**1.11 retirement_distributions** - 1099-R reported distributions, taxable and nontaxable portions. Query: `getReturnFact(clientId, taxYear, "retirement_distributions")`. Status: `planned`. Reliability: `high`.

**1.12 social_security_income** - SSA-1099 benefits and taxable portion. Query: `getReturnFact(clientId, taxYear, "social_security_income")`. Status: `planned`. Reliability: `high`.

**1.13 rental_income_schedule_e** - Schedule E rental income by property. Query: `getRentalIncome(clientId, taxYear)`. Status: `partial`. Reliability: `high`.

**1.14 k1_passthrough_income** - K-1 income flow-through by entity. Query: `getK1Income(clientId, taxYear)`. Status: `partial`. Reliability: `high`.

**1.15 agi** - Adjusted Gross Income. Query: `getReturnFact(clientId, taxYear, "agi")`. Status: `planned`. Reliability: `very_high` once computed.

**1.16 magi_components** - All adjustments needed to compute MAGI for tests such as IRA, ACA, and education credits. Query: `getMagiComponents(clientId, taxYear, purpose)`. Status: `planned`. Reliability: `high`.

**1.17 taxable_income** - Final taxable income line. Query: `getReturnFact(clientId, taxYear, "taxable_income")`. Status: `planned`. Reliability: `very_high`.

**1.18 federal_tax_liability** - Tax before credits. Query: `getReturnFact(clientId, taxYear, "federal_tax_liability")`. Status: `planned`. Reliability: `very_high`.

**1.19 refund_or_balance_due** - Net refund or balance due after withholding and credits. Query: `getReturnFact(clientId, taxYear, "refund_or_balance_due")`. Status: `planned`. Reliability: `very_high`.

**1.20 qbi_deduction** - Section 199A QBI deduction amount with subcomponents: wages, UBIA, and SSTB classification. Query: `getQBIDeduction(clientId, taxYear)`. Status: `planned`. Reliability: `high`.

## Category 2: Intake Answers And Client-Supplied Facts

These are facts the client provided that are not yet on the return. Provenance: client direct input, timestamp, and reviewer approval state.

**2.1 filing_status** - MFJ / MFS / HOH / Single / QW. Query: `getIntakeAnswer(clientId, taxYear, "filing_status")`. Status: `live`. Reliability: `medium` until verified.

**2.2 dependents_list** - Each dependent with DOB, SSN, relationship, residency months, and support test status. Query: `getDependents(clientId, taxYear)`. Status: `partial`. Reliability: `medium`.

**2.3 foreign_account_intake** - Yes/no answer to whether the taxpayer had signature authority over or a financial interest in foreign financial accounts exceeding $10,000 in aggregate at any time during the year. Query: `getIntakeAnswer(clientId, taxYear, "foreign_account")`. Status: `gap`. Reliability: `medium` when collected.

**2.4 foreign_account_max_value** - Aggregate maximum value of foreign accounts during the year. Query: `getIntakeAnswer(clientId, taxYear, "foreign_account_max_value")`. Status: `gap`. Reliability: `medium`.

**2.5 foreign_signature_authority** - Whether signature authority exists without ownership. Query: `getIntakeAnswer(clientId, taxYear, "foreign_signature_authority")`. Status: `gap`. Reliability: `medium`.

**2.6 foreign_income_received** - Foreign-source income: wages, interest, dividends, or business income. Query: `getIntakeAnswer(clientId, taxYear, "foreign_income")`. Status: `gap`. Reliability: `medium`.

**2.7 digital_asset_activity** - Yes/no on the Form 1040 digital asset question, plus any volume estimates. Query: `getIntakeAnswer(clientId, taxYear, "digital_asset")`. Status: `partial`. Reliability: `medium`.

**2.8 home_office_use** - Whether home office is claimed, square footage, and exclusive-use confirmation. Query: `getIntakeAnswer(clientId, taxYear, "home_office")`. Status: `partial`. Reliability: `medium`.

**2.9 vehicle_business_use** - Mileage, lease vs. purchase, business-use percentage, and contemporaneous log status. Query: `getIntakeAnswer(clientId, taxYear, "vehicle_business_use")`. Status: `partial`. Reliability: `medium`.

**2.10 charitable_giving_summary** - Total giving with breakouts: cash vs. noncash and public charity vs. private foundation. Query: `getIntakeAnswer(clientId, taxYear, "charitable")`. Status: `planned`. Reliability: `medium`.

**2.11 health_insurance_status** - Marketplace, employer-sponsored, Medicare, Medicaid, none. Query: `getIntakeAnswer(clientId, taxYear, "health_insurance")`. Status: `partial`. Reliability: `medium`.

**2.12 education_expenses** - Tuition, books, and qualified expenses by student. Query: `getIntakeAnswer(clientId, taxYear, "education_expenses")`. Status: `planned`. Reliability: `medium`.

**2.13 retirement_contributions** - IRA, Roth, SEP, solo 401(k) contributions and timing. Query: `getIntakeAnswer(clientId, taxYear, "retirement_contributions")`. Status: `planned`. Reliability: `medium`.

**2.14 hsa_contributions** - HSA contributions and HDHP coverage status. Query: `getIntakeAnswer(clientId, taxYear, "hsa")`. Status: `planned`. Reliability: `medium`.

**2.15 student_loan_interest_paid** - Student loan interest with 1098-E source. Query: `getIntakeAnswer(clientId, taxYear, "student_loan_interest")`. Status: `planned`. Reliability: `medium`.

**2.16 residency_state_history** - Residency status by month, prior state, current state, and move dates. Query: `getResidencyHistory(clientId, taxYear)`. Status: `partial`. Reliability: `medium`.

**2.17 marriage_divorce_events** - Marriage, divorce, and legal separation events during the year. Query: `getLifeEvents(clientId, taxYear, "marital")`. Status: `planned`. Reliability: `medium`.

**2.18 birth_death_events** - Births and deaths in the household. Query: `getLifeEvents(clientId, taxYear, "household")`. Status: `planned`. Reliability: `medium`.

**2.19 itin_status** - Whether taxpayer or any dependent uses an ITIN, and renewal status. Query: `getITINStatus(clientId, taxYear)`. Status: `planned`. Reliability: `high`.

**2.20 prior_year_extension** - Whether the prior-year return went on extension. Query: `getPriorYearExtension(clientId)`. Status: `live`. Reliability: `high`.

## Category 3: Documents And Uploads

Each document is a typed artifact with structured extraction.

**3.1 form_w2** - W-2 with all box-level fields extracted. Query: `getDocuments(clientId, taxYear, "form_w2")`. Status: `live`. Reliability: `high`.

**3.2 form_1099_nec** - 1099-NEC by payer. Query: `getDocuments(clientId, taxYear, "form_1099_nec")`. Status: `live`. Reliability: `high`.

**3.3 form_1099_misc** - 1099-MISC by payer. Query: `getDocuments(clientId, taxYear, "form_1099_misc")`. Status: `live`. Reliability: `high`.

**3.4 form_1099_k** - 1099-K with monthly breakouts. Query: `getDocuments(clientId, taxYear, "form_1099_k")`. Status: `live`. Reliability: `high`.

**3.5 form_1099_int** - 1099-INT by payer. Query: `getDocuments(clientId, taxYear, "form_1099_int")`. Status: `live`. Reliability: `high`.

**3.6 form_1099_div** - 1099-DIV by payer. Query: `getDocuments(clientId, taxYear, "form_1099_div")`. Status: `live`. Reliability: `high`.

**3.7 form_1099_b** - Consolidated brokerage 1099 with proceeds, basis, holding period, and wash sale. Query: `getDocuments(clientId, taxYear, "form_1099_b")`. Status: `live`. Reliability: `high`.

**3.8 form_1099_r** - Retirement distributions with distribution codes. Query: `getDocuments(clientId, taxYear, "form_1099_r")`. Status: `planned`. Reliability: `high`.

**3.9 form_1099_g** - Government payments such as unemployment or state refunds. Query: `getDocuments(clientId, taxYear, "form_1099_g")`. Status: `planned`. Reliability: `high`.

**3.10 form_1095_a** - Marketplace insurance with monthly premium and APTC. Query: `getDocuments(clientId, taxYear, "form_1095_a")`. Status: `live`. Reliability: `high`.

**3.11 form_1095_b** - Health coverage statement. Query: `getDocuments(clientId, taxYear, "form_1095_b")`. Status: `planned`. Reliability: `high`.

**3.12 form_1095_c** - Employer-provided health coverage. Query: `getDocuments(clientId, taxYear, "form_1095_c")`. Status: `planned`. Reliability: `high`.

**3.13 form_1098** - Mortgage interest paid. Query: `getDocuments(clientId, taxYear, "form_1098")`. Status: `live`. Reliability: `high`.

**3.14 form_1098_e** - Student loan interest paid. Query: `getDocuments(clientId, taxYear, "form_1098_e")`. Status: `planned`. Reliability: `high`.

**3.15 form_1098_t** - Tuition statement. Query: `getDocuments(clientId, taxYear, "form_1098_t")`. Status: `planned`. Reliability: `high`.

**3.16 form_k1** - K-1 from partnership, S corporation, or trust with all line items. Query: `getDocuments(clientId, taxYear, "form_k1")`. Status: `live`. Reliability: `high`.

**3.17 form_8606** - Nondeductible IRA basis. Query: `getDocuments(clientId, taxYear, "form_8606")`. Status: `planned`. Reliability: `high`.

**3.18 ssa_1099** - Social Security benefit statement. Query: `getDocuments(clientId, taxYear, "ssa_1099")`. Status: `planned`. Reliability: `high`.

**3.19 form_5498** - IRA contribution information. Query: `getDocuments(clientId, taxYear, "form_5498")`. Status: `planned`. Reliability: `high`.

**3.20 prior_year_form_6198** - Prior-year at-risk computation by activity. Query: `getDocuments(clientId, taxYear, "form_6198")`. Status: `gap`. Reliability: `high` when present.

**3.21 prior_year_form_8582** - Prior-year passive activity loss limitations. Query: `getDocuments(clientId, taxYear, "form_8582")`. Status: `gap`. Reliability: `high` when present.

**3.22 prior_year_form_fincen_114** - Prior-year FBAR. Query: `getDocuments(clientId, taxYear, "fincen_114")`. Status: `gap`. Reliability: `high` when present.

**3.23 prior_year_form_8938** - Prior-year specified foreign financial assets. Query: `getDocuments(clientId, taxYear, "form_8938")`. Status: `gap`. Reliability: `high` when present.

**3.24 mileage_log** - Vehicle mileage log. Query: `getDocuments(clientId, taxYear, "mileage_log")`. Status: `live`. Reliability: `medium`.

**3.25 expense_summary** - Client-prepared expense summary spreadsheet. Query: `getDocuments(clientId, taxYear, "expense_summary")`. Status: `live`. Reliability: `medium`.

**3.26 prior_year_return** - Prior-year return PDF or summary. Query: `getDocuments(clientId, taxYear, "prior_year_return")`. Status: `live`. Reliability: `high`.

**3.27 engagement_letter** - Signed engagement letter. Query: `getDocuments(clientId, taxYear, "engagement_letter")`. Status: `live`. Reliability: `high`.

**3.28 form_7216_consent** - Section 7216 disclosure consent. Query: `getDocuments(clientId, taxYear, "form_7216_consent")`. Status: `live`. Reliability: `high`.

**3.29 form_8879** - E-file authorization. Query: `getDocuments(clientId, taxYear, "form_8879")`. Status: `live`. Reliability: `high`.

**3.30 irs_correspondence** - Any IRS notice, CP2000, 30-day letter, or SNOD. Query: `getDocuments(clientId, taxYear, "irs_correspondence")`. Status: `planned`. Reliability: `high`.

## Category 4: Issues And Review State

These are workflow facts about a return: what is blocked, what is resolved, and who reviewed.

**4.1 open_issues_by_severity** - All open issues by severity: RED, YELLOW, GREEN. Query: `getOpenIssues(clientId, severity)`. Status: `live`. Reliability: `high`.

**4.2 filing_blockers** - Issues tagged as blocking the return from being filed. Query: `getFilingBlockers(clientId)`. Status: `live`. Reliability: `high`.

**4.3 missing_document_signals** - Documents the system expects but has not received. Query: `getMissingDocumentSignals(clientId)`. Status: `live`. Reliability: `medium`.

**4.4 unanswered_clarifications** - Outstanding client questions awaiting response. Query: `getUnansweredClarifications(clientId)`. Status: `live`. Reliability: `high`.

**4.5 reviewer_approval_state** - Per-fact reviewer approval: AI prepared, reviewer approved, reviewer rejected, override. Query: `getReviewerState(clientId, factId)`. Status: `live`. Reliability: `high`.

**4.6 readiness_score** - Workflow completeness score for a return. Query: `getReadinessScore(clientId)`. Status: `live`. Reliability: `medium`.

**4.7 extension_risk_score** - Probability the return will need an extension. Query: `getExtensionRiskScore(clientId)`. Status: `live`. Reliability: `medium`.

**4.8 ready_to_file_gate_status** - Whether the return has cleared the firm's filing gate. Query: `getFilingGateStatus(clientId)`. Status: `live`. Reliability: `very_high`.

**4.9 review_queue_position** - Where a return sits in the firm's review queue. Query: `getReviewQueuePosition(clientId)`. Status: `planned`. Reliability: `high`.

## Category 5: Conversation And Message History

These are unstructured signals from client-preparer dialogue.

**5.1 client_message_search** - Full-text search across all messages with a client, scoped or unscoped to topic. Query: `searchClientMessages(clientId, query, dateRange)`. Status: `live`. Reliability: `medium`.

**5.2 conversation_topic_extraction** - Extracted topics from client conversations, such as stock sale, residency change, or home office mention. Query: `getConversationTopics(clientId, taxYear)`. Status: `live`. Reliability: `medium`.

**5.3 client_response_cadence** - Average response time, response-time distribution, and last contact date. Query: `getResponseCadence(clientId)`. Status: `live`. Reliability: `high`.

**5.4 client_claim_log** - Statements the client has made that are not yet verified facts. Query: `getClientClaims(clientId, taxYear)`. Status: `live`. Reliability: `low`.

**5.5 prior_year_pattern** - Patterns from prior-year conversations and returns, such as recurring brokerage or recurring rental. Query: `getPriorYearPatterns(clientId)`. Status: `live`. Reliability: `medium`.

**5.6 cross_conversation_search** - Search across all clients' messages for a topic. Query: `searchCrossClientMessages(query, dateRange)`. Status: `planned`. Reliability: `medium`.

## Category 6: Authority And Tax Law

These are external sources that ground tax conclusions.

**6.1 irc_section** - Internal Revenue Code section text. Query: `retrieveAuthority("irc", section, taxYear)`. Status: `live`. Reliability: `very_high`.

**6.2 treasury_regulation** - Treasury regulation text. Query: `retrieveAuthority("treasury_reg", section, taxYear)`. Status: `live`. Reliability: `very_high`.

**6.3 revenue_ruling** - Revenue ruling text. Query: `retrieveAuthority("rev_rul", number)`. Status: `planned`. Reliability: `very_high`.

**6.4 revenue_procedure** - Revenue procedure text. Query: `retrieveAuthority("rev_proc", number)`. Status: `planned`. Reliability: `very_high`.

**6.5 irs_notice** - IRS notice text. Query: `retrieveAuthority("notice", number)`. Status: `planned`. Reliability: `high`.

**6.6 irs_publication** - IRS publication content. Query: `retrieveAuthority("publication", number)`. Status: `live`. Reliability: `high`.

**6.7 form_instructions** - Current-year form instructions. Query: `retrieveAuthority("form_instructions", form, taxYear)`. Status: `live`. Reliability: `high`.

**6.8 tax_court_opinion** - Tax Court memorandum or regular opinion. Query: `retrieveAuthority("tax_court", citation)`. Status: `planned`. Reliability: `very_high`.

**6.9 federal_court_opinion** - Federal court tax decisions: District, Circuit, Supreme Court. Query: `retrieveAuthority("federal_court", citation)`. Status: `planned`. Reliability: `very_high`.

**6.10 chief_counsel_advice** - IRS Chief Counsel Advice. Query: `retrieveAuthority("cca", number)`. Status: `planned`. Reliability: `medium` because it is nonprecedential.

**6.11 private_letter_ruling** - IRS PLR. Query: `retrieveAuthority("plr", number)`. Status: `planned`. Reliability: `medium` because it is nonprecedential and applies only to the requesting taxpayer.

**6.12 state_tax_authority** - State statute, regulation, or administrative guidance. Query: `retrieveAuthority("state", state, citation)`. Status: `gap`. Reliability: `very_high` when retrieved.

**6.13 irs_news_release** - Current IR news releases. Query: `retrieveAuthority("ir_news", topic, dateRange)`. Status: `live`. Reliability: `medium`.

**6.14 obbba_provision** - Specific provisions from PL 119-21. Query: `retrieveAuthority("obbba", section)`. Status: `live`. Reliability: `very_high`.

## Category 7: Knowledge Graph And Docket-Internal Patterns

These are patterns Docket has learned across clients and returns.

**7.1 issue_pattern_match** - Whether Docket has seen this issue pattern before, and on which clients. Query: `searchIssuePatterns(issueDescription)`. Status: `planned`. Reliability: `medium`.

**7.2 fact_pattern_similarity** - Clients with similar fact patterns to a target client. Query: `findSimilarClients(clientId, dimensions)`. Status: `planned`. Reliability: `medium`.

**7.3 reconciliation_template** - Prior reconciliation workpapers for similar problems. Query: `getReconciliationTemplate(issueType)`. Status: `planned`. Reliability: `medium`.

**7.4 enforcement_pattern** - Connections from current facts to OPR, DOJ, or TIGTA enforcement themes. Query: `getEnforcementPatterns(factPattern)`. Status: `gap`. Reliability: `medium`.

## Category 8: Compliance And Regulatory Gates

These are binary gates that govern whether a return can proceed.

**8.1 form_8867_due_diligence_status** - Form 8867 completion status for EITC, CTC, AOTC, and HOH eligibility. Query: `getDueDiligenceStatus(clientId, taxYear)`. Status: `gap`. Reliability: `very_high`.

**8.2 ero_signature_required** - Whether the engagement requires ERO signature and which preparer holds the EFIN. Query: `getEROStatus(clientId, taxYear)`. Status: `planned`. Reliability: `very_high`.

**8.3 circular_230_disclosures** - Whether required Circular 230 language is in the engagement letter. Query: `getCircular230Status(clientId)`. Status: `live`. Reliability: `high`.

**8.4 ssn_validity_at_due_date** - Whether SSNs for taxpayer, spouse, and qualifying children are valid at the return due date for Section 32 EITC. Query: `getSSNValidityStatus(clientId, taxYear)`. Status: `gap`. Reliability: `very_high` when present.

**8.5 preparer_due_diligence_log** - Log of preparer due-diligence actions taken. Query: `getDueDiligenceLog(clientId, taxYear)`. Status: `planned`. Reliability: `high`.

## Category 9: Behavioral And Risk Signals

These are derived signals about client behavior or return risk.

**9.1 audit_risk_factors** - Aggregated factors that increase audit risk on a return: high Schedule C deduction ratio, EITC, foreign accounts, large charitable, cash-intensive business, prior audit. Query: `getAuditRiskFactors(clientId, taxYear)`. Status: `gap`. Reliability: `medium` when computed.

**9.2 section_6694_preparer_exposure** - Estimated preparer exposure under Section 6694 for unreasonable positions on the return. Query: `getPreparerExposure(clientId, taxYear)`. Status: `gap`. Reliability: `medium` when computed.

**9.3 section_6662_taxpayer_exposure** - Estimated client exposure under Section 6662 accuracy-related penalty. Query: `getTaxpayerPenaltyExposure(clientId, taxYear)`. Status: `gap`. Reliability: `medium` when computed.

**9.4 substantiation_gap_score** - Aggregate score of how well-substantiated the return's positions are. Query: `getSubstantiationScore(clientId, taxYear)`. Status: `gap`. Reliability: `medium` when computed.

**9.5 deduction_ratio_signals** - Schedule C expenses as percentage of gross receipts compared to industry norms. Query: `getDeductionRatioSignals(clientId, taxYear)`. Status: `gap`. Reliability: `medium`.

## Category 10: Workflow And Engagement Metadata

These are engagement-level facts.

**10.1 engagement_scope** - Defined scope of the engagement: return type, year, jurisdictions, advisory vs. prep. Query: `getEngagementScope(clientId)`. Status: `live`. Reliability: `very_high`.

**10.2 fee_paid_history** - Fee paid by client over time. Query: `getFeeHistory(clientId)`. Status: `planned`. Reliability: `high`.

**10.3 referral_source** - How the client found the firm. Query: `getReferralSource(clientId)`. Status: `planned`. Reliability: `high`.

**10.4 firm_assigned_reviewer** - Reviewer assigned to this client. Query: `getAssignedReviewer(clientId)`. Status: `planned`. Reliability: `very_high`.

**10.5 deadline_calendar** - All deadlines for this client: federal, state, estimated, and extension. Query: `getDeadlines(clientId, taxYear)`. Status: `planned`. Reliability: `very_high`.

## Planner Usage

When a question comes in, the planner reads the ontology and produces a typed evidence plan. The plan may include live evidence, partial evidence, planned fields, or gaps. The retrieval orchestrator then runs only what exists and returns typed results: hit, partial hit, miss, or field-not-implemented.

### Example 1: "Who has FBAR exposure?"

Plan:

- `2.3 foreign_account_intake`: gap; field does not exist, use proxies.
- `2.4 foreign_account_max_value`: gap.
- `2.5 foreign_signature_authority`: gap.
- `2.6 foreign_income_received`: gap.
- `3.22 prior_year_form_fincen_114`: gap.
- `3.23 prior_year_form_8938`: gap.
- `5.1 client_message_search`: live; search for "foreign", "offshore", "FBAR", "8938", "international", and common foreign bank names.
- `5.2 conversation_topic_extraction`: live; topics tagged with international markers.
- `4.3 missing_document_signals`: live; any client with missing-document signals tagged foreign.
- `6.1 irc_section`: live; IRC Section 6038D for context.
- Authority outside the IRC, such as FinCEN 31 CFR 1010.350, should be added to the authority ontology or surfaced as a gap until implemented.

Synthesis pattern:

> No structured FBAR signals are in the data model today. I checked conversation search and missing-document signals as proxies; no hits there either. The fields needed for a definitive screen - foreign account intake, prior-year FinCEN 114, and prior-year Form 8938 - are not yet implemented. This is a no-signal result, not a no-FBAR conclusion. To populate these fields, add a foreign-account intake question and a prior-year FBAR/8938 upload prompt.

### Example 2: "What's the AMT exposure across my book?"

Plan:

- `1.15 agi`: planned; note availability.
- `1.10 capital_gains_long_term`: planned.
- `1.6 wages_w2`: live; high-income screen.
- `1.14 k1_passthrough_income`: partial; screen for preference items if K-1 detail is captured.
- `2.10 charitable_giving_summary`: planned.
- `3.16 form_k1`: live; check for ISO exercise and AMT preference signals.
- `6.1 irc_section`: live; IRC Sections 55, 56, and 57 for AMT.

Synthesis pattern:

> I can produce a screening list from available data: high W-2 wages, K-1 preference items where captured, and large itemized deductions where available. I do not have a current-year Form 6251 computation field, so this is a screening list of likely AMT-exposed clients, not a final AMT computation.

### Example 3: "Tell me about Section 199A QBI deduction phase-in for SSTB owners."

Plan:

- `6.1 irc_section`: Section 199A.
- `6.2 treasury_regulation`: Treasury Regulation Section 1.199A-5 for SSTB definition.
- `6.6 irs_publication`: Publication 535.
- `6.14 obbba_provision`: check for Section 199A amendments.
- `6.7 form_instructions`: Forms 8995 and 8995-A.

Synthesis pattern:

> Produce a research memo with authority ranking and verbatim citations. No client-file conclusion unless a client file is explicitly attached.

## Next Steps

1. **Antonio review** - Walk through this ontology category by category. Add missing evidence types, correct reliability ratings, and flag anything that does not match real practice.

2. **Fill the gaps** - Treat `gap` and `planned` as the backlog. Each `gap` is a schema addition plus an intake question. Each `planned` item is implementation.

3. **Build the planner** - The planner is a model call constrained to this ontology. Every question decomposes into evidence types from this list. Anything not on the list either gets added or is surfaced as a gap.

This document is Docket's evidence vocabulary. The model is the writer, the ontology is the vocabulary, the planner is the grammar, and synthesis is the voice.
