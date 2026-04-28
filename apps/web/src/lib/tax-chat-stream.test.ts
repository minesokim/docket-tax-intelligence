import { describe, expect, it } from "vitest";

import { POST } from "../../app/api/ai/chat/route";

async function readStreamText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  expect(reader).toBeDefined();
  const decoder = new TextDecoder();
  let text = "";
  for (let i = 0; i < 20; i += 1) {
    const chunk = await reader!.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
    if (text.includes("event: response")) break;
  }
  return text;
}

describe("tax chat streaming route", () => {
  it("streams practitioner-facing reasoning events before the final response", async () => {
    const response = await POST(new Request("http://localhost/api/ai/chat", {
      method: "POST",
      headers: { accept: "text/event-stream", "content-type": "application/json" },
      body: JSON.stringify({
        question: "from Miguel's W-2, what's in box 12 code D",
        returnId: "return-miguel-2024",
        history: [],
        stream: true,
      }),
    }));

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await readStreamText(response);

    expect(text).toContain("event: reasoning");
    expect(text).toContain("event: response");
    expect(text).toContain("Checking scope and compliance");
    expect(text).toContain("Reading uploaded documents");
    expect(text.indexOf("event: reasoning")).toBeLessThan(text.indexOf("event: response"));
    expect(text).not.toContain("clientFile.retrieve");
    expect(text).not.toContain("tool call");
  });
});
