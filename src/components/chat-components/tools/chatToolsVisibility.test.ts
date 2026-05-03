import { shouldShowChatToolsPopover } from "@/components/chat-components/tools/chatToolsVisibility";

describe("shouldShowChatToolsPopover", () => {
  it("keeps the popover visible in plain Chat and global Agent", () => {
    expect(shouldShowChatToolsPopover("chat")).toBe(true);
    expect(shouldShowChatToolsPopover("agent")).toBe(true);
  });

  it("hides the popover in Chat + RAG and Project Agent", () => {
    expect(shouldShowChatToolsPopover("chat_rag")).toBe(false);
    expect(shouldShowChatToolsPopover("project_agent")).toBe(false);
  });
});
