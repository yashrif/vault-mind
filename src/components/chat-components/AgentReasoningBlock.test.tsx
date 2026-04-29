import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { AgentReasoningBlock } from "@/components/chat-components/AgentReasoningBlock";

describe("AgentReasoningBlock", () => {
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
