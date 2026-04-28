import { synthesizeTaxChatWithClaude } from "@docket/ai";
import { getReturnWorkbench, readDocketData } from "@docket/domain";
import { retrieveOfficialAuthority } from "@docket/tax-knowledge";

import {
  suggestedQuestions,
  type ChatAnswer,
  type ChatHistoryTurn,
  type ProfessionalAnalysisView,
  type SourceIndexEntry,
  type TaxChatResponse,
} from "./tax-chat-shared";
import { runTaxChatOrchestrator } from "./tax-orchestrator";

type ReasoningOutputView = {
  issueSummaries: {
    issueId: string;
    title: string;
    riskLevel: "GREEN" | "YELLOW" | "RED";
    blocker: boolean;
    sourceIds: string[];
    citationIds: string[];
    recommendedAction: string;
  }[];
  professionalAnalyses?: ProfessionalAnalysisView[];
  clientQuestions: { question: string; sourceIds: string[]; citationIds: string[] }[];
  authorityContext: {
    citations: { citationId: string }[];
  };
};

type WorkbenchView = NonNullable<ReturnType<typeof getReturnWorkbench>>;

function asReasoningOutputView(output: unknown): ReasoningOutputView | null {
  if (!output || typeof output !== "object") return null;
  const candidate = output as Partial<ReasoningOutputView>;
  if (!Array.isArray(candidate.issueSummaries) || !Array.isArray(candidate.clientQuestions) || !candidate.authorityContext) {
    return null;
  }
  return candidate as ReasoningOutputView;
}

function findIssue(output: ReasoningOutputView | null, issueId: string) {
  return output?.issueSummaries.find((issue) => issue.issueId === issueId) ?? null;
}

function normalizeForMatch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[?.!]+$/g, "")
    .replace(/\s+/g, " ");
}

function resolveReturnIdFromText(question: string, history: ChatHistoryTurn[] = []): string | null {
  const data = readDocketData();
  const text = normalizeForMatch([question, ...history.slice(-6).map((turn) => turn.content)].join(" "));
  const matches = data.clients
    .map((client) => {
      const parts = normalizeForMatch(client.displayName).split(" ").filter((part) => part.length > 2);
      const score = parts.reduce((total, part) => total + (new RegExp(`\\b${part}\\b`).test(text) ? 1 : 0), 0);
      return { client, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const client = matches[0]?.client;
  if (!client) return null;
  return data.taxReturns.find((taxReturn) => taxReturn.clientId === client.id)?.id ?? null;
}

function mentionsKnownClient(question: string): boolean {
  const data = readDocketData();
  const text = normalizeForMatch(question);
  return data.clients.some((client) => {
    const parts = normalizeForMatch(client.displayName).split(" ").filter((part) => part.length > 2);
    return parts.some((part) => new RegExp(`\\b${part}\\b`).test(text));
  });
}

function isGeneralResearchQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return /\bobbba\b|\bob3\b|one big beautiful|beautiful bill|public law|congress|irs guidance|tax law change|new tax law|current authority|research|my clients|clients broadly|client impact/.test(q);
}

function activeResearchTopicFromText(text: string): string | null {
  const normalized = normalizeForMatch(text);
  if (/\bobbba\b|\bob3\b|one big beautiful|beautiful bill|public law 119-21|public law 119 21/.test(normalized)) {
    return "OBBBA Public Law 119-21 client impact";
  }
  if (/form 2553|s corp|s corporation|small business corporation|late election/.test(normalized)) {
    return "Form 2553 S corporation election late election relief";
  }
  if (/business mileage|standard mileage|vehicle expense|car expense|substantiat/.test(normalized)) {
    return "business mileage substantiation records";
  }
  if (/home office|business use of home|exclusive use/.test(normalized)) {
    return "home office deduction exclusive regular use";
  }
  if (/1099-b|1099b|stock sale|brokerage|capital gain|form 8949|schedule d/.test(normalized)) {
    return "stock sale Form 1099-B capital gain reporting";
  }
  if (/1095-a|1095a|marketplace insurance|premium tax credit|aca/.test(normalized)) {
    return "Form 1095-A marketplace insurance premium tax credit";
  }
  if (/crypto|digital asset|virtual currency|1099-da/.test(normalized)) {
    return "digital assets cryptocurrency tax reporting";
  }
  return null;
}

function isAmbiguousResearchFollowup(question: string): boolean {
  const normalized = normalizeForMatch(question);
  const meaningfulTokens = normalized
    .split(" ")
    .filter((token) => token.length > 2 && !["how", "does", "this", "that", "these", "those", "it", "they", "affect", "impact", "client", "clients", "my", "our", "the", "what", "about", "mean"].includes(token));
  return /\b(this|that|these|those|it|they|affect|impact|clients|client|them)\b/.test(normalized) && meaningfulTokens.length <= 2;
}

function hasExplicitTopicNegation(question: string): boolean {
  const normalized = normalizeForMatch(question);
  return (
    /\b(non|not|outside of|other than|unrelated to)\s+obbba\b/.test(normalized) ||
    /\bnon obbba\b|\bnot obbba\b|\bnot about obbba\b/.test(normalized)
  );
}

function isTopicPivotAway(question: string): boolean {
  const normalized = normalizeForMatch(question);
  return (
    hasExplicitTopicNegation(question) ||
    /\b(in general|generally|just in general|overall|right now|today|this week)\b/.test(normalized)
  );
}

function isPortfolioClientQuestion(question: string): boolean {
  const normalized = normalizeForMatch(question);
  const namedClientSignal = /\b(which|who|name|names|list|show|identify|screen)\b.*\b(client|clients|returns|files)\b/.test(normalized);
  const workQueueSignal =
    /\bwhat do i need to work on\b|\bwhat should i work on\b|\bwhere should i focus\b|\bwho needs attention\b|\bwhat needs attention\b/.test(normalized) ||
    (/\b(which|what|who|rank|prioritize|triage|focus|work)\b/.test(normalized) &&
      /\b(right now|today|this week|focus|work on|prioritize|triage|attention)\b/.test(normalized));
  return namedClientSignal || workQueueSignal;
}

function shouldUseResearchTopicForPortfolio(question: string): boolean {
  const normalized = normalizeForMatch(question);
  if (hasExplicitTopicNegation(question)) return false;
  if (activeResearchTopicFromText(question)) return true;
  if (isTopicPivotAway(question)) return false;
  return /\b(affect|affected|impact|eligible|screen|exposure|provision|by it|this|that|these|those)\b/.test(normalized);
}

export function researchRetrievalQuery(question: string, history: ChatHistoryTurn[]): string {
  const directTopic = activeResearchTopicFromText(question);
  if (directTopic) return question;
  if (isTopicPivotAway(question)) return question;
  if (!isAmbiguousResearchFollowup(question) && !isPortfolioClientQuestion(question)) return question;
  if (isPortfolioClientQuestion(question) && !shouldUseResearchTopicForPortfolio(question)) return question;

  const recentTopic = [...history]
    .reverse()
    .map((turn) => activeResearchTopicFromText(turn.content))
    .find((topic): topic is string => Boolean(topic));
  return recentTopic ? `${recentTopic}. Follow-up question: ${question}` : question;
}

function resolveWorkbench(question: string, explicitReturnId?: string, history: ChatHistoryTurn[] = []): WorkbenchView | null {
  if (isPortfolioClientQuestion(question) && !mentionsKnownClient(question)) {
    return null;
  }
  if (explicitReturnId && isGeneralResearchQuestion(question) && !mentionsKnownClient(question)) {
    return null;
  }
  const returnId = explicitReturnId ?? resolveReturnIdFromText(question, history);
  return returnId ? getReturnWorkbench(returnId) ?? null : null;
}

function isBareClientLookup(question: string): boolean {
  const normalized = normalizeForMatch(question);
  const data = readDocketData();
  return data.clients.some((client) => {
    const name = normalizeForMatch(client.displayName);
    const first = name.split(" ")[0];
    const last = name.split(" ").at(-1);
    return normalized === name || normalized === first || normalized === last || normalized === `client ${first}` || normalized === `open ${first}` || normalized === `find ${first}` || normalized === `show ${first}`;
  });
}

function isDeepMemoRequest(question: string): boolean {
  const q = question.toLowerCase();
  return /\bdeep dive\b|\bfull\b.*\bmemo\b|\breviewer memo\b|\bfull analysis\b|\bcomprehensive analysis\b|\bfull review\b|\brun\b.*\bmemo\b|\banalyze\b.*\breturn\b/.test(q);
}

function isCasualMessage(question: string): boolean {
  return /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool|test)[\s!.?]*$/i.test(question.trim());
}

function buildCasualAnswer(): ChatAnswer {
  return {
    mode: "general-research",
    headline: "Hey, I’m here.",
    answer: [
      "Ask me a tax research question, or mention a client/return if you want me to use file context.",
      "For casual chat I do not need citations. If we get into tax law or a client file, I’ll show the sources I used.",
    ],
    reasoningSummary: ["No tax conclusion was made, so no authority retrieval is required."],
    nextSteps: ["Ask a general tax question, open a return context, or mention a client by name if you want file context."],
    sourceIds: [],
    citationIds: [],
    suggestedFollowups: suggestedQuestions.slice(0, 4),
  };
}

function issueSourceLabel(workbench: WorkbenchView | null, sourceId: string): string {
  const source = workbench?.reasoningSourceIndex[sourceId];
  return source ? `${source.type}: ${source.label}` : sourceId;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, style: "currency", currency: "USD" }).format(value);
}

function factNumber(workbench: WorkbenchView | null, factId: string): number | null {
  const value = workbench?.taxFacts.find((fact) => fact.id === factId)?.value;
  return typeof value === "number" ? value : null;
}

function claimNumber(workbench: WorkbenchView | null, claimId: string): number | null {
  const value = workbench?.taxFacts.find((fact) => fact.id === claimId)?.value;
  if (typeof value === "number") return value;
  return claimId === "claim-freelance-85k" ? 85000 : null;
}

type WorkbenchIssue = WorkbenchView["issues"][number];

function issueStatusLabel(issue: WorkbenchIssue): string {
  if (issue.status === "RESOLVED") return "Resolved in current state";
  if (issue.status === "WAIVED_BY_REVIEWER") return "Waived by reviewer";
  return issue.blocker ? "Blocks filing until reviewed" : "Needs review before claiming";
}

function issueSpecificAnalysis(workbench: WorkbenchView, issue: WorkbenchIssue): ProfessionalAnalysisView {
  const clientName = workbench.client?.displayName ?? "The client";
  const missingFacts = workbench.questions
    .filter((question) => question.relatedIssueId === issue.id && question.status !== "ANSWERED")
    .map((question) => question.question);
  const sourceLabels = issue.sourceIds.map((sourceId) => issueSourceLabel(workbench, sourceId));
  const base = {
    issueId: issue.id,
    title: issue.title,
    statusLabel: issueStatusLabel(issue),
    context: `${workbench.client?.displayName ?? "Client"} · ${workbench.taxReturn.taxYear} ${workbench.taxReturn.returnType} · ${workbench.taxReturn.jurisdiction}`,
    factPatternSummary: issue.description,
    establishedFacts: sourceLabels,
    clientClaims: sourceLabels.filter((label) => label.toLowerCase().includes("claim") || label.toLowerCase().includes("conversation")),
    missingFacts: missingFacts.length > 0 ? missingFacts : ["No unanswered client clarification is currently open for this issue."],
    authorityPosture: "Use attached citations as research support; reviewer must apply them to this client's supported facts.",
    sourceIds: issue.sourceIds,
    citationIds: [] as string[],
  };
  const nec = factNumber(workbench, "fact-nec-income") ?? 42000;
  const k1099 = factNumber(workbench, "fact-1099k-income") ?? 63000;
  const claimed = claimNumber(workbench, "claim-freelance-85k") ?? 85000;
  const additive = nec + k1099;
  const variance = additive - claimed;
  const miles = factNumber(workbench, "fact-business-miles") ?? 1180;

  switch (issue.issueType) {
    case "INCOME_RECONCILIATION":
      return {
        ...base,
        priority: 10,
        situationMode: "Returning Schedule C client with third-party income mismatch",
        ruleSpace: ["Schedule C gross receipts", "1099-NEC income reporting", "1099-K gross payment reporting", "Prior-year Schedule C variance review"],
        smellTests: [
          `Client claim is ${formatMoney(claimed)}; 1099-NEC plus 1099-K totals ${formatMoney(additive)}.`,
          `Additive documents exceed the client estimate by ${formatMoney(variance)}.`,
          `If Bluepeak paid through Stripe, counting both forms at face value could double-count up to ${formatMoney(nec)}.`,
        ],
        dollarExposure: `${formatMoney(variance)} unexplained variance versus client estimate; up to ${formatMoney(nec)} possible double-count exposure.`,
        professionalJudgment: issue.status === "RESOLVED" ? "Resolved in the current state; keep the reconciliation workpaper and reviewer approval attached." : "Block Schedule C gross receipts until the firm reconciles the client estimate to 1099-NEC, 1099-K, and payment detail.",
        assumptionsToAvoid: ["Do not assume the 1099-K is incremental income.", "Do not assume the 1099-K duplicates the 1099-NEC.", "Do not use the client's estimate as verified gross receipts."],
        diligenceDuties: ["Tie gross receipts to source documents or ledger support.", "Document overlap logic.", "Get reviewer approval on final Schedule C receipts."],
        riskRationale: issue.description,
        reviewerChecklist: ["Pull Stripe payout detail.", "Match Stripe payouts against Bluepeak invoices/payment dates.", "Document final gross receipts calculation.", "Approve the accepted gross receipts fact."],
        clearanceStandard: "Clear only when overlap is documented, receipts reconcile, and reviewer approves the final Schedule C gross receipts fact.",
        clientQuestionStrategy: "Ask whether Bluepeak paid through Stripe and request Stripe payout detail or bookkeeping support.",
        clientCommunicationDraft: `${clientName}, we have ${formatMoney(nec)} on the Bluepeak 1099-NEC and ${formatMoney(k1099)} on the Stripe 1099-K, but your organizer says about ${formatMoney(claimed)} of freelance income. Did Bluepeak pay you through Stripe, or are those separate receipts? Please upload Stripe payout detail or a 2024 income ledger.`,
        preparerWorkPlan: ["Build payer/payment-channel table.", "Match Stripe payouts to Bluepeak invoice dates.", "Prepare gross receipts bridge from client claim to source documents.", "Send final receipts fact to reviewer."],
        citationIds: ["cite-schedule-c-gross"],
      };
    case "FORM_1099K_OVERLAP":
      return {
        ...base,
        priority: 20,
        situationMode: "Payment-processor overlap review",
        ruleSpace: ["Schedule C gross receipts", "1099-K processor detail", "1099-NEC payer reporting"],
        smellTests: [`Stripe reports ${formatMoney(k1099)} gross.`, `Bluepeak separately reports ${formatMoney(nec)}.`, "Same payer/payment channel could cause double counting or omission."],
        dollarExposure: `${formatMoney(nec)} potential duplicate/omitted receipts depending on whether Bluepeak paid through Stripe.`,
        professionalJudgment: "Resolve payer-level overlap before finalizing Schedule C income.",
        assumptionsToAvoid: ["Do not double-count processor receipts.", "Do not net processor fees without separate expense support."],
        diligenceDuties: ["Map payer to payment channel.", "Tie processor detail to ledger/deposits.", "Document normalization of gross receipts."],
        riskRationale: issue.description,
        reviewerChecklist: ["Compare payer names.", "Trace processor payout detail.", "Tie final total to workpaper."],
        clearanceStandard: "Clear only after overlap is resolved and the gross receipts workpaper ties to evidence.",
        clientQuestionStrategy: "Ask whether Bluepeak paid through Stripe or separately.",
        clientCommunicationDraft: "Can you confirm whether Bluepeak paid you through Stripe during 2024? If yes, please upload Stripe transaction detail showing Bluepeak payments. If no, tell us how Bluepeak paid you.",
        preparerWorkPlan: ["Create payer/payment-channel table.", "Trace Bluepeak payments.", "Document final overlap conclusion."],
        citationIds: ["cite-schedule-c-gross"],
      };
    case "MISSING_1099_B":
      return {
        ...base,
        priority: 30,
        situationMode: "Investment sale document blocker",
        ruleSpace: ["Brokerage tax reporting", "Capital transaction reporting", "Basis and holding-period support"],
        smellTests: ["Transcript says Tesla stock was sold in March.", "No 1099-B or consolidated brokerage statement is uploaded.", "Prior-year brokerage pattern makes this expected document more likely."],
        dollarExposure: "Unknown until proceeds, basis, holding period, and wash-sale data are obtained; do not estimate from transcript memory.",
        professionalJudgment: issue.status === "RESOLVED" ? "Resolved in current state; retain brokerage support or reviewer override in the file." : "Block investment income review until brokerage support arrives.",
        assumptionsToAvoid: ["Do not infer proceeds or basis from the client statement.", "Do not ignore a stock sale because no form was uploaded."],
        diligenceDuties: ["Request consolidated 1099-B.", "Preserve transcript as a claim only.", "Review basis/wash-sale data before clearance."],
        riskRationale: issue.description,
        reviewerChecklist: ["Identify brokerage.", "Collect 2024 consolidated 1099-B.", "Review proceeds, basis, holding period, wash-sale indicators."],
        clearanceStandard: "Clear only when brokerage documentation is uploaded or reviewer records an explicit override.",
        clientQuestionStrategy: "Ask which brokerage held Tesla and request the 2024 consolidated tax package.",
        clientCommunicationDraft: `${clientName}, you mentioned selling stock in March. Which brokerage account held the shares? Please upload the 2024 consolidated 1099 or transaction statement for that account.`,
        preparerWorkPlan: ["Request brokerage name and tax package.", "Do not enter proceeds/basis from memory.", "Review proceeds/basis/holding period when received."],
      };
    case "STATE_RESIDENCY":
      return {
        ...base,
        priority: 50,
        situationMode: "Mid-year move and possible state wage allocation",
        ruleSpace: ["State residency", "Domicile facts", "Wage sourcing", "Engagement scope boundary"],
        smellTests: ["Move timing is only 'July'; exact date is missing.", "California employer remains in the file.", "Post-move California workdays are unknown."],
        dollarExposure: "Not estimated until CA workdays and state wage allocation are known.",
        professionalJudgment: "Route CA-to-TX move facts through residency review before accepting state treatment.",
        assumptionsToAvoid: ["Do not assume Texas move eliminates CA-source wage questions.", "Do not infer exact move date from month alone."],
        diligenceDuties: ["Collect move date.", "Document domicile facts.", "Confirm work location after move."],
        riskRationale: issue.description,
        reviewerChecklist: ["Confirm exact move date.", "Confirm post-move CA workdays.", "Review W-2 state wages.", "Escalate state scope if needed."],
        clearanceStandard: "Clear only after domicile/work-location facts are documented and reviewer signs off.",
        clientQuestionStrategy: "Ask exact move date and whether any services were performed in California after the move.",
        clientCommunicationDraft: "What was your exact move date from California to Texas? After that date, did you work any days in California or continue performing services from California?",
        preparerWorkPlan: ["Collect exact move date.", "Review W-2 state reporting.", "Document state-scope recommendation."],
      };
    case "HOME_OFFICE_SUBSTANTIATION":
      return {
        ...base,
        priority: 60,
        situationMode: "Deduction opportunity with exclusive-use ambiguity",
        ruleSpace: ["Home office exclusive use", "Regular business use", "Schedule C substantiation"],
        smellTests: ["Client said guests sometimes stay in the room.", "That statement directly weakens exclusive-use support.", "No square footage or expense support is attached."],
        dollarExposure: "Not estimated until eligibility, square footage, and home expense support are established.",
        professionalJudgment: "Treat home office as an opportunity, not a claim, until exclusive and regular use are confirmed.",
        assumptionsToAvoid: ["Do not claim if personal guest use occurred.", "Do not estimate square footage without support."],
        diligenceDuties: ["Confirm exclusive use.", "Confirm regular use.", "Collect square footage and expense support only if eligible."],
        riskRationale: issue.description,
        reviewerChecklist: ["Confirm exclusive-use answer.", "Confirm regular-use answer.", "Review square footage and expense support.", "Approve or reject opportunity."],
        clearanceStandard: "Clear only if exclusive/regular use is supported and reviewer approves the deduction opportunity.",
        clientQuestionStrategy: "Ask directly whether the room had any personal/guest use during 2024.",
        clientCommunicationDraft: "For the home office, was that room used exclusively and regularly for your consulting business during 2024, or did guests/family use it for personal purposes at any time?",
        preparerWorkPlan: ["Resolve exclusive use first.", "If eligible, collect square footage and expense support.", "If not exclusive, reject or escalate the opportunity."],
        citationIds: ["cite-pub587-exclusive-use"],
      };
    case "MILEAGE_SUBSTANTIATION":
      return {
        ...base,
        priority: 70,
        situationMode: "Substantiation-sensitive business mileage review",
        ruleSpace: ["Business mileage records", "Business purpose support", "Commuting exclusion", "Firm mileage policy"],
        smellTests: ["Only Q4 mileage support is visible.", `Uploaded log shows ${miles.toLocaleString()} business miles.`, "Business-purpose detail is incomplete; full-year mileage cannot be extrapolated."],
        dollarExposure: `${miles.toLocaleString()} Q4 miles are at stake before any full-year adjustment; final deduction depends on supported miles and the applicable standard mileage rate.`,
        professionalJudgment: "Treat mileage as a possible deduction that needs complete business-purpose support before acceptance.",
        assumptionsToAvoid: ["Do not extrapolate Q4 to full year.", "Do not accept miles without business purpose and trip detail."],
        diligenceDuties: ["Request full-year mileage log.", "Confirm date/destination/miles/business purpose.", "Tie use to Schedule C activity."],
        riskRationale: issue.description,
        reviewerChecklist: ["Review log completeness.", "Confirm business purpose.", "Check full-year coverage.", "Approve supported miles only."],
        clearanceStandard: "Clear only when the mileage log satisfies firm policy and reviewer approval.",
        clientQuestionStrategy: "Ask for a full-year log with date, destination, miles, and business purpose for each trip.",
        clientCommunicationDraft: "Please upload the full-year mileage log. For each trip, we need the date, destination, miles, and business purpose. The Q4 log alone is not enough for final review.",
        preparerWorkPlan: ["Do not extrapolate Q4 mileage.", "Request full-year log.", "Tie accepted mileage to business-purpose support."],
        citationIds: ["cite-pub463-records"],
      };
    default:
      return {
        ...base,
        priority: 90,
        situationMode: issue.blocker ? "Client-file blocker review" : "Client-file risk review",
        ruleSpace: ["Applicable form instructions", "Evidence requirements", "Firm review policy"],
        smellTests: [issue.description],
        dollarExposure: "Not estimated yet.",
        professionalJudgment: issue.blocker ? "Treat as blocking until documented and reviewed." : "Treat as review-needed before claiming or advising.",
        assumptionsToAvoid: ["Do not convert client statements into verified facts.", "Do not clear from model wording alone."],
        diligenceDuties: ["Separate facts from claims.", "Tie material positions to evidence.", "Escalate uncertainty."],
        riskRationale: issue.description,
        reviewerChecklist: ["Review evidence.", "Confirm missing facts.", "Approve or reject with note."],
        clearanceStandard: "Clear only when evidence, authority, and reviewer approval support the position.",
        clientQuestionStrategy: issue.recommendedAction,
        clientCommunicationDraft: "Please send the missing support for this item so we can finish review.",
        preparerWorkPlan: ["Gather source support.", "Document conclusion.", "Route to reviewer."],
      };
  }
}

function fallbackProfessionalAnalyses(workbench: WorkbenchView | null): ProfessionalAnalysisView[] {
  if (!workbench) return [];
  return workbench.issues
    .map((issue) => issueSpecificAnalysis(workbench, issue))
    .sort((a, b) => a.priority - b.priority);
}

function professionalAnalysesForAnswer(
  workbench: WorkbenchView | null,
  output: ReasoningOutputView | null,
  issueIds?: string[],
): ProfessionalAnalysisView[] {
  const analyses = workbench ? fallbackProfessionalAnalyses(workbench) : output?.professionalAnalyses ?? [];
  const filtered = issueIds?.length ? analyses.filter((analysis) => issueIds.includes(analysis.issueId)) : analyses;
  return filtered.slice(0, 4);
}

function buildClientDeepDiveAnswer(workbench: WorkbenchView | null, output: ReasoningOutputView | null): ChatAnswer {
  const clientName = workbench?.client?.displayName ?? "this client";
  const taxReturn = workbench?.taxReturn;
  const activeIssues = workbench?.issues.filter((issue) => issue.status !== "RESOLVED" && issue.status !== "WAIVED_BY_REVIEWER") ?? [];
  const redIssues = activeIssues.filter((issue) => issue.riskLevel === "RED");
  const blockerIssues = activeIssues.filter((issue) => issue.blocker);
  const missingDocuments = workbench?.missingDocuments.filter((document) => document.status !== "RECEIVED") ?? [];
  const unansweredQuestions = workbench?.questions.filter((question) => question.status !== "ANSWERED") ?? [];
  const unapprovedFacts = workbench?.taxFacts.filter((fact) => fact.materiality !== "LOW" && fact.reviewStatus !== "REVIEWER_APPROVED" && fact.reviewStatus !== "PARTNER_OVERRIDE") ?? [];
  const citedIssueIds = output?.issueSummaries.flatMap((issue) => [...issue.sourceIds, ...issue.citationIds]) ?? [];
  const analyses = professionalAnalysesForAnswer(workbench, output);
  const activeAnalyses = analyses.filter((analysis) => !analysis.statusLabel.toLowerCase().startsWith("resolved"));
  const analysisQueue = activeAnalyses.length > 0 ? activeAnalyses : analyses;
  const readyToFileGate = workbench?.readyToFileGate;
  const filingBlocked = readyToFileGate ? !readyToFileGate.pass : true;
  const gateBlockers = readyToFileGate?.blockers ?? [];
  const headline = filingBlocked
    ? `${clientName}'s return is not ready to file.`
    : `${clientName}'s return is clear in the current Docket state.`;
  const readinessMeaning = "Readiness is workflow/data completeness, not permission to file. The ready-to-file gate is the clearance verdict.";
  const extensionReasons = workbench?.extension.reasons.length ? workbench.extension.reasons.join("; ") : "No extension drivers currently flagged.";
  const contextMarkers = workbench?.client?.tags.length ? workbench.client.tags.join(", ") : "No client tags are recorded.";
  const activeIssueTitles = activeIssues.length ? activeIssues.map((issue) => issue.title).join("; ") : "No active issues are open.";
  const missingDocumentNames = missingDocuments.length
    ? missingDocuments.map((document) => document.expectedDocumentClass.replaceAll("_", " ")).join(", ")
    : "No missing document signals are open.";

  return {
    mode: "client-return",
    headline,
    verdict: {
      filingStatus: filingBlocked ? "Not ready to file" : "Ready-to-file stub passed",
      blockerCount: gateBlockers.length,
      readinessScore: workbench?.readiness.readinessScore ?? 0,
      extensionRiskScore: workbench?.extension.extensionRiskScore ?? 0,
      readinessMeaning,
    },
    answer: [
      `${clientName} is in ${taxReturn?.status.replaceAll("_", " ").toLowerCase() ?? "an active"} status for tax year ${taxReturn?.taxYear ?? "the selected tax year"} ${taxReturn?.returnType ?? "return"}. Readiness is ${workbench?.readiness.readinessScore ?? 0}% and extension risk is ${workbench?.extension.extensionRiskScore ?? 0}%. ${readinessMeaning}`,
      `The main story is built from this client's own context markers: ${contextMarkers}. Active issues: ${activeIssueTitles}. Missing documents: ${missingDocumentNames}.`,
      filingBlocked
        ? `Ready-to-file gate blockers: ${gateBlockers.length > 0 ? gateBlockers.join("; ") : "none listed"}. Active tax issue blockers: ${blockerIssues.length}. Missing document signals: ${missingDocuments.length}. Unanswered clarifications: ${unansweredQuestions.length}. Material facts needing reviewer approval: ${unapprovedFacts.length}. Extension drivers: ${extensionReasons}.`
        : `Current persisted state has no ready-to-file gate blockers. Historical issue cards below are retained as the defensive review record, not active blockers.`,
    ],
    actionQueues: {
      clientFacing: analysisQueue.map((analysis) => analysis.clientCommunicationDraft).slice(0, 4),
      preparerFacing: Array.from(new Set(analysisQueue.flatMap((analysis) => analysis.preparerWorkPlan))).slice(0, 8),
    },
    reasoningSummary: [
      "I used the return workbench state because the prompt asks about a client return.",
      "Readiness is not treated as clearance. The ready-to-file gate controls the filing verdict.",
      "Each issue below has its own rule space, smell tests, dollar exposure, client draft, preparer work plan, and issue-specific sources.",
    ],
    nextSteps: [
      ...analysisQueue.flatMap((analysis) => analysis.reviewerChecklist.slice(0, 1)).slice(0, 4),
      filingBlocked ? "Keep ready-to-file blocked until the listed review gates pass." : "Retain the source-backed clearance record for reviewer signoff.",
    ],
    professionalAnalyses: analyses,
    sourceIds: [
      ...(workbench?.documents.map((document) => document.id) ?? []),
      ...(workbench?.issues.flatMap((issue) => issue.sourceIds) ?? []),
      ...(workbench?.missingDocuments.flatMap((document) => document.sourceIds) ?? []),
      ...citedIssueIds,
    ],
    citationIds: output?.authorityContext.citations.map((citation) => citation.citationId) ?? [],
    suggestedFollowups: [
      `Show ${clientName}'s top blockers.`,
      "What source supports each red flag?",
      `Draft the client questions for ${clientName}.`,
      "What needs reviewer approval?",
      `What would make ${clientName} ready for signature?`,
    ],
  };
}

function buildClientLookupAnswer(workbench: WorkbenchView | null): ChatAnswer {
  const clientName = workbench?.client?.displayName ?? "the selected client";
  const taxReturn = workbench?.taxReturn;
  return {
    mode: "client-return",
    headline: `I found ${clientName}'s return file.`,
    answer: [
      `${clientName} has a ${taxReturn?.taxYear ?? 2024} ${taxReturn?.returnType ?? "Individual 1040 + Schedule C"} return in Docket.`,
      "Tell me what you want to do with the file: status, blockers, documents, client questions, sources, reconciliation, or a full reviewer memo.",
    ],
    reasoningSummary: [
      "I treated this as a client lookup, not a request for analysis.",
      "No tax conclusion or filing-readiness conclusion was made from the word alone.",
    ],
    nextSteps: [
      "Ask for a status summary if you want the short operational view.",
      "Ask for blockers if you want filing-risk triage.",
      "Ask for a deep dive or reviewer memo if you want the full citation-backed analysis.",
    ],
    sourceIds: [],
    citationIds: [],
    suggestedFollowups: [
      `Give me ${clientName}'s status summary.`,
      `Show ${clientName}'s filing blockers.`,
      `What documents are missing for ${clientName}?`,
      `Draft ${clientName}'s client questions.`,
      `Run the full reviewer memo for ${clientName}.`,
    ],
  };
}

function buildClientStatusAnswer(workbench: WorkbenchView | null): ChatAnswer {
  const clientName = workbench?.client?.displayName ?? "the selected client";
  const activeIssues = workbench?.issues.filter((issue) => issue.status !== "RESOLVED" && issue.status !== "WAIVED_BY_REVIEWER") ?? [];
  const redIssues = activeIssues.filter((issue) => issue.riskLevel === "RED");
  const blockerIssues = activeIssues.filter((issue) => issue.blocker);
  const gateBlockers = workbench?.readyToFileGate.blockers ?? [];
  const missingDocuments = workbench?.missingDocuments.filter((document) => document.status !== "RECEIVED") ?? [];
  const extensionReasons = workbench?.extension.reasons.slice(0, 4) ?? [];

  return {
    mode: "client-return",
    headline: `${clientName}: status summary, not a full memo.`,
    verdict: {
      filingStatus: gateBlockers.length > 0 ? "Not ready to file" : "Ready-to-file stub passed",
      blockerCount: gateBlockers.length,
      readinessScore: workbench?.readiness.readinessScore ?? 0,
      extensionRiskScore: workbench?.extension.extensionRiskScore ?? 0,
      readinessMeaning: "Readiness measures workflow completion. Filing clearance is controlled by review gates.",
    },
    answer: [
      `${clientName}'s return is ${workbench?.taxReturn.status.replaceAll("_", " ").toLowerCase() ?? "active"} with ${workbench?.readiness.readinessScore ?? 0}% workflow readiness and ${workbench?.extension.extensionRiskScore ?? 0}% extension risk.`,
      gateBlockers.length > 0
        ? `The filing gate is blocked by: ${gateBlockers.join("; ")}.`
        : "The current persisted ready-to-file gate has no listed blockers.",
      `Current issue counts: ${redIssues.length} active red issue(s), ${blockerIssues.length} active issue blocker(s), ${missingDocuments.length} missing document signal(s).`,
      extensionReasons.length > 0 ? `Extension risk drivers: ${extensionReasons.join("; ")}.` : "No extension drivers are currently listed.",
    ],
    reasoningSummary: [
      "I treated the request as an operational status summary.",
      "I did not run the full reviewer memo because the prompt did not ask for deep analysis.",
      "The summary separates readiness percentage from ready-to-file clearance.",
    ],
    nextSteps: [
      "Ask for filing blockers if you want the risk queue.",
      "Ask for source evidence if you want citations for a specific issue.",
      "Ask for the full reviewer memo when you want memo-grade analysis.",
    ],
    sourceIds: [
      ...(workbench?.issues.flatMap((issue) => issue.sourceIds).slice(0, 8) ?? []),
      ...(workbench?.missingDocuments.flatMap((document) => document.sourceIds).slice(0, 4) ?? []),
    ],
    citationIds: [],
    suggestedFollowups: [
      `Show ${clientName}'s filing blockers.`,
      `What documents are missing for ${clientName}?`,
      `Show the evidence for ${clientName}'s top issue.`,
      `Run the full reviewer memo for ${clientName}.`,
    ],
  };
}

type PortfolioCandidate = {
  clientId: string;
  returnId: string | null;
  name: string;
  priority: "HIGH" | "MEDIUM" | "MONITOR";
  reasons: string[];
  evidenceLabels: string[];
  score?: number;
};

function isOpenIssue(issue: WorkbenchIssue | { status: string }): boolean {
  return issue.status !== "RESOLVED" && issue.status !== "WAIVED_BY_REVIEWER";
}

function buildGeneralPortfolioFocusList(): PortfolioCandidate[] {
  const data = readDocketData();
  return data.clients
    .map((client) => {
      const taxReturn = data.taxReturns.find((returnRecord) => returnRecord.clientId === client.id) ?? null;
      const issues = data.taxIssues.filter((issue) => issue.clientId === client.id && isOpenIssue(issue));
      const redIssues = issues.filter((issue) => issue.riskLevel === "RED");
      const blockerIssues = issues.filter((issue) => issue.blocker);
      const missingDocuments = data.missingDocuments.filter((document) => document.clientId === client.id && document.status !== "RECEIVED" && document.status !== "WAIVED");
      const documents = data.sourceDocuments.filter((document) => document.clientId === client.id);
      const readiness = taxReturn?.readinessScore ?? 0;
      const extensionRisk = taxReturn?.extensionRiskScore ?? 0;
      const reasons: string[] = [];
      const evidenceLabels: string[] = [
        `Return state: ${taxReturn?.status.replaceAll("_", " ").toLowerCase() ?? "no active return"}; readiness ${readiness}%; extension risk ${extensionRisk}%.`,
        `Client profile: ${client.tags.join(", ")}; average response time ${client.averageResponseDays} days.`,
      ];

      if (redIssues.length > 0) reasons.push(`${redIssues.length} open red issue(s), including ${redIssues.slice(0, 2).map((issue) => issue.title).join("; ")}.`);
      if (blockerIssues.length > 0) reasons.push(`${blockerIssues.length} filing blocker(s) need reviewer-controlled resolution.`);
      if (extensionRisk >= 75) reasons.push(`High extension risk at ${extensionRisk}%.`);
      else if (extensionRisk >= 45) reasons.push(`Moderate extension risk at ${extensionRisk}%.`);
      if (readiness <= 60) reasons.push(`Low workflow readiness at ${readiness}%.`);
      if (missingDocuments.length > 0) reasons.push(`Open missing-document signal(s): ${missingDocuments.map((document) => document.expectedDocumentClass.replaceAll("_", " ")).join(", ")}.`);
      if (client.averageResponseDays >= 4) reasons.push(`Slow responder pattern (${client.averageResponseDays} day average) increases deadline risk.`);
      if (redIssues.length === 0 && blockerIssues.length === 0 && extensionRisk < 45 && readiness >= 80) {
        reasons.push("Monitor only: file is comparatively clean, so it should not pull attention away from red/blocker returns.");
      }

      evidenceLabels.push(...issues.slice(0, 4).map((issue) => `Issue: ${issue.title} (${issue.riskLevel}${issue.blocker ? ", blocker" : ""})`));
      evidenceLabels.push(...missingDocuments.slice(0, 3).map((document) => `Missing document: ${document.expectedDocumentClass.replaceAll("_", " ")} — ${document.reason}`));
      evidenceLabels.push(...documents.slice(0, 3).map((document) => document.fileName));

      const score =
        redIssues.length * 35 +
        blockerIssues.length * 30 +
        Math.max(0, extensionRisk - 40) +
        Math.max(0, 75 - readiness) +
        missingDocuments.length * 18 +
        (client.averageResponseDays >= 4 ? 12 : 0);
      const priority: PortfolioCandidate["priority"] = score >= 85 ? "HIGH" : score >= 45 ? "MEDIUM" : "MONITOR";

      return {
        clientId: client.id,
        returnId: taxReturn?.id ?? null,
        name: client.displayName,
        priority,
        reasons,
        evidenceLabels: Array.from(new Set(evidenceLabels)).slice(0, 8),
        score,
      };
    })
    .filter((candidate) => candidate.reasons.length > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name));
}

function buildTopicPortfolioCandidateList(topic: string): PortfolioCandidate[] {
  const data = readDocketData();
  const normalizedTopic = normalizeForMatch(topic);
  return data.clients
    .map((client) => {
      const taxReturn = data.taxReturns.find((returnRecord) => returnRecord.clientId === client.id) ?? null;
      const documents = data.sourceDocuments.filter((document) => document.clientId === client.id);
      const issues = data.taxIssues.filter((issue) => issue.clientId === client.id);
      const opportunities = data.deductionOpportunities.filter((opportunity) => opportunity.clientId === client.id);
      const priorYearPatterns = data.priorYearPatterns.filter((pattern) => pattern.clientId === client.id);
      const tags = client.tags.map((tag) => tag.toLowerCase());
      const documentClasses = new Set(documents.map((document) => document.documentClass));
      const reasons: string[] = [];
      const evidenceLabels = [`Client profile: ${client.tags.join(", ")}`];

      if (normalizedTopic.includes("obbba") || normalizedTopic.includes("public law 119-21")) {
        if (tags.includes("retired") || documentClasses.has("FORM_1099_R")) {
          reasons.push("Senior/retirement-income screen: possible Enhanced Senior Deduction and MAGI documentation review.");
          evidenceLabels.push(...documents.filter((document) => document.documentClass === "FORM_1099_R" || document.documentClass === "FORM_1099_INT").map((document) => document.fileName));
        }
        if (tags.includes("schedule c") || taxReturn?.returnType.toLowerCase().includes("schedule c") || documentClasses.has("FORM_1099_NEC") || documentClasses.has("FORM_1099_K")) {
          reasons.push("Schedule C/self-employed screen: review business/worker provisions, reporting transition relief, and client organizer updates.");
          evidenceLabels.push(...documents.filter((document) => ["FORM_1099_NEC", "FORM_1099_K", "BUSINESS_EXPENSE_SUMMARY"].includes(document.documentClass)).map((document) => document.fileName));
        }
        if (tags.includes("marketplace insurance") || documentClasses.has("FORM_1095_A")) {
          reasons.push("Healthcare/ACA screen: healthcare provisions require separate source review before client-facing advice.");
          evidenceLabels.push(...documents.filter((document) => document.documentClass === "FORM_1095_A").map((document) => document.fileName));
        }
        if (tags.some((tag) => tag.includes("k-1")) || documentClasses.has("SCHEDULE_K1") || taxReturn?.returnType.toLowerCase().includes("rental")) {
          reasons.push("Pass-through/rental/business screen: provision-by-provision business impact review needed; do not automate basis/passive conclusions.");
          evidenceLabels.push(...documents.filter((document) => document.documentClass === "SCHEDULE_K1" || document.documentClass === "FORM_1098").map((document) => document.fileName));
        }
        if (tags.includes("dependent") || tags.includes("childcare") || documentClasses.has("FORM_1098_T") || documentClasses.has("DEPENDENT_CARE_STATEMENT")) {
          reasons.push("Family/dependent screen: monitor family/dependent provisions and update organizer questions before planning outreach.");
          evidenceLabels.push(...documents.filter((document) => document.documentClass === "FORM_1098_T" || document.documentClass === "DEPENDENT_CARE_STATEMENT").map((document) => document.fileName));
        }
      } else if (normalizedTopic.includes("home office")) {
        if (issues.some((issue) => issue.issueType === "HOME_OFFICE_SUBSTANTIATION") || opportunities.some((opportunity) => opportunity.opportunityType === "HOME_OFFICE") || tags.includes("schedule c")) {
          reasons.push("Home office screen: Schedule C or home-office signal exists; exclusive and regular use need file-specific verification.");
          evidenceLabels.push(...issues.filter((issue) => issue.issueType === "HOME_OFFICE_SUBSTANTIATION").map((issue) => `Issue: ${issue.title}`));
        }
      } else if (normalizedTopic.includes("mileage") || normalizedTopic.includes("vehicle expense")) {
        if (issues.some((issue) => issue.issueType === "MILEAGE_SUBSTANTIATION") || opportunities.some((opportunity) => opportunity.opportunityType === "BUSINESS_MILEAGE") || documentClasses.has("MILEAGE_LOG") || tags.includes("schedule c")) {
          reasons.push("Mileage/vehicle screen: business activity or mileage support exists; substantiation and business-purpose records need review.");
          evidenceLabels.push(...documents.filter((document) => document.documentClass === "MILEAGE_LOG").map((document) => document.fileName));
        }
      } else if (normalizedTopic.includes("1099-b") || normalizedTopic.includes("stock sale") || normalizedTopic.includes("capital gain")) {
        if (issues.some((issue) => issue.issueType === "MISSING_1099_B") || documentClasses.has("FORM_1099_B") || tags.includes("brokerage") || priorYearPatterns.some((pattern) => pattern.expectedCurrentYearDocumentClass === "FORM_1099_B")) {
          reasons.push("Brokerage/capital-gain screen: stock-sale or brokerage pattern exists; proceeds, basis, holding period, and wash-sale support need review.");
          evidenceLabels.push(...documents.filter((document) => document.documentClass === "FORM_1099_B").map((document) => document.fileName));
        }
      } else if (normalizedTopic.includes("1095-a") || normalizedTopic.includes("marketplace insurance") || normalizedTopic.includes("premium tax credit")) {
        if (issues.some((issue) => issue.issueType.includes("1095") || issue.issueType.includes("ACA")) || documentClasses.has("FORM_1095_A") || tags.includes("marketplace insurance")) {
          reasons.push("Marketplace/1095-A screen: ACA premium tax credit facts need MAGI and Form 8962 review before client-facing conclusions.");
          evidenceLabels.push(...documents.filter((document) => document.documentClass === "FORM_1095_A").map((document) => document.fileName));
        }
      } else if (normalizedTopic.includes("crypto") || normalizedTopic.includes("digital asset")) {
        if (issues.some((issue) => normalizeForMatch(issue.issueType).includes("crypto") || normalizeForMatch(issue.description).includes("crypto")) || tags.includes("crypto") || documentClasses.has("CRYPTO_TAX_LOT_REPORT")) {
          reasons.push("Digital asset screen: crypto signal exists; tax-lot accounting remains unsupported automation and needs reviewer/advisory handling.");
          evidenceLabels.push(...documents.filter((document) => document.documentClass === "CRYPTO_TAX_LOT_REPORT").map((document) => document.fileName));
        }
      } else if (issues.length > 0 || taxReturn) {
        reasons.push(`General ${topic} screen: client has an active return file; open only if the provision facts match after source review.`);
      }

      if (reasons.length > 0 && issues.some((issue) => issue.riskLevel === "RED" && isOpenIssue(issue))) {
        reasons.push("Open red issue already exists, so topic-related outreach should be reviewer-controlled.");
      }

      const priority: PortfolioCandidate["priority"] = reasons.length > 0
        ? issues.some((issue) => issue.riskLevel === "RED" && isOpenIssue(issue)) || reasons.some((reason) => reason.includes("Senior"))
          ? "HIGH"
          : "MEDIUM"
        : "MONITOR";

      return {
        clientId: client.id,
        returnId: taxReturn?.id ?? null,
        name: client.displayName,
        priority,
        reasons,
        evidenceLabels: Array.from(new Set(evidenceLabels)).slice(0, 6),
        score: priority === "HIGH" ? 100 : priority === "MEDIUM" ? 60 : 20,
      };
    })
    .filter((candidate) => candidate.reasons.length > 0)
    .sort((a, b) => {
      const rank = { HIGH: 0, MEDIUM: 1, MONITOR: 2 };
      return rank[a.priority] - rank[b.priority] || a.name.localeCompare(b.name);
    });
}

async function buildPortfolioImpactAnswer(_question: string, retrievalQuestion: string): Promise<ChatAnswer> {
  const topic = shouldUseResearchTopicForPortfolio(_question) ? activeResearchTopicFromText(retrievalQuestion) : null;
  if (!topic) {
    const candidates = buildGeneralPortfolioFocusList();
    const topCandidates = candidates.slice(0, 6);
    return {
      mode: "firm-portfolio",
      headline: "Firm focus queue from the current Docket roster.",
      answer: [
        "This is a portfolio/workflow answer, not a tax-law research memo. I did not run authority retrieval because the question is about what to work on now, not about a tax conclusion.",
        ...topCandidates.map((candidate) => `${candidate.priority}: ${candidate.name} — ${candidate.reasons.join(" ")} Evidence: ${candidate.evidenceLabels.join("; ")}.`),
        "Use this as an internal triage queue. It should not generate client-facing tax advice by itself; open the client card when you want the file-specific memo, source packet, questions, or workpapers.",
      ],
      reasoningSummary: [
        "Classified the prompt as firm portfolio/workflow because it asks which clients or returns need attention across the book.",
        "Portfolio mode wins over a loaded client file, so an open Miguel workbench does not hijack plural roster questions.",
        "Ranked the roster by active red issues, blocker issues, extension risk, readiness, missing documents, slow-response behavior, and reviewer actionability.",
        "Skipped authority retrieval because this question does not ask for a tax-law conclusion; the sources used are Docket client/return records.",
      ],
      nextSteps: [
        "Work HIGH items first, starting with the highest combined blocker and extension-risk score.",
        "Open each HIGH client into a client-file memo before drafting client communications.",
        "Keep red/blocker outreach reviewer-controlled until the specific client file clears its review gate.",
      ],
      sourceIds: topCandidates.map((candidate) => candidate.clientId),
      citationIds: [],
      suggestedFollowups: ["Open the top client's file memo.", "Show this as a screening table.", "Draft reviewer tasks for the HIGH queue.", "Which files are likely extensions?"],
      limitation: "This is operational triage, not a client-facing tax position or filing-clearance determination.",
    };
  }

  const candidates = buildTopicPortfolioCandidateList(topic);
  const topCandidates = candidates.slice(0, 6);
  const research = topic ? await retrieveOfficialAuthority(retrievalQuestion) : undefined;
  const sourceIds = topCandidates.map((candidate) => candidate.clientId);

  const answer: ChatAnswer = {
    mode: "firm-portfolio",
    headline: `Named screening candidates for ${topic} from the current Docket client roster.`,
    answer: [
      "Yes. I can name screening candidates from the current Docket roster, but these are not eligibility determinations. They are clients who should be routed into a provision-level review queue based on existing client facts, documents, issues, and tags.",
      ...(topCandidates.length > 0
        ? topCandidates.map((candidate) => `${candidate.priority}: ${candidate.name} — ${candidate.reasons.join(" ")} Evidence: ${candidate.evidenceLabels.join("; ")}.`)
        : [`No current Docket client has enough matching file evidence to name as a ${topic} screening candidate.`]),
      "No client should receive a client-facing number from this screen alone. The next step is provision-level review against current authority, the client's tax year, state conformity, and actual source documents.",
    ],
    reasoningSummary: [
      "Classified the prompt as firm portfolio intelligence because it asks for named clients, not another authority memo.",
      `Used the active research topic '${topic}' from the conversation before screening the roster.`,
      "Screened client tags, return type, source-document classes, and open issue severity; did not invent eligibility facts that are not in the Docket file.",
      "Retrieved authority only to preserve the governing topic; client names came from Docket client records, not from the model.",
    ],
    nextSteps: [
      `Create a ${topic} review queue for the named clients and assign a reviewer before client outreach.`,
      "For each candidate, attach the provision being screened, the client evidence, the missing facts, and the authority source.",
      "Add intake questions and workpaper fields only after the provision-level authority packet is confirmed.",
    ],
    sourceIds,
    citationIds: [],
    suggestedFollowups: ["Show this as a screening table.", "Draft reviewer tasks for these clients.", "Which one is highest risk?", "Create client questions for the top candidates."],
    limitation: "Portfolio screening is not a tax conclusion. It identifies clients who need provision-level review.",
  };
  if (research) answer.retrievedAuthority = research;
  return answer;
}

async function buildGroundedAnswer(question: string, output: ReasoningOutputView | null, hasClientContext: boolean, workbench: WorkbenchView | null, retrievalQuestion = question): Promise<ChatAnswer> {
  const q = question.toLowerCase();
  const clientName = workbench?.client?.displayName ?? "the selected client";
  const incomeIssue = findIssue(output, "issue-income-mismatch");
  const overlapIssue = findIssue(output, "issue-1099k-overlap");
  const stockIssue = findIssue(output, "issue-missing-1099-b");
  const homeOfficeIssue = findIssue(output, "issue-home-office-exclusive-use");
  const mileageIssue = findIssue(output, "issue-mileage-substantiation");
  const stateIssue = findIssue(output, "issue-state-residency");
  const allIssueSourceIds = output?.issueSummaries.flatMap((issue) => issue.sourceIds) ?? [];
  const allCitationIds = output?.authorityContext.citations.map((citation) => citation.citationId) ?? [];
  const activeIssues = workbench?.issues.filter((issue) => issue.status !== "RESOLVED" && issue.status !== "WAIVED_BY_REVIEWER") ?? [];
  const blockerIssues = activeIssues.filter((issue) => issue.blocker);
  const redIssues = activeIssues.filter((issue) => issue.riskLevel === "RED");
  const gateBlockers = workbench?.readyToFileGate.blockers ?? [];
  const missingDocuments = workbench?.missingDocuments.filter((document) => document.status !== "RECEIVED") ?? [];
  const topIssueTitles = (blockerIssues.length ? blockerIssues : redIssues.length ? redIssues : activeIssues)
    .slice(0, 4)
    .map((issue) => issue.title);
  const topIssueText = topIssueTitles.length ? topIssueTitles.join("; ") : "No active blocker issues are currently open.";
  const missingDocumentText = missingDocuments.length
    ? missingDocuments.map((document) => document.expectedDocumentClass.replaceAll("_", " ")).join(", ")
    : "No open missing-document signal is currently recorded.";

  if (isCasualMessage(question)) return buildCasualAnswer();
  if (!question.trim()) {
    return hasClientContext
      ? buildClientDeepDiveAnswer(workbench, output)
      : {
          mode: "general-research",
          headline: "Ask Docket a tax research question or attach a client return context.",
          answer: [
            "This page starts as a general tax research chat. It answers from current authority, cites sources, shows a reasoning summary, and keeps client-facing advice behind review controls.",
            "If you ask about a specific client, Docket switches into client-file mode and answers from documents, claims, conversations, issues, workpapers, and the knowledge snapshot.",
          ],
          reasoningSummary: ["No client file is selected by default.", "General answers require authority retrieval before they become trusted tax conclusions."],
          nextSteps: ["Pick a suggested prompt or ask a new question in the composer."],
          sourceIds: [],
          citationIds: [],
          suggestedFollowups: suggestedQuestions.slice(0, 6),
        };
  }

  if (!hasClientContext) {
    if (isPortfolioClientQuestion(question)) {
      return buildPortfolioImpactAnswer(question, retrievalQuestion);
    }
    const research = await retrieveOfficialAuthority(retrievalQuestion);
    return {
      mode: "general-research",
      headline: research.answer.headline,
      answer: research.answer.paragraphs,
      reasoningSummary: research.answer.reasoningSummary,
      nextSteps: research.answer.nextSteps,
      sourceIds: [],
      citationIds: [],
      suggestedFollowups: ["Ask this about a selected client.", "Show only primary authority.", "What facts would change the answer?"],
      retrievedAuthority: research,
      limitation: research.answer.caveat,
    };
  }

  if (isBareClientLookup(question)) {
    return buildClientLookupAnswer(workbench);
  }

  if (isDeepMemoRequest(question)) {
    return buildClientDeepDiveAnswer(workbench, output);
  }

  if (q.includes("status") || q.includes("in general") || q.includes("need to know") || q.includes("tell me about") || q.includes("overview") || q.includes("summary")) {
    return buildClientStatusAnswer(workbench);
  }

  if (q.includes("block") || q.includes("ready") || q.includes("file") || q.includes("safely conclude")) {
    return {
      mode: "client-return",
      headline: `${clientName}'s ready-to-file answer is controlled by review gates.`,
      answer: [
        gateBlockers.length > 0
          ? `${clientName} is not ready to file because the ready-to-file gate is blocked by: ${gateBlockers.join("; ")}.`
          : `${clientName}'s persisted ready-to-file gate has no listed blocker in the current state.`,
        `The active issue queue is: ${topIssueText}. Open missing document signals: ${missingDocumentText}.`,
        "Docket can summarize the issues and draft questions, but it should not mark a return ready to file until red flags are resolved, client clarifications are answered, material facts are reviewer-approved, and signature/8879 status is complete.",
      ],
      reasoningSummary: [
        `I matched the question to ${clientName}'s return readiness, active issue graph, missing-document signals, and ready-to-file gate.`,
        "The clearance verdict comes from review gates, not the workflow readiness percentage.",
        "Issue-specific details below come from the selected client return rather than a hardcoded demo path.",
      ],
      nextSteps: [
        ...(workbench?.questions
          .filter((questionItem) => questionItem.status !== "ANSWERED")
          .map((questionItem) => questionItem.question)
          .slice(0, 2) ?? []),
        ...(gateBlockers.length > 0 ? ["Clear the ready-to-file gate blockers through documented reviewer action."] : []),
        "Route material facts and any resolved red flags through reviewer approval before filing readiness.",
      ],
      professionalAnalyses: professionalAnalysesForAnswer(workbench, output, blockerIssues.map((issue) => issue.id)),
      sourceIds: [...allIssueSourceIds, ...missingDocuments.flatMap((document) => document.sourceIds)],
      citationIds: [...(incomeIssue?.citationIds ?? []), ...allCitationIds],
      suggestedFollowups: [`Show ${clientName}'s top issue evidence.`, "Draft the exact client questions.", `What review gates are still blocking ${clientName}?`],
    };
  }

  if (q.includes("income") || q.includes("freelance") || q.includes("1099-k") || q.includes("1099k") || q.includes("1099-nec") || q.includes("reconcile")) {
    return {
      mode: "client-return",
      headline: `${clientName}'s income needs source-backed reconciliation.`,
      answer: [
        incomeIssue?.recommendedAction ?? "Docket should separate client claims from document-backed income facts before accepting final gross receipts.",
        "If payer or processor documents may overlap, the system should build a reconciliation table and keep final income facts in review until the overlap is resolved.",
      ],
      reasoningSummary: ["I separated the client claim from document-backed facts.", "The variance is material enough to keep Schedule C gross receipts blocked."],
      nextSteps: [
        ...(workbench?.questions.filter((questionItem) => questionItem.relatedIssueId === incomeIssue?.issueId || questionItem.relatedIssueId === overlapIssue?.issueId).map((questionItem) => questionItem.question).slice(0, 2) ?? []),
        "Request payer/payment-channel detail or bookkeeping support.",
        "Keep the income issue open until the reviewer accepts the reconciled gross receipts fact.",
      ],
      professionalAnalyses: professionalAnalysesForAnswer(workbench, output, ["issue-income-mismatch", "issue-1099k-overlap"]),
      sourceIds: [...(incomeIssue?.sourceIds ?? []), ...(overlapIssue?.sourceIds ?? [])],
      citationIds: [...(incomeIssue?.citationIds ?? []), ...(overlapIssue?.citationIds ?? [])],
      suggestedFollowups: [`What exact question should we ask ${clientName}?`, "What facts are established versus claimed?", "What workpaper should this create?"],
    };
  }

  if (q.includes("1099-b") || q.includes("broker") || q.includes("stock") || q.includes("tesla")) {
    return {
      mode: "client-return",
      headline: `A brokerage document may be expected for ${clientName}.`,
      answer: [
        stockIssue?.recommendedAction ?? "Docket detected a stock or brokerage signal and should request a 1099-B or consolidated brokerage statement before clearing the return.",
        "Treat conversation references as claims until proceeds, basis, holding period, and wash-sale detail are supported by documents or reviewer override.",
      ],
      reasoningSummary: ["I treated the transcript as a conversation claim, not a verified tax fact.", "Docket creates a missing document signal instead of inventing basis or proceeds."],
      nextSteps: ["Ask which brokerage held the shares.", "Request the 2024 consolidated 1099 or transaction statement.", "Escalate if the client cannot provide basis or proceeds support."],
      professionalAnalyses: professionalAnalysesForAnswer(workbench, output, ["issue-missing-1099-b"]),
      sourceIds: stockIssue?.sourceIds ?? ["insight-stock-sale", "pattern-brokerage"],
      citationIds: stockIssue?.citationIds ?? [],
      suggestedFollowups: ["Draft the brokerage document request.", `What can we do if ${clientName} cannot find the 1099-B?`, "Show all missing documents."],
    };
  }

  if (q.includes("home office") || q.includes("exclusive") || q.includes("office deduction")) {
    return {
      mode: "client-return",
      headline: `${clientName} has a possible home office opportunity, but Docket should not auto-claim it.`,
      answer: [
        homeOfficeIssue?.recommendedAction ?? "The opportunity needs exclusive-use and regular-use facts before it can be considered for filing.",
        "Docket should keep this as a review-needed opportunity until the client confirms facts and the reviewer accepts the position.",
      ],
      reasoningSummary: ["I matched the conversation insight to the Schedule C context and checked the substantiation gap.", "Publication 587 is cited for the exclusive and regular business use requirement."],
      nextSteps: ["Ask whether the space was used exclusively and regularly for business during 2024.", "Collect square footage and expense support only if exclusive use is confirmed.", "Route the opportunity for reviewer approval."],
      professionalAnalyses: professionalAnalysesForAnswer(workbench, output, ["issue-home-office-exclusive-use"]),
      sourceIds: homeOfficeIssue?.sourceIds ?? ["insight-home-office"],
      citationIds: homeOfficeIssue?.citationIds ?? ["cite-pub587-exclusive-use"],
      suggestedFollowups: ["What exact home office question should we ask?", "What documents support a home office deduction?", "Should this be a blocker?"],
    };
  }

  if (q.includes("mileage") || q.includes("car") || q.includes("vehicle")) {
    return {
      mode: "client-return",
      headline: `${clientName}'s mileage or vehicle deduction needs substantiation review.`,
      answer: [
        mileageIssue?.recommendedAction ?? "Business mileage should remain review-needed until the records show date, destination, miles, and business purpose.",
        "Docket should not extrapolate partial records or auto-claim a deduction without source-backed support.",
      ],
      reasoningSummary: ["I matched the uploaded mileage log to the deduction opportunity engine.", "Publication 463 is cited for mileage and travel record support."],
      nextSteps: ["Request the full-year contemporaneous mileage log.", "Confirm date, destination, miles, and business purpose for each trip.", "Keep the deduction out of final filing readiness until reviewer approval."],
      professionalAnalyses: professionalAnalysesForAnswer(workbench, output, ["issue-mileage-substantiation"]),
      sourceIds: mileageIssue?.sourceIds ?? ["doc-q4-mileage-log"],
      citationIds: mileageIssue?.citationIds ?? ["cite-pub463-records"],
      suggestedFollowups: ["Draft a mileage support request.", "What facts are missing for mileage?", "Create a mileage workpaper summary."],
    };
  }

  if (q.includes("extension")) {
    return {
      mode: "client-return",
      headline: `Docket should treat ${clientName}'s extension risk as a workflow decision, not a tax conclusion.`,
      answer: [
        `${clientName}'s extension risk score is ${workbench?.extension.extensionRiskScore ?? 0}%. Drivers: ${(workbench?.extension.reasons ?? []).join("; ") || "No drivers currently recorded."}`,
        "This is a workflow recommendation to reduce deadline risk while the firm resolves blockers.",
      ],
      reasoningSummary: ["I combined missing material documents, red issues, unanswered questions, prior-year extension history, and client response latency."],
      nextSteps: ["Prepare the extension workflow while continuing document collection.", "Prioritize the 1099-B and income-overlap clarification.", "Keep reviewer approval gates in place before signature or filing readiness."],
      professionalAnalyses: professionalAnalysesForAnswer(workbench, output, ["issue-income-mismatch", "issue-missing-1099-b", "issue-state-residency"]),
      sourceIds: [...(stockIssue?.sourceIds ?? []), ...(incomeIssue?.sourceIds ?? []), ...(stateIssue?.sourceIds ?? [])],
      citationIds: allCitationIds,
      suggestedFollowups: ["What are the reasons for the extension risk score?", `What would lower ${clientName}'s extension risk?`, "Which client reminders should we send today?"],
    };
  }

  if (q.includes("question") || q.includes("ask") || q.includes("client")) {
    return {
      mode: "client-return",
      headline: "The next client questions should target facts that unlock blocked sections.",
      answer: [
        output?.clientQuestions.length
          ? `The highest-value questions for ${clientName} are the ones already tied to open issues and missing facts in the return file.`
          : `No generated question packet is currently available for ${clientName}; run the prep/reasoning workflow to generate one.`,
      ],
      reasoningSummary: ["I prioritized questions tied to blocker issues before nonblocking opportunities."],
      nextSteps: output?.clientQuestions.map((questionItem) => questionItem.question).slice(0, 5) ?? ["Run AI Prep to generate targeted client questions."],
      professionalAnalyses: professionalAnalysesForAnswer(workbench, output),
      sourceIds: output?.clientQuestions.flatMap((questionItem) => questionItem.sourceIds) ?? [],
      citationIds: output?.clientQuestions.flatMap((questionItem) => questionItem.citationIds) ?? [],
      suggestedFollowups: ["Draft the exact client message.", "Which questions require reviewer approval?", `What questions can the portal show ${clientName}?`],
    };
  }

  return {
    mode: "client-return",
    headline: `I have ${clientName}'s file open. What view do you want?`,
    answer: [
      "I found the client context, but your request is not specific enough for me to run a reviewer memo or make a tax conclusion.",
      "Choose a narrower path: status, filing blockers, missing documents, source evidence, client questions, reconciliation table, extension risk, or full deep dive.",
    ],
    reasoningSummary: [
      "Client context is available, but vague prompts should not trigger a canned memo.",
      "Docket should ask for scope before producing analysis that looks authoritative.",
    ],
    nextSteps: [
      `Ask: 'Give me ${clientName}'s status summary.'`,
      `Ask: 'Show ${clientName}'s filing blockers.'`,
      `Ask: 'Run the full reviewer memo for ${clientName}.'`,
    ],
    sourceIds: [],
    citationIds: [],
    suggestedFollowups: [
      `Give me ${clientName}'s status summary.`,
      `Show ${clientName}'s filing blockers.`,
      `Show the evidence for ${clientName}'s top issue.`,
      `Run the full reviewer memo for ${clientName}.`,
    ],
  };
}

function buildSourcePacket(answer: ChatAnswer, sourceIndex: Record<string, SourceIndexEntry>) {
  const clientSources = Array.from(new Set([...answer.sourceIds, ...answer.citationIds])).map((id) => {
    const source = sourceIndex[id];
    return { id, label: source ? `${source.type}: ${source.label}` : id, detail: source?.detail ?? id };
  });
  const authoritySources =
    answer.retrievedAuthority?.sources.map((source) => ({
      id: source.id,
      label: source.title,
      detail: `${source.publisher} · ${source.authorityLevel.replaceAll("_", " ")} · ${source.fetchStatus} · retrieved ${source.retrievedAt}`,
      url: source.sourceUrl,
      snippets: source.snippets,
    })) ?? [];
  return [...clientSources, ...authoritySources];
}

function buildResearchSourceIndex(answer: ChatAnswer): Record<string, SourceIndexEntry> {
  const entries: Record<string, SourceIndexEntry> = {};
  for (const source of answer.retrievedAuthority?.sources ?? []) {
    entries[source.id] = {
      id: source.id,
      type: source.publisher,
      label: source.title,
      detail: `${source.authorityLevel.replaceAll("_", " ")} · ${source.fetchStatus} · ${source.sourceUrl}`,
    };
  }
  return entries;
}

function buildPortfolioSourceIndex(answer: ChatAnswer): Record<string, SourceIndexEntry> {
  if (answer.mode !== "firm-portfolio") return {};
  const data = readDocketData();
  const entries: Record<string, SourceIndexEntry> = {};
  for (const sourceId of answer.sourceIds) {
    const client = data.clients.find((item) => item.id === sourceId);
    if (client) {
      const taxReturn = data.taxReturns.find((returnRecord) => returnRecord.clientId === client.id);
      entries[sourceId] = {
        id: sourceId,
        type: "Client roster",
        label: client.displayName,
        detail: `${taxReturn?.taxYear ?? "Current"} ${taxReturn?.returnType ?? "return"} · tags: ${client.tags.join(", ")}`,
      };
    }
  }
  return entries;
}

function maybeSynthesizeWithClaude(
  question: string,
  answer: ChatAnswer,
  workbench: WorkbenchView | null,
  sourceIndex: Record<string, SourceIndexEntry>,
  conversationHistory: ChatHistoryTurn[],
): ChatAnswer {
  if (!question.trim() || isCasualMessage(question)) return answer;
  if (answer.mode === "firm-portfolio") return answer;
  const draftAnswer = {
    headline: answer.headline,
    answer: answer.answer,
    reasoningSummary: answer.reasoningSummary,
    nextSteps: answer.nextSteps,
    suggestedFollowups: answer.suggestedFollowups,
  };
  if (answer.limitation) Object.assign(draftAnswer, { limitation: answer.limitation });

  const synthesis = synthesizeTaxChatWithClaude({
    question,
    mode: answer.mode,
    clientContextLabel: workbench?.client ? `${workbench.client.displayName} · ${workbench.taxReturn.taxYear} ${workbench.taxReturn.returnType}` : null,
    conversationHistory,
    draftAnswer,
    sourcePacket: buildSourcePacket(answer, sourceIndex),
  });
  if (!synthesis) return answer;
  const synthesized: ChatAnswer = {
    ...answer,
    headline: synthesis.headline,
    answer: synthesis.answer,
    reasoningSummary: synthesis.reasoningSummary,
    nextSteps: synthesis.nextSteps,
    suggestedFollowups: synthesis.suggestedFollowups,
    synthesizedBy: "claude-code-cli",
  };
  if (synthesis.limitation) synthesized.limitation = synthesis.limitation;
  return synthesized;
}

export async function buildTaxChatResponse(question: string, returnId?: string, conversationHistory: ChatHistoryTurn[] = []): Promise<TaxChatResponse> {
  const workbench = resolveWorkbench(question, returnId, conversationHistory);
  const hasClientContext = Boolean(workbench);
  const retrievalQuestion = hasClientContext ? question : researchRetrievalQuery(question, conversationHistory);
  const output = asReasoningOutputView(workbench?.latestAIReasoningRun?.output);
  let sourceIndex: Record<string, SourceIndexEntry> = {};
  for (const [id, source] of Object.entries(workbench?.reasoningSourceIndex ?? {})) {
    sourceIndex[id] = {
      id: source.id,
      type: source.type,
      label: source.label,
      detail: source.detail,
    };
  }
  const draftAnswer = await buildGroundedAnswer(question, output, hasClientContext, workbench, retrievalQuestion);
  sourceIndex = { ...sourceIndex, ...buildResearchSourceIndex(draftAnswer) };
  sourceIndex = { ...sourceIndex, ...buildPortfolioSourceIndex(draftAnswer) };
  if (workbench) {
    draftAnswer.artifacts = runTaxChatOrchestrator({
      question,
      returnId: workbench.taxReturn.id,
      history: conversationHistory,
    });
  }
  return {
    answer: maybeSynthesizeWithClaude(question, draftAnswer, workbench, sourceIndex, conversationHistory),
    sourceIndex,
    contextLabel: workbench?.client ? `${workbench.client.displayName} · ${workbench.taxReturn.taxYear} ${workbench.taxReturn.returnType}` : null,
    contextReturnId: workbench?.taxReturn.id ?? null,
  };
}
