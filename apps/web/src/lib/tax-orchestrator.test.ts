import { beforeEach, describe, expect, it } from "vitest";

import { resetDocketData } from "@docket/domain";

import { buildTaxChatResponse } from "./tax-chat";

describe("tax chat orchestrator artifacts", () => {
  beforeEach(() => {
    resetDocketData();
  });

  it("runs Miguel through a validated artifact envelope without false clearance", async () => {
    const response = await buildTaxChatResponse("Run the full reviewer memo for Miguel");

    expect(response.contextLabel).toContain("Miguel Sandoval");
    expect(response.answer.artifacts?.intent).toBe("deep_memo");
    expect(response.answer.artifacts?.memo?.verdict.filingStatus).toBe("Not ready to file");
    expect(response.answer.artifacts?.memo?.verdict.blockerCount).toBeGreaterThan(0);
    expect(response.answer.artifacts?.issueAnalyses.length).toBeGreaterThan(0);
    expect(response.answer.artifacts?.issuePackets.length).toBeGreaterThan(0);
    expect(response.answer.artifacts?.issuePackets[0]).toEqual(
      expect.objectContaining({
        clearanceStandard: expect.stringContaining("Clear only"),
        reviewGateImpact: expect.objectContaining({
          blocksReadyToFile: true,
        }),
      }),
    );
    expect(response.answer.artifacts?.sourcePacket.length).toBeGreaterThan(10);
    expect(response.answer.artifacts?.sourcePacket[0]).toHaveProperty("reliability");
    expect(response.answer.artifacts?.factGraph.length).toBeGreaterThan(0);
    expect(response.answer.artifacts?.trace.map((event) => event.stage)).toContain("validation");
    expect(response.answer.artifacts?.immutableContentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("routes Priya to her own client file and preserves missing 1095-A evidence", async () => {
    const response = await buildTaxChatResponse("Run the full reviewer memo for Priya");

    expect(response.contextLabel).toContain("Priya Narayan");
    expect(response.answer.headline).toContain("Priya");
    expect(response.answer.artifacts?.issueAnalyses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Marketplace coverage mentioned with no 1095-A",
          blocker: true,
          reviewerState: "NEEDS_EVIDENCE",
        }),
      ]),
    );
    expect(response.answer.artifacts?.issuePackets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issueId: "issue-priya-narayan-marketplace-1095a",
          missingFacts: expect.arrayContaining(["Request Form 1095-A before finalizing ACA-related return items."]),
          authoritySourcePacketIds: expect.arrayContaining([
            "packet-tax_citation-cite-form1095a-marketplace",
          ]),
        }),
      ]),
    );
    expect(response.answer.artifacts?.sourcePacket).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "missing_document",
          label: "FORM 1095 A",
          reliability: "low",
        }),
        expect.objectContaining({
          sourceType: "tax_citation",
          label: "Form 1095-A marketplace coverage",
        }),
      ]),
    );
    expect(response.answer.artifacts?.sourcePacket.map((packet) => packet.label)).not.toContain("Schedule C gross receipts");
  });

  it("does not emit a memo artifact for a bare client lookup", async () => {
    const response = await buildTaxChatResponse("priya");

    expect(response.answer.artifacts?.intent).toBe("client_lookup");
    expect(response.answer.artifacts?.memo).toBeNull();
    expect(response.answer.professionalAnalyses?.length ?? 0).toBe(0);
  });
});
