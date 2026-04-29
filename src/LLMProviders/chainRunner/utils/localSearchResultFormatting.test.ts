import { LocalSearchResultFormatter } from "@/LLMProviders/chainRunner/utils/localSearchResultFormatting";

jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logMarkdownBlock: jest.fn(),
  logTable: jest.fn(),
}));

jest.mock("@/settings/model", () => ({
  getSettings: jest.fn(() => ({
    enableInlineCitations: true,
    maxSourceChunks: 3,
  })),
}));

describe("LocalSearchResultFormatter", () => {
  it("formats localSearch payloads for the LLM and extracts sources", () => {
    const formatter = new LocalSearchResultFormatter();

    const result = formatter.process({
      success: true,
      result: JSON.stringify({
        type: "local_search",
        documents: [
          {
            title: "Note",
            path: "note.md",
            content: "Useful note content.",
            score: 0.9,
          },
        ],
      }),
    });

    expect(result.formattedForLLM).toContain("<localSearch>");
    expect(result.sources[0].path).toBe("note.md");
  });
});
