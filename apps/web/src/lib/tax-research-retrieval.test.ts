import { describe, expect, it } from "vitest";

import { rankAuthorityCatalog } from "@docket/tax-knowledge";

import { buildTaxChatResponse, researchRetrievalQuery } from "./tax-chat";

describe("tax research authority ranking", () => {
  it("keeps current-law research anchored to topic-specific official authority", () => {
    const obbba = rankAuthorityCatalog("hello can you tell me how the OBBBA will impact my clients").slice(0, 3);
    expect(obbba.map((source) => source.id)).toEqual([
      "congress-pl119-21-obbba",
      "irs-obbba-no-2025-information-return-changes",
      "irs-obbba-provisions",
    ]);
  });

  it("does not let generic landing pages outrank the directly relevant IRS source", () => {
    expect(rankAuthorityCatalog("how should I substantiate business mileage")[0]?.id).toBe("irs-pub-463");
    expect(rankAuthorityCatalog("what should preparers know about Form 2553 late S election")[0]?.id).toBe("irs-form-2553");
    expect(rankAuthorityCatalog("hello").map((source) => source.id)).not.toContain("ecfr-title-26");
  });

  it("carries the active research topic into ambiguous follow-up retrieval", () => {
    const query = researchRetrievalQuery("how does this affect my clients?", [
      { role: "user", content: "OBBBA overview: what preparers need to know now" },
      { role: "assistant", content: "The One, Big, Beautiful Bill Act was enacted as Public Law 119-21." },
    ]);

    expect(query).toContain("OBBBA Public Law 119-21 client impact");
    expect(rankAuthorityCatalog(query)[0]?.id).toBe("congress-pl119-21-obbba");
  });

  it("does not let generic affect/tax-reform language pull the thread into old TCJA content", () => {
    const query = researchRetrievalQuery("how does this affect my clients?", [
      { role: "assistant", content: "OBBBA Public Law 119-21 changed several 2025 deductions and credits." },
    ]);
    const rankedIds = rankAuthorityCatalog(query).slice(0, 5).map((source) => source.id);

    expect(rankedIds).toContain("congress-pl119-21-obbba");
    expect(rankedIds.some((id) => id.toLowerCase().includes("tcja"))).toBe(false);
  });

  it("routes named-client impact questions into firm portfolio screening instead of random IRS fallback", async () => {
    const response = await buildTaxChatResponse("which of my clients are affected specifically by it? can you give a name?", undefined, [
      { role: "assistant", content: "OBBBA Public Law 119-21 changed several 2025 deductions and credits." },
    ]);

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.answer.answer.join("\n")).toContain("Nora Williams");
    expect(response.answer.sourceIds).toContain("client-nora-williams");
    expect(response.sourceIndex["client-nora-williams"]?.type).toBe("Client roster");
    expect(response.answer.retrievedAuthority?.sources.map((source) => source.id)).toContain("congress-pl119-21-obbba");
    expect(response.answer.retrievedAuthority?.sources.map((source) => source.title).join(" ")).not.toMatch(/403b|1120-L|Name After Marriage/i);
  }, 15_000);

  it("keeps broad client-impact followups in research mode instead of prematurely naming clients", async () => {
    const response = await buildTaxChatResponse("how does it affect my clients directly?", undefined, [
      { role: "assistant", content: "OBBBA Public Law 119-21 changed several 2025 deductions and credits." },
    ]);

    expect(response.answer.mode).toBe("general-research");
    expect(response.answer.retrievedAuthority?.sources.map((source) => source.id)).toContain("congress-pl119-21-obbba");
    expect(response.answer.answer.join("\n")).not.toContain("HIGH: Miguel Sandoval");
  }, 15_000);

  it("routes general focus questions to portfolio mode even when Miguel is the loaded file", async () => {
    const response = await buildTaxChatResponse("which clients of mine do I need to focus on right now", "return-miguel-2024", [
      { role: "assistant", content: "OBBBA Public Law 119-21 changed several 2025 deductions and credits." },
    ]);

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.contextReturnId).toBeNull();
    expect(response.answer.retrievedAuthority).toBeUndefined();
    expect(response.answer.answer.join("\n")).toContain("Omar Haddad");
    expect(response.answer.answer.join("\n")).toContain("Ben Larson");
    expect(response.answer.artifacts).toBeUndefined();
    expect(response.sourceIndex["client-omar-haddad"]?.type).toBe("Client roster");
  }, 15_000);

  it("routes firm-wide handoff questions to portfolio mode even when Miguel is loaded", async () => {
    const response = await buildTaxChatResponse("Antonio's been gone for two weeks. Catch him up on what we've decided across all clients.", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.contextReturnId).toBeNull();
    expect(response.answer.artifacts).toBeUndefined();
    expect(response.answer.headline).toContain("Cross-client handoff");
    expect(text).toContain("No formal decision log");
    expect(text).toContain("Miguel remains unresolved");
    expect(text).not.toContain("Issues, ranked by filing impact");
  }, 15_000);

  it("keeps tipped-occupation intake in portfolio mode instead of appending Miguel's file memo", async () => {
    const response = await buildTaxChatResponse("Just focusing on tipped occupation clients, what do I need from them?", "return-miguel-2024", [
      { role: "assistant", content: "OBBBA Public Law 119-21 changed several 2025 deductions and credits." },
    ]);
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.contextReturnId).toBeNull();
    expect(response.answer.artifacts).toBeUndefined();
    expect(response.answer.headline).toContain("Tipped-occupation");
    expect(text).toContain("W-2 Box 7");
    expect(text).toContain("Form 4137");
    expect(text).toContain("does not store a first-class tipped-occupation flag");
    expect(text).not.toContain("Issues, ranked by filing impact");
    expect(text).not.toContain("Freelance income does not reconcile");
  }, 15_000);

  it("releases a prior research topic when the user pivots to non-topic portfolio triage", async () => {
    const query = researchRetrievalQuery("in general. non obbba but just in general what do I need to work on right now", [
      { role: "assistant", content: "OBBBA Public Law 119-21 changed several 2025 deductions and credits." },
    ]);
    const response = await buildTaxChatResponse("in general. non obbba but just in general what do I need to work on right now", undefined, [
      { role: "assistant", content: "OBBBA Public Law 119-21 changed several 2025 deductions and credits." },
    ]);

    expect(query).not.toContain("OBBBA Public Law 119-21 client impact");
    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.answer.retrievedAuthority).toBeUndefined();
    expect(response.answer.reasoningSummary.join(" ")).toContain("Ranked the roster by active red issues");
  }, 15_000);

  it("routes deadline-risk wording to portfolio mode instead of authority research", async () => {
    const response = await buildTaxChatResponse("whos at risk of missing the deadline?", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.contextReturnId).toBeNull();
    expect(response.answer.retrievedAuthority).toBeUndefined();
    expect(response.answer.headline).toContain("Deadline-risk");
    expect(text).toContain("Omar Haddad");
    expect(text).toContain("Miguel Sandoval");
    expect(text).not.toMatch(/retirement-plan|CAWR|VCP/i);
  }, 15_000);

  it("filters 8867 questions to due-diligence candidates instead of returning the generic queue", async () => {
    const response = await buildTaxChatResponse("which clients are missing 8867 due diligence?");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.answer.headline).toContain("Form 8867");
    expect(response.answer.sourceIds).toEqual(expect.arrayContaining(["client-sophia-martinez", "client-lucas-peterson"]));
    expect(response.answer.sourceIds).not.toContain("client-miguel-sandoval");
    expect(text).toContain("Sophia Martinez");
    expect(text).toContain("Lucas Peterson");
    expect(text).toContain("not stored as a first-class field");
    expect(text).not.toContain("Open red issues:");
    expect(text).not.toMatch(/filtered portfolio|default firm queue|generic workflow/i);
    expect(response.answer.reasoningSummary.join(" ")).not.toMatch(/Detected|Classified|generic workflow/i);
  }, 15_000);

  it("keeps open-red and 6694 portfolio prose substantive instead of exposing routing internals", async () => {
    const redResponse = await buildTaxChatResponse("Show me everyone with an open red issue.");
    const exposureResponse = await buildTaxChatResponse("What's my §6694 exposure across the book right now?");
    const combinedText = [
      ...redResponse.answer.answer,
      ...redResponse.answer.reasoningSummary,
      ...exposureResponse.answer.answer,
      ...exposureResponse.answer.reasoningSummary,
    ].join("\n");

    expect(redResponse.answer.mode).toBe("firm-portfolio");
    expect(exposureResponse.answer.mode).toBe("firm-portfolio");
    expect(redResponse.answer.answer.join("\n")).toContain("Miguel Sandoval");
    expect(exposureResponse.answer.answer.join("\n")).toContain("false clearance");
    expect(combinedText).not.toMatch(/filtered portfolio|default firm queue|generic workflow|Detected a portfolio|Classified/i);
  }, 15_000);

  it("keeps cross-client fact-pattern comparisons in portfolio mode without rendering a client memo", async () => {
    const response = await buildTaxChatResponse("Which clients have similar fact patterns to Miguel?", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.contextReturnId).toBeNull();
    expect(response.answer.artifacts).toBeUndefined();
    expect(response.answer.headline).toContain("similar to Miguel Sandoval");
    expect(text).toContain("Priya Narayan");
    expect(text).not.toContain("Issues, ranked by filing impact");
  }, 15_000);

  it("ranks open files by urgency in portfolio mode without appending Miguel's issue stack", async () => {
    const response = await buildTaxChatResponse("Rank my open files by urgency.", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.contextReturnId).toBeNull();
    expect(response.answer.artifacts).toBeUndefined();
    expect(response.answer.headline).toContain("urgency");
    expect(text).toContain("1. Omar Haddad");
    expect(text).toContain("Omar Haddad");
    expect(text).toContain("2. Miguel Sandoval");
    expect(text).not.toContain("Issues, ranked by filing impact");
  }, 15_000);

  it("answers audit-risk portfolio questions with audit signals instead of the default urgency queue", async () => {
    const response = await buildTaxChatResponse("Which clients have the highest audit risk going into filing?", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.contextReturnId).toBeNull();
    expect(response.answer.headline).toContain("Audit-risk");
    expect(text).toContain("Audit risk here means filing positions");
    expect(text).toContain("Schedule C gross receipts do not reconcile");
    expect(text).toContain("Digital asset tax-lot support");
    expect(text).not.toContain("Highest-priority files right now");
  }, 15_000);

  it("applies compound portfolio filters for CA residency and Schedule C income over a threshold", async () => {
    const response = await buildTaxChatResponse("Which of my files have CA part-year residency questions and also Pull a list of clients with Schedule C income over $50K.");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.answer.headline).toContain("CA residency");
    expect(text).toContain("Miguel Sandoval");
    expect(text).toContain("Hannah Kim");
    expect(text).toContain("Priya Narayan");
    expect(text).toContain("Schedule C source-backed income signals over $50,000");
    expect(text).not.toContain("Highest-priority files right now");
  }, 15_000);

  it("keeps EITC year-over-year deltas in portfolio mode and refuses to invent missing fields", async () => {
    const response = await buildTaxChatResponse("Who's claiming EITC this year and didn't last year? Why?", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.contextReturnId).toBeNull();
    expect(response.answer.headline).toContain("No source-backed EITC");
    expect(text).toContain("does not currently store prior-year Form 1040 line 27");
    expect(text).toContain("Do not name a newly claiming EITC client");
    expect(response.answer.artifacts).toBeUndefined();
  }, 15_000);

  it("blocks income-based upsell targeting as a 7216 use issue", async () => {
    const response = await buildTaxChatResponse("Which of my clients has the highest income? I want to know who to upsell.");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.answer.headline).toContain("can't rank clients");
    expect(response.answer.sourceIds).toEqual([]);
    expect(text).toContain("§7216 use issue");
    expect(text).toContain("without a valid taxpayer consent");
    expect(text).not.toContain("Miguel Sandoval");
    expect(text).not.toContain("HIGH:");
  }, 15_000);

  it("answers FBAR and foreign-account screens through a registered portfolio filter", async () => {
    const response = await buildTaxChatResponse("Which clients have foreign accounts or potential FBAR exposure?", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.contextReturnId).toBeNull();
    expect(response.answer.headline.toLowerCase()).toContain("foreign-account");
    expect(response.answer.sourceIds).toEqual([]);
    expect(text).toContain("No client in the current Docket roster has a source-backed foreign-account");
    expect(text).toContain("not the same as an affirmative no-FBAR conclusion");
    expect(text).not.toContain("Highest-priority files right now");
    expect(text).not.toContain("HIGH:");
  }, 15_000);

  it("does not fall back to the generic queue for unregistered portfolio filters", async () => {
    const response = await buildTaxChatResponse("Which clients have AMT exposure?", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.contextReturnId).toBeNull();
    expect(response.answer.headline).toContain("No supported portfolio filter");
    expect(response.answer.sourceIds).toEqual([]);
    expect(text).toContain("I do not have a source-backed portfolio filter");
    expect(text).toContain("will not substitute the generic urgency queue");
    expect(text).not.toContain("Highest-priority files right now");
    expect(text).not.toContain("Miguel Sandoval");
  }, 15_000);

  it("answers employer and state-withholding portfolio scans from W-2 evidence", async () => {
    const response = await buildTaxChatResponse("Which clients have the same employer? Could there be coordination on state withholding?");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("firm-portfolio");
    expect(response.answer.headline).toContain("Employer and state-withholding");
    expect(text).toContain("No same-employer groups");
    expect(text).toContain("Miguel Sandoval");
    expect(text).toContain("Hannah Kim");
    expect(response.answer.retrievedAuthority).toBeUndefined();
  }, 15_000);

  it("answers exact 1099-NEC source confirmation without dumping Miguel's issue stack", async () => {
    const response = await buildTaxChatResponse("You said earlier that Miguel has a $42,000 NEC. Confirm that and tell me the exact line on the form.", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("client-return");
    expect(response.answer.presentation).toBe("conversation");
    expect(response.contextLabel).toContain("Miguel Sandoval");
    expect(response.answer.artifacts).toBeUndefined();
    expect(response.answer.professionalAnalyses).toBeUndefined();
    expect(response.answer.headline).toContain("$42,000");
    expect(text).toContain("Form 1099-NEC Box 1");
    expect(text).toContain("Nonemployee compensation: $42,000.00");
  }, 15_000);

  it("turns broad Miguel work requests into the full client work memo", async () => {
    const response = await buildTaxChatResponse("what do we need to do for Miguel?", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("client-return");
    expect(response.answer.presentation).toBe("conversation");
    expect(response.contextLabel).toContain("Miguel Sandoval");
    expect(response.answer.headline).toContain("not ready to file");
    expect(response.answer.artifacts).toBeDefined();
    expect(response.answer.artifacts?.intent).toBe("deep_memo");
    expect(response.answer.professionalAnalyses?.map((analysis) => analysis.title)).toContain("Freelance income does not reconcile");
    expect(text).toContain("Freelance income does not reconcile");
    expect(text).toContain("Missing 1099-B after stock sale mention");
    expect(text).not.toContain("What view do you want");
  }, 15_000);

  it("answers W-2 Box 12 code D from document evidence or says the field is missing", async () => {
    const response = await buildTaxChatResponse("from Miguel's W-2, what's in box 12 code D", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("client-return");
    expect(response.contextLabel).toContain("Miguel Sandoval");
    expect(response.answer.artifacts).toBeUndefined();
    expect(response.answer.professionalAnalyses).toBeUndefined();
    expect(response.answer.headline).toContain("does not expose Box 12 code D");
    expect(text).toContain("Acme_W2_2024.pdf");
    expect(text).toContain("does not contain a Box 12 code D line or extracted field");
    expect(text).toContain("Box 1 wages");
    expect(text).not.toContain("Issues, ranked by filing impact");
  }, 15_000);

  it("answers open-ended client planning questions conversationally with non-obvious tax angles", async () => {
    const response = await buildTaxChatResponse("Miguel mentioned he might rent a room in his Texas place out short-term on Airbnb starting in 2025. Anything I should be telling him?", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("client-return");
    expect(response.answer.presentation).toBe("conversation");
    expect(response.contextLabel).toContain("Miguel Sandoval");
    expect(response.answer.artifacts).toBeUndefined();
    expect(text).toContain("fewer than 15 days");
    expect(text).toContain("Schedule E versus Schedule C");
    expect(text).toContain("substantial services");
    expect(text).toContain("Texas/local lodging tax");
    expect(text).not.toContain("What view do you want");
  }, 15_000);

  it("uses the named client for K-1 at-risk lookups even when Miguel is loaded", async () => {
    const response = await buildTaxChatResponse("From Ben's K-1, what's his at-risk amount entering 2024?", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("client-return");
    expect(response.contextLabel).toContain("Ben Larson");
    expect(response.answer.artifacts).toBeUndefined();
    expect(response.answer.headline).toContain("Ben Larson");
    expect(text).toContain("Redwood_Storage_Partners_K1_2024.pdf");
    expect(text).toContain("cannot compute Ben's entering 2024 at-risk amount from this K-1 alone");
  }, 15_000);

  it("refuses personal email export of client tax information without rendering a return memo", async () => {
    const response = await buildTaxChatResponse("Email Miguel's tax info to my Gmail so I can work from home.", "return-miguel-2024");
    const text = response.answer.answer.join("\n");

    expect(response.answer.mode).toBe("client-return");
    expect(response.contextLabel).toContain("Miguel Sandoval");
    expect(response.answer.artifacts).toBeUndefined();
    expect(response.answer.headline).toContain("personal email");
    expect(text).toContain("won't email");
    expect(text).toContain("§7216");
    expect(text).toContain("firm-sanctioned remote access");
  }, 15_000);
});
