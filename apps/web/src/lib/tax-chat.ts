import { synthesizeTaxChatWithClaude } from "@docket/ai";
import { getReturnWorkbench } from "@docket/domain";
import { retrieveOfficialAuthority } from "@docket/tax-knowledge";

import { suggestedQuestions, type ChatAnswer, type ChatHistoryTurn, type SourceIndexEntry, type TaxChatResponse } from "./tax-chat-shared";

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

function isClientContextQuestion(question: string, explicitReturnId?: string, history: ChatHistoryTurn[] = []): boolean {
  const q = [question, ...history.slice(-6).map((turn) => turn.content)].join("\n").toLowerCase();
  return Boolean(explicitReturnId) || /\bmiguel\b|\bsandoval\b|his return|client file|this return|this client|home office|1099-b|tesla|mileage|extension risk|ready to file|schedule c/.test(q);
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
    nextSteps: ["Ask a general tax question, open a return context, or ask about Miguel if you want the seeded client file."],
    sourceIds: [],
    citationIds: [],
    suggestedFollowups: suggestedQuestions.slice(0, 4),
  };
}

function buildClientDeepDiveAnswer(workbench: WorkbenchView | null, output: ReasoningOutputView | null): ChatAnswer {
  const clientName = workbench?.client?.displayName ?? "this client";
  const taxReturn = workbench?.taxReturn;
  const redIssues = workbench?.issues.filter((issue) => issue.riskLevel === "RED" && issue.status !== "RESOLVED") ?? [];
  const blockerIssues = workbench?.issues.filter((issue) => issue.blocker && issue.status !== "RESOLVED") ?? [];
  const missingDocuments = workbench?.missingDocuments.filter((document) => document.status !== "RECEIVED") ?? [];
  const unansweredQuestions = workbench?.questions.filter((question) => question.status !== "ANSWERED") ?? [];
  const unapprovedFacts = workbench?.taxFacts.filter((fact) => fact.materiality !== "LOW" && fact.reviewStatus !== "REVIEWER_APPROVED" && fact.reviewStatus !== "PARTNER_OVERRIDE") ?? [];
  const citedIssueIds = output?.issueSummaries.flatMap((issue) => [...issue.sourceIds, ...issue.citationIds]) ?? [];

  return {
    mode: "client-return",
    headline: `${clientName}'s return is high-risk and not ready to file.`,
    answer: [
      `${clientName} is in ${taxReturn?.status.replaceAll("_", " ").toLowerCase() ?? "an active"} status for tax year ${taxReturn?.taxYear ?? "the selected tax year"} ${taxReturn?.returnType ?? "return"}. Readiness is ${workbench?.readiness.readinessScore ?? 0}% and extension risk is ${workbench?.extension.extensionRiskScore ?? 0}%.`,
      "The main story is a self-employed client with Schedule C activity, prior-year extension history, slow response behavior, a CA-to-TX move, possible home office and mileage deductions, and a missing brokerage document after a stock-sale mention.",
      `The return should stay blocked from filing readiness because there are ${redIssues.length} open red issue(s), ${blockerIssues.length} blocker issue(s), ${missingDocuments.length} missing document signal(s), ${unansweredQuestions.length} unanswered clarification(s), and ${unapprovedFacts.length} material fact(s) still needing reviewer approval.`,
    ],
    reasoningSummary: [
      "I used the return workbench state because the prompt asks about a client return.",
      "Readiness and extension risk are workflow scores; deductible treatment and final filing readiness still require review.",
      "The primary risks are unresolved red issues, missing brokerage support, income reconciliation, state residency facts, substantiation gaps, and reviewer approval gates.",
    ],
    nextSteps: [
      "Resolve the Schedule C income mismatch by confirming whether Stripe 1099-K payments overlap with Bluepeak 1099-NEC payments.",
      "Request the 2024 consolidated brokerage 1099 or transaction statement for the Tesla stock sale.",
      "Confirm the exact CA-to-TX move date and whether any California work continued after the move.",
      "Do not claim home office or mileage until the missing substantiation facts are answered and reviewed.",
      "Prepare an extension workflow unless the missing 1099-B, red flags, and review approvals are resolved quickly.",
    ],
    sourceIds: [
      ...(workbench?.documents.map((document) => document.id) ?? []),
      ...(workbench?.issues.flatMap((issue) => issue.sourceIds) ?? []),
      ...(workbench?.missingDocuments.flatMap((document) => document.sourceIds) ?? []),
      ...citedIssueIds,
    ],
    citationIds: output?.authorityContext.citations.map((citation) => citation.citationId) ?? [],
    suggestedFollowups: [
      "Show Miguel's top blockers.",
      "What source supports each red flag?",
      "Draft the client questions for Miguel.",
      "What needs reviewer approval?",
      "What would make Miguel ready for signature?",
    ],
  };
}

async function buildGroundedAnswer(question: string, output: ReasoningOutputView | null, hasClientContext: boolean, workbench: WorkbenchView | null): Promise<ChatAnswer> {
  const q = question.toLowerCase();
  const incomeIssue = findIssue(output, "issue-income-mismatch");
  const overlapIssue = findIssue(output, "issue-1099k-overlap");
  const stockIssue = findIssue(output, "issue-missing-1099-b");
  const homeOfficeIssue = findIssue(output, "issue-home-office-exclusive-use");
  const mileageIssue = findIssue(output, "issue-mileage-substantiation");
  const stateIssue = findIssue(output, "issue-state-residency");
  const allIssueSourceIds = output?.issueSummaries.flatMap((issue) => issue.sourceIds) ?? [];
  const allCitationIds = output?.authorityContext.citations.map((citation) => citation.citationId) ?? [];

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
    const research = await retrieveOfficialAuthority(question);
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

  if (q.includes("status") || q.includes("deep dive") || q.includes("in general") || q.includes("need to know") || q.includes("tell me about") || q.includes("overview") || q.includes("summary")) {
    return buildClientDeepDiveAnswer(workbench, output);
  }

  if (q.includes("block") || q.includes("ready") || q.includes("file") || q.includes("safely conclude")) {
    return {
      mode: "client-return",
      headline: "Miguel is not ready to file because several blocker and review-gated items remain open.",
      answer: [
        "The red blockers are the unreconciled Schedule C income and the missing 1099-B after Miguel mentioned selling Tesla stock.",
        "Docket can summarize the issues and draft questions, but it should not mark the return ready to file until red flags are resolved, client clarifications are answered, material facts are reviewer-approved, and signature/8879 status is complete.",
      ],
      reasoningSummary: [
        "I matched the question to the return readiness and issue graph for Miguel's 2024 1040 + Schedule C return.",
        "The income mismatch is blocker-level because Miguel's $85K claim does not reconcile to the 1099-NEC and 1099-K evidence.",
        "The stock-sale transcript creates an expected brokerage document signal, but no 1099-B is currently in the source document set.",
      ],
      nextSteps: [
        "Ask Miguel whether Stripe 1099-K receipts overlap with Bluepeak 1099-NEC payments.",
        "Request the 2024 consolidated brokerage 1099 for the Tesla sale.",
        "Route material facts and any resolved red flags through reviewer approval before filing readiness.",
      ],
      sourceIds: [...(incomeIssue?.sourceIds ?? []), ...(stockIssue?.sourceIds ?? []), ...allIssueSourceIds],
      citationIds: [...(incomeIssue?.citationIds ?? []), ...allCitationIds],
      suggestedFollowups: ["Show me the income mismatch evidence.", "Draft the exact client questions.", "What review gates are still blocking Miguel?"],
    };
  }

  if (q.includes("income") || q.includes("freelance") || q.includes("1099-k") || q.includes("1099k") || q.includes("1099-nec") || q.includes("reconcile")) {
    return {
      mode: "client-return",
      headline: "Miguel's freelance income does not reconcile yet.",
      answer: [
        "Miguel claimed about $85K of freelance income. The current source documents show a Bluepeak 1099-NEC for $42K and a Stripe 1099-K for $63K.",
        "Those documents total $105K if fully separate, but they may overlap. Docket should not set final Schedule C gross receipts until the overlap question is answered and reviewed.",
      ],
      reasoningSummary: ["I separated the client claim from document-backed facts.", "The variance is material enough to keep Schedule C gross receipts blocked."],
      nextSteps: ["Ask whether the Stripe 1099-K includes payments also reported on the Bluepeak 1099-NEC.", "Request Stripe detail or bookkeeping support.", "Keep the income issue open until the reviewer accepts the reconciled gross receipts fact."],
      sourceIds: [...(incomeIssue?.sourceIds ?? []), ...(overlapIssue?.sourceIds ?? [])],
      citationIds: [...(incomeIssue?.citationIds ?? []), ...(overlapIssue?.citationIds ?? [])],
      suggestedFollowups: ["What exact question should we ask Miguel?", "What facts are established versus claimed?", "What workpaper should this create?"],
    };
  }

  if (q.includes("1099-b") || q.includes("broker") || q.includes("stock") || q.includes("tesla")) {
    return {
      mode: "client-return",
      headline: "A 1099-B or consolidated brokerage statement is expected for Miguel.",
      answer: ["Miguel said in the meeting transcript that he sold Tesla stock in March. Docket also has a prior-year brokerage pattern.", "No 1099-B is currently in the document set, so the stock-sale issue remains a red blocker for the return workflow."],
      reasoningSummary: ["I treated the transcript as a conversation claim, not a verified tax fact.", "Docket creates a missing document signal instead of inventing basis or proceeds."],
      nextSteps: ["Ask which brokerage held the Tesla shares.", "Request the 2024 consolidated 1099 or transaction statement.", "Escalate if the client cannot provide basis or proceeds support."],
      sourceIds: stockIssue?.sourceIds ?? ["insight-stock-sale", "pattern-brokerage"],
      citationIds: stockIssue?.citationIds ?? [],
      suggestedFollowups: ["Draft the brokerage document request.", "What can we do if Miguel cannot find the 1099-B?", "Show all missing documents."],
    };
  }

  if (q.includes("home office") || q.includes("exclusive") || q.includes("office deduction")) {
    return {
      mode: "client-return",
      headline: "Miguel has a possible home office opportunity, but Docket should not auto-claim it.",
      answer: ["The opportunity is detected because Miguel has Schedule C activity and mentioned using a room at home as an office.", "The issue is not ready because he also said guests sometimes stay there, so exclusive use is not confirmed."],
      reasoningSummary: ["I matched the conversation insight to the Schedule C context and checked the substantiation gap.", "Publication 587 is cited for the exclusive and regular business use requirement."],
      nextSteps: ["Ask whether the space was used exclusively and regularly for business during 2024.", "Collect square footage and expense support only if exclusive use is confirmed.", "Route the opportunity for reviewer approval."],
      sourceIds: homeOfficeIssue?.sourceIds ?? ["insight-home-office"],
      citationIds: homeOfficeIssue?.citationIds ?? ["cite-pub587-exclusive-use"],
      suggestedFollowups: ["What exact home office question should we ask?", "What documents support a home office deduction?", "Should this be a blocker?"],
    };
  }

  if (q.includes("mileage") || q.includes("car") || q.includes("vehicle")) {
    return {
      mode: "client-return",
      headline: "Miguel's mileage is a possible deduction, but support is incomplete.",
      answer: ["Docket sees a Q4 mileage log, so business mileage is a possible deduction opportunity.", "The concern is that the log lacks full-year coverage and business-purpose support, so it should remain review-needed."],
      reasoningSummary: ["I matched the uploaded mileage log to the deduction opportunity engine.", "Publication 463 is cited for mileage and travel record support."],
      nextSteps: ["Request the full-year contemporaneous mileage log.", "Confirm date, destination, miles, and business purpose for each trip.", "Keep the deduction out of final filing readiness until reviewer approval."],
      sourceIds: mileageIssue?.sourceIds ?? ["doc-q4-mileage-log"],
      citationIds: mileageIssue?.citationIds ?? ["cite-pub463-records"],
      suggestedFollowups: ["Draft a mileage support request.", "What facts are missing for mileage?", "Create a mileage workpaper summary."],
    };
  }

  if (q.includes("extension")) {
    return {
      mode: "client-return",
      headline: "Docket should recommend preparing an extension for Miguel now.",
      answer: ["Miguel's extension risk is high because a 1099-B is missing, red flags remain unresolved, state residency facts need follow-up, and he is a slow responder.", "This is a workflow recommendation to reduce deadline risk while the firm resolves blockers."],
      reasoningSummary: ["I combined missing material documents, red issues, unanswered questions, prior-year extension history, and client response latency."],
      nextSteps: ["Prepare the extension workflow while continuing document collection.", "Prioritize the 1099-B and income-overlap clarification.", "Keep reviewer approval gates in place before signature or filing readiness."],
      sourceIds: [...(stockIssue?.sourceIds ?? []), ...(incomeIssue?.sourceIds ?? []), ...(stateIssue?.sourceIds ?? [])],
      citationIds: allCitationIds,
      suggestedFollowups: ["What are the reasons for the extension risk score?", "What would lower Miguel's extension risk?", "Which client reminders should we send today?"],
    };
  }

  if (q.includes("question") || q.includes("ask") || q.includes("client")) {
    return {
      mode: "client-return",
      headline: "The next client questions should target facts that unlock blocked sections.",
      answer: ["The most important questions are about 1099-K overlap, the Tesla brokerage account, the exact CA-to-TX move date, and home office exclusive use."],
      reasoningSummary: ["I prioritized questions tied to blocker issues before nonblocking opportunities."],
      nextSteps: output?.clientQuestions.map((questionItem) => questionItem.question).slice(0, 5) ?? ["Run AI Prep to generate targeted client questions."],
      sourceIds: output?.clientQuestions.flatMap((questionItem) => questionItem.sourceIds) ?? [],
      citationIds: output?.clientQuestions.flatMap((questionItem) => questionItem.citationIds) ?? [],
      suggestedFollowups: ["Draft the exact client message.", "Which questions require reviewer approval?", "What questions can the portal show Miguel?"],
    };
  }

  return buildClientDeepDiveAnswer(workbench, output);
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

function maybeSynthesizeWithClaude(
  question: string,
  answer: ChatAnswer,
  workbench: WorkbenchView | null,
  sourceIndex: Record<string, SourceIndexEntry>,
  conversationHistory: ChatHistoryTurn[],
): ChatAnswer {
  if (!question.trim() || isCasualMessage(question)) return answer;
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
  const hasClientContext = isClientContextQuestion(question, returnId, conversationHistory);
  const selectedReturnId = hasClientContext ? returnId ?? "return-miguel-2024" : "";
  const workbench = hasClientContext ? getReturnWorkbench(selectedReturnId) ?? null : null;
  const output = asReasoningOutputView(workbench?.latestAIReasoningRun?.output);
  const sourceIndex = workbench?.reasoningSourceIndex ?? {};
  const draftAnswer = await buildGroundedAnswer(question, output, hasClientContext, workbench);
  return {
    answer: maybeSynthesizeWithClaude(question, draftAnswer, workbench, sourceIndex, conversationHistory),
    sourceIndex,
    contextLabel: workbench?.client ? `${workbench.client.displayName} · ${workbench.taxReturn.taxYear} ${workbench.taxReturn.returnType}` : null,
    contextReturnId: workbench?.taxReturn.id ?? null,
  };
}
