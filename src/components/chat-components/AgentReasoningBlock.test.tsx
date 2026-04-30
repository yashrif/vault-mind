import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { AgentReasoningBlock } from "@/components/chat-components/AgentReasoningBlock";
import { ReasoningPayload } from "@/LLMProviders/chainRunner/utils/AgentReasoningState";

describe("AgentReasoningBlock", () => {
  it("shows chevron not spinner when reasoning is complete but response is still streaming", () => {
    const payload: ReasoningPayload = {
      status: "complete",
      elapsedSeconds: 5,
      steps: [{ id: "step-1", timestamp: Date.now(), summary: "Searched notes" }],
    };

    const { container } = render(<AgentReasoningBlock payload={payload} isStreaming={true} />);

    expect(container.querySelector(".cortex-spinner")).toBeNull();
  });

  it("auto-collapses when status transitions from reasoning to complete", () => {
    const reasoningPayload: ReasoningPayload = {
      status: "reasoning",
      elapsedSeconds: 3,
      steps: [{ id: "s1", timestamp: Date.now(), summary: "Searching" }],
    };
    const completePayload: ReasoningPayload = {
      status: "complete",
      elapsedSeconds: 3,
      steps: [{ id: "s1", timestamp: Date.now(), summary: "Searching" }],
    };

    const { rerender, container } = render(
      <AgentReasoningBlock payload={reasoningPayload} isStreaming={true} />
    );

    expect(container.querySelector(".agent-reasoning-steps")).not.toBeNull();

    rerender(<AgentReasoningBlock payload={completePayload} isStreaming={false} />);
    expect(container.querySelector(".agent-reasoning-steps")).toBeNull();
  });

  it("renders completed reasoning collapsed with expandable tool details", () => {
    const { container, getByText } = render(
      <AgentReasoningBlock
        payload={{
          status: "complete",
          elapsedSeconds: 9,
          steps: [
            {
              id: "step-1",
              timestamp: 1,
              summary: "Searching notes",
              toolName: "localSearch",
              toolDetails: {
                status: "success",
                argsPreview: { query: "quarterly roadmap" },
                resultPreview: "Found roadmap.md",
                durationMs: 31,
                truncated: false,
              },
            },
          ],
        }}
        isStreaming={false}
      />
    );

    expect(container.textContent).toContain("Thought for");
    expect(container.textContent).not.toContain("quarterly roadmap");

    fireEvent.click(getByText(/Thought for/));
    expect(container.textContent).toContain("Searching notes");
    expect(container.textContent).toContain("localSearch");

    fireEvent.click(getByText(/localSearch/));
    expect(container.textContent).toContain("quarterly roadmap");
    expect(container.textContent).toContain("Found roadmap.md");
  });
});
