import { TFile } from "obsidian";
import { getBacklinkedNotes, getLinkedNotes } from "@/noteUtils";
import { findRelevantNotes } from "@/search/findRelevantNotes";
import { getSettings } from "@/settings/model";
import VectorStoreManager from "@/search/vectorStoreManager";

jest.mock("@/noteUtils", () => ({
  getLinkedNotes: jest.fn(),
  getBacklinkedNotes: jest.fn(),
}));

jest.mock("@/settings/model", () => ({
  getSettings: jest.fn(),
}));

const mockGetDocumentsByPath = jest.fn();
const mockGetDb = jest.fn();

jest.mock("@/search/vectorStoreManager", () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getDocumentsByPath: mockGetDocumentsByPath,
      getDb: mockGetDb,
    }),
  },
}));

const mockGetDocsByEmbedding = jest.fn();

jest.mock("@/search/dbOperations", () => ({
  DBOperations: {
    getDocsByEmbedding: (...args: unknown[]) => mockGetDocsByEmbedding(...args),
  },
}));

jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

/**
 * Create a markdown file mock with Obsidian's TFile class.
 *
 * @param path - Vault-relative markdown path.
 * @returns Mock TFile instance.
 */
function createMarkdownFile(path: string): TFile {
  const TFileConstructor = TFile as unknown as new (filePath: string) => TFile;
  return new TFileConstructor(path);
}

describe("findRelevantNotes", () => {
  const mockedGetSettings = getSettings as jest.MockedFunction<typeof getSettings>;
  const mockedGetLinkedNotes = getLinkedNotes as jest.MockedFunction<typeof getLinkedNotes>;
  const mockedGetBacklinkedNotes = getBacklinkedNotes as jest.MockedFunction<
    typeof getBacklinkedNotes
  >;
  const mockedVectorStoreManager = VectorStoreManager as unknown as {
    getInstance: () => {
      getDocumentsByPath: jest.Mock;
      getDb: jest.Mock;
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSettings.mockReturnValue({
      debug: false,
      enableSemanticSearchV3: false,
      selfHostModeValidatedAt: null,
      selfHostValidationCount: 0,
    } as any);
    mockedGetLinkedNotes.mockReturnValue([]);
    mockedGetBacklinkedNotes.mockReturnValue([]);

    const source = createMarkdownFile("source.md");
    const first = createMarkdownFile("first.md");
    const second = createMarkdownFile("second.md");
    const linkedOnly = createMarkdownFile("linked-only.md");

    const filesByPath = new Map<string, TFile>([
      ["source.md", source],
      ["first.md", first],
      ["second.md", second],
      ["linked-only.md", linkedOnly],
    ]);

    (global.app.vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
      return filesByPath.get(path) ?? null;
    });

    mockedVectorStoreManager
      .getInstance()
      .getDocumentsByPath.mockImplementation(mockGetDocumentsByPath);
    mockedVectorStoreManager.getInstance().getDb.mockImplementation(mockGetDb);
  });

  it("uses Orama similarity scoring when source note has embeddings", async () => {
    mockGetDocumentsByPath.mockResolvedValue([
      {
        id: "chunk-1",
        path: "source.md",
        content: "chunk one",
        embedding: [0.1, 0.2],
      },
      {
        id: "chunk-2",
        path: "source.md",
        content: "chunk two",
        embedding: [0.3, 0.4],
      },
    ]);
    mockGetDb.mockResolvedValue({ db: "orama" });
    mockGetDocsByEmbedding
      .mockResolvedValueOnce([
        { score: 0.82, document: { path: "second.md" } },
        { score: 0.5, document: { path: "source.md" } },
      ])
      .mockResolvedValueOnce([
        { score: 0.79, document: { path: "first.md" } },
        { score: 0.66, document: { path: "second.md" } },
      ]);
    mockedGetBacklinkedNotes.mockReturnValue([createMarkdownFile("second.md")]);
    mockedGetLinkedNotes.mockReturnValue([createMarkdownFile("linked-only.md")]);

    const result = await findRelevantNotes({ filePath: "source.md" });

    expect(result.map((entry) => entry.document.path)).toEqual([
      "second.md",
      "first.md",
      "linked-only.md",
    ]);
    expect(
      result.find((entry) => entry.document.path === "second.md")?.metadata.similarityScore
    ).toBe(0.82);
    expect(mockGetDb).toHaveBeenCalledTimes(1);
    expect(mockGetDocsByEmbedding).toHaveBeenCalledTimes(2);
  });

  it("returns link-only results when Orama docs have no embeddings", async () => {
    mockGetDocumentsByPath.mockResolvedValue([
      { id: "chunk-a", path: "source.md", content: "source chunk content", embedding: [] },
    ]);
    mockedGetLinkedNotes.mockReturnValue([createMarkdownFile("linked-only.md")]);

    const result = await findRelevantNotes({ filePath: "source.md" });

    expect(result.map((e) => e.document.path)).toEqual(["linked-only.md"]);
    expect(result[0].metadata.similarityScore).toBeUndefined();
    expect(result[0].metadata.hasOutgoingLinks).toBe(true);
    expect(mockGetDocsByEmbedding).not.toHaveBeenCalled();
  });

  it("returns empty when the source note has no indexed docs and no links", async () => {
    mockGetDocumentsByPath.mockResolvedValue([]);

    const result = await findRelevantNotes({ filePath: "source.md" });

    expect(result).toEqual([]);
    expect(mockGetDocsByEmbedding).not.toHaveBeenCalled();
  });
});
