import { describe, expect, it } from "vitest";

import { rankAuthorityCatalog } from "@docket/tax-knowledge";

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
});
