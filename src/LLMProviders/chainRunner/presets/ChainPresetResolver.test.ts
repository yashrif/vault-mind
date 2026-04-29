import { buildChainPreset } from "@/LLMProviders/chainRunner/presets/ChainPresetResolver";

jest.mock("@/core/ToolPermissions", () => ({
  resolveToolPermissions: jest.fn((context) => [{ name: `${context.surface}-tool` }]),
}));

describe("buildChainPreset", () => {
  it("builds the plain chat preset without RAG", () => {
    const preset = buildChainPreset({
      presetId: "chat",
      vaultAvailable: true,
    });

    expect(preset.id).toBe("chat");
    expect(preset.promptProfile).toBe("chat");
    expect(preset.runtimePolicy.promptProfile).toBe("chat");
  });

  it("builds the chat_rag preset with RAG enabled", () => {
    const preset = buildChainPreset({
      presetId: "chat_rag",
      vaultAvailable: true,
    });

    expect(preset.id).toBe("chat_rag");
    expect(preset.runtimePolicy.richContextPolicy).toBe("plus");
  });

  it("builds telegram with full-builtin policy", () => {
    const preset = buildChainPreset({
      presetId: "telegram",
      vaultAvailable: true,
    });

    expect(preset.id).toBe("telegram");
    expect(preset.runtimePolicy.promptTarget).toBe("telegram");
    expect(preset.runtimePolicy.historyScope).toBe("telegram_visible_thread");
  });
});
