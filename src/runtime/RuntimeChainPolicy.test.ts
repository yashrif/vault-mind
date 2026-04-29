import { legacyChainIdForPresetId, normalizeChainPresetId } from "@/runtime/ChainPreset";
import {
  injectVirtualToolMarkers,
  resolveRuntimeChainPolicy,
  TELEGRAM_FORCED_MANUAL_TOOL_MARKERS,
} from "@/runtime/RuntimeChainPolicy";

describe("RuntimeChainPolicy", () => {
  it("normalizes legacy Chat + RAG ids without exposing it as a visible mode", () => {
    const legacyChatRagId = ["vault", "qa"].join("_");

    expect(normalizeChainPresetId(legacyChatRagId)).toBe("chat_rag");
    expect(legacyChainIdForPresetId("chat_rag")).toBe(legacyChatRagId);
  });

  it("resolves telegram to isolated prompt/tool policies", () => {
    const policy = resolveRuntimeChainPolicy("telegram");

    expect(policy.promptProfile).toBe("telegram");
    expect(policy.legacyChainId).toBe("telegram");
    expect(policy).not.toHaveProperty("chainType");
    expect(policy.promptTarget).toBe("telegram");
    expect(policy.richContextPolicy).toBe("plus");
    expect(policy.manualToolPolicy).toBe("forced_virtual_markers");
    expect(policy.autonomousToolPolicy).toBe("full_builtin");
    expect(policy.historyScope).toBe("telegram_visible_thread");
  });

  it("resolves chat_rag as conversational chat with plus context", () => {
    const policy = resolveRuntimeChainPolicy("chat_rag");

    expect(policy.promptProfile).toBe("chat_rag");
    expect(policy.promptTarget).toBe("default");
    expect(policy.richContextPolicy).toBe("plus");
    expect(policy.manualToolPolicy).toBe("ui_markers");
    expect(policy.autonomousToolPolicy).toBe("settings_filtered");
    expect(policy.historyScope).toBe("shared_repo");
  });

  it("injects telegram virtual tool markers without duplicating existing ones", () => {
    const result = injectVirtualToolMarkers("Review this note @vault");

    expect(result).toContain("@vault");
    expect(result).toContain("@websearch");
    expect(result).toContain("@composer");
    expect(result.match(/@vault/g)).toHaveLength(1);
    expect(TELEGRAM_FORCED_MANUAL_TOOL_MARKERS.every((marker) => result.includes(marker))).toBe(
      true
    );
  });
});
