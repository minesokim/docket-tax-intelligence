export type AdapterStatus = "NOT_CONFIGURED" | "CONNECTED" | "ERROR";

export type ProductionAdapter<TInput, TOutput> = {
  provider: string;
  status: AdapterStatus;
  externalCallsAllowed: boolean;
  run(input: TInput): Promise<TOutput>;
};

export const integrationProviders = [
  "mock_ai",
  "mock_ocr",
  "google_meet",
  "zoom",
  "irs_transcript",
  "tax_software_export",
  "efile_provider_stub",
  "payment_processor_stub",
  "esign_stub",
] as const;

export const efileAdapterNotice =
  "Direct IRS e-file submission is intentionally stubbed in the foundation release; Docket only produces review-gated export packets.";

export function createNotConfiguredAdapter<TInput, TOutput>(provider: string): ProductionAdapter<TInput, TOutput> {
  return {
    provider,
    status: "NOT_CONFIGURED",
    externalCallsAllowed: false,
    async run() {
      throw new Error(`${provider} is not configured. Use the mock adapter or enable a production integration explicitly.`);
    },
  };
}
