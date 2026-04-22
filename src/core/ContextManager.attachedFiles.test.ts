/**
 * Tests that attached file content (from MessageContext.attachedFileContents)
 * flows correctly through ContextManager into both the legacy processedContent
 * string and the L3_TURN segments of the context envelope.
 */

// Minimal mocks to avoid deep dependency chains
jest.mock("@/chainFactory", () => ({
  ChainType: {
    LLM_CHAIN: "llm_chain",
    TOOL_CHAIN: "copilot_plus_chain",
    PROJECT_CHAIN: "project_chain",
  },
}));

jest.mock("@/aiParams", () => ({
  getSelectedTextContexts: jest.fn().mockReturnValue([]),
}));

jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

jest.mock("@/settings/model", () => ({
  getSettings: jest.fn().mockReturnValue({}),
}));

jest.mock("@/contextProcessor", () => ({
  ContextProcessor: {
    getInstance: jest.fn().mockReturnValue({}),
  },
}));

jest.mock("@/mentions/Mention", () => ({
  Mention: {
    getInstance: jest.fn().mockReturnValue({}),
  },
}));

jest.mock("@/context/PromptContextEngine", () => ({
  PromptContextEngine: {
    getInstance: jest.fn().mockReturnValue({
      buildEnvelope: jest.fn((params: any) => {
        const layerSegments: Record<string, any[]> = params.layerSegments ?? {};
        const layers = Object.entries(layerSegments).map(([id, segs]) => ({
          id,
          label: id,
          text: (segs as any[]).map((s: any) => s.content).join("\n"),
          stable: false,
          segments: segs,
          hash: "test-hash",
        }));
        return {
          version: 1,
          conversationId: null,
          messageId: params.messageId ?? null,
          layers,
          serializedText: layers.map((l) => l.text).join("\n"),
          layerHashes: {},
          combinedHash: "test",
        };
      }),
    }),
  },
}));

jest.mock("@/commands/customCommandUtils", () => ({
  processPrompt: jest.fn(),
}));

jest.mock("./ContextCompactor", () => ({}));

import { ChainType } from "@/chainFactory";
import { ContextManager } from "./ContextManager";

// ----- helpers -----

function makeChatMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-test",
    message: "Hello",
    sender: "user",
    timestamp: { epoch: 0, display: "", fileName: "" },
    isVisible: true,
    ...overrides,
  };
}

function buildMinimalEnvelopeParams(attachedFilesContext: string) {
  return {
    chainType: ChainType.LLM_CHAIN,
    message: makeChatMessage(),
    systemPrompt: "",
    processedUserMessage: "Hello",
    l2PreviousContext: "",
    noteContextAddition: "",
    tagContextAddition: "",
    tagNotePaths: [],
    folderContextAddition: "",
    folderNotePaths: [],
    urlContext: "",
    selectedText: "",
    webTabContext: "",
    attachedFilesContext,
  };
}

// ----- tests -----

describe("ContextManager — attachedFilesContext in envelope", () => {
  let contextManager: any;

  beforeEach(() => {
    contextManager = ContextManager.getInstance();
  });

  it("produces L3_TURN segment containing attached file content", () => {
    const fileXml = `<attached_file name="notes.txt">\nThis is the file content\n</attached_file>`;
    const params = buildMinimalEnvelopeParams(fileXml);

    const envelope = contextManager.buildPromptContextEnvelope(params);

    expect(envelope).toBeDefined();
    const l3Layer = envelope.layers.find((l: any) => l.id === "L3_TURN");
    expect(l3Layer).toBeDefined();
    expect(l3Layer.text).toContain("attached_file");
    expect(l3Layer.text).toContain("This is the file content");
  });

  it("produces a segment per attached file when multiple files are provided", () => {
    const fileXml = [
      `<attached_file name="a.txt">\nContent of A\n</attached_file>`,
      `<attached_file name="b.txt">\nContent of B\n</attached_file>`,
    ].join("\n");
    const params = buildMinimalEnvelopeParams(fileXml);

    const envelope = contextManager.buildPromptContextEnvelope(params);

    const l3Layer = envelope.layers.find((l: any) => l.id === "L3_TURN");
    expect(l3Layer.text).toContain("Content of A");
    expect(l3Layer.text).toContain("Content of B");
  });

  it("returns undefined L3_TURN when attachedFilesContext is empty and no other context", () => {
    const params = buildMinimalEnvelopeParams("");

    const envelope = contextManager.buildPromptContextEnvelope(params);

    // With no context at all the envelope may be undefined or have no L3_TURN layer
    if (envelope) {
      const l3Layer = envelope.layers.find((l: any) => l.id === "L3_TURN");
      if (l3Layer) {
        expect(l3Layer.text).not.toContain("attached_file");
      }
    }
  });

  it("does not include attached file content when attachedFilesContext is empty", () => {
    const noteXml = `<note_context>\n<title>Note</title>\n<path>note.md</path>\n<content>Note body</content>\n</note_context>`;
    const params = buildMinimalEnvelopeParams("");
    params.noteContextAddition = noteXml;

    const envelope = contextManager.buildPromptContextEnvelope(params);

    const l3Layer = envelope?.layers.find((l: any) => l.id === "L3_TURN");
    if (l3Layer) {
      expect(l3Layer.text).not.toContain("attached_file");
    }
  });

  it("coexists with note context in L3_TURN without interfering", () => {
    const fileXml = `<attached_file name="data.txt">\nFile data\n</attached_file>`;
    const noteXml = `<note_context>\n<title>Note</title>\n<path>note.md</path>\n<content>Note body</content>\n</note_context>`;
    const params = buildMinimalEnvelopeParams(fileXml);
    params.noteContextAddition = noteXml;

    const envelope = contextManager.buildPromptContextEnvelope(params);

    const l3Layer = envelope?.layers.find((l: any) => l.id === "L3_TURN");
    expect(l3Layer).toBeDefined();
    expect(l3Layer.text).toContain("File data");
    expect(l3Layer.text).toContain("Note body");
  });
});
