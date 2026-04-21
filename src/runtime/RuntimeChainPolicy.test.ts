jest.mock("@/chainFactory", () => ({
  ChainType: {
    TELEGRAM_CHAIN: "telegram",
    TOOL_CHAIN: "copilot_plus",
    PROJECT_CHAIN: "project_chain",
  },
}));

import {
  injectVirtualToolMarkers,
  resolveRuntimeChainPolicy,
  TELEGRAM_FORCED_MANUAL_TOOL_MARKERS,
} from "@/runtime/RuntimeChainPolicy";

describe("RuntimeChainPolicy", () => {
  it("resolves telegram to isolated prompt/tool policies", () => {
    const policy = resolveRuntimeChainPolicy("telegram" as any);

    expect(policy.promptTarget).toBe("telegram");
    expect(policy.richContextPolicy).toBe("plus");
    expect(policy.manualToolPolicy).toBe("forced_virtual_markers");
    expect(policy.autonomousToolPolicy).toBe("full_builtin");
    expect(policy.historyScope).toBe("telegram_visible_thread");
  });

  it("keeps copilot_plus on shared default policies", () => {
    const policy = resolveRuntimeChainPolicy("copilot_plus" as any);

    expect(policy.promptTarget).toBe("default");
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
