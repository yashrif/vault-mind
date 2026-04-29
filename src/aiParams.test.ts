import { deriveChainPresetId } from "@/aiParams";

describe("deriveChainPresetId", () => {
  it("maps plain chat to the chat preset", () => {
    expect(deriveChainPresetId("chat", "global", "none")).toBe("chat");
  });

  it("maps chat with vault retrieval to the chat_rag preset", () => {
    expect(deriveChainPresetId("chat", "global", "vault_auto")).toBe("chat_rag");
  });

  it("maps global agent to the agent preset", () => {
    expect(deriveChainPresetId("agent", "global", "none")).toBe("agent");
  });

  it("maps project agent to the project_agent preset", () => {
    expect(deriveChainPresetId("agent", "project", "vault_auto")).toBe("project_agent");
  });
});
