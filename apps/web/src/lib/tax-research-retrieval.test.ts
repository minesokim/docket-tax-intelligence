import { describe, expect, it } from "vitest";

import { rankAuthorityCatalog } from "@docket/tax-knowledge";

import { buildTaxChatResponse } from "./tax-chat";
import { researchRetrievalQuery } from "./tax-chat";

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
});
