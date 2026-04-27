import React from "react";
import { render, waitFor } from "@testing-library/react";
import ChatSingleMessage, {
  normalizeFootnoteRendering,
} from "@/components/chat-components/ChatSingleMessage";
import { ChatMessage } from "@/types/message";
import type { App } from "obsidian";
import { TooltipProvider } from "@/components/ui/tooltip";
import { serializeReasoningPayload } from "@/core/reasoning";
import type { ReasoningPayload } from "@/core/reasoning";

jest.mock("@/settings/model", () => ({
  useSettingsValue: jest.fn(() => ({
    enableInlineCitations: true,
    activeModels: [
      {
        name: "test-model",
        provider: "test-provider",
        enabled: true,
        capabilities: ["reasoning"],
      },
    ],
  })),
}));

jest.mock("@/aiParams", () => ({
  useModelKey: jest.fn(() => ["test-model|test-provider", jest.fn()]),
}));

jest.mock("@/LLMProviders/chainRunner/utils/toolCallParser", () => ({
  parseToolCallMarkers: jest.fn((message: string) => ({
    segments: [{ type: "text", content: message }],
  })),
}));

jest.mock("@/LLMProviders/chainRunner/utils/citationUtils", () => ({
  processInlineCitations: jest.fn((content: string) => content),
}));

jest.mock("@/components/chat-components/ReasoningPanel", () => ({
  ReasoningPanel: ({ payload }: { payload: ReasoningPayload }) =>
    React.createElement("div", { "data-testid": "reasoning-panel", "data-status": payload.status }),
}));

jest.mock("react-resizable-panels", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    PanelGroup: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
    Panel: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
    PanelResizeHandle: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
  };
});

jest.mock("obsidian", () => {
  const renderMarkdown = jest.fn();
  return {
    MarkdownRenderer: {
      renderMarkdown,
    },
    Component: class {
      load() {}
      unload() {}
    },
    MarkdownView: class {},
    TFile: class {},
    App: class {},
    Platform: {
      isMobile: false,
    },
    Modal: class {
      open() {
        /* noop */
      }
      close() {
        /* noop */
      }
    },
    FuzzySuggestModal: class {
      constructor(_app: unknown) {}
    },
    Notice: class {
      constructor(_message: string, _timeout?: number) {}
    },
    __renderMarkdownMock: renderMarkdown,
  };
});

const { __renderMarkdownMock: renderMarkdownMock } = jest.requireMock("obsidian") as {
  __renderMarkdownMock: jest.Mock;
};

describe("normalizeFootnoteRendering", () => {
  beforeEach(() => {
    renderMarkdownMock.mockReset();
  });

  it("removes separator and backref while preserving non-footnote elements", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div>
        <p>Body <sup><a href="#fn-1">1-1</a></sup></p>
        <hr class="content-separator" />
        <div class="footnotes">
          <hr class="footnotes-sep" />
          <ol>
            <li id="fn-1">
              Entry <a class="footnote-backref" href="#ref">↩</a>
            </li>
          </ol>
        </div>
      </div>
    `;

    normalizeFootnoteRendering(container);

    expect(container.querySelector(".footnotes hr")).toBeNull();
    expect(container.querySelector(".footnote-backref")).toBeNull();
    expect(container.querySelector(".content-separator")).not.toBeNull();
    expect(container.querySelector('a[href="#fn-1"]')?.textContent).toBe("1");
  });

  it("leaves non-numeric footnote references untouched", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <p>Body <sup><a href="#fn-note">Note-A</a></sup></p>
      <a class="footnote-backref" href="#ref">↩</a>
    `;

    normalizeFootnoteRendering(container);

    expect(container.querySelector('a[href="#fn-note"]')?.textContent).toBe("Note-A");
    expect(container.querySelector(".footnote-backref")).toBeNull();
  });
});

describe("ChatSingleMessage", () => {
  const baseMessage: ChatMessage = {
    id: "message-1",
    message: "Test message",
    sender: "assistant",
    timestamp: { epoch: Date.now(), display: "now", fileName: "now" },
    isVisible: true,
  };

  const createAppStub = (): App =>
    ({
      workspace: {
        getActiveFile: jest.fn(() => null),
        getMostRecentLeaf: jest.fn(() => null),
        getLeaf: jest.fn(() => null),
      },
      metadataCache: {
        getFirstLinkpathDest: jest.fn(() => null),
      },
    }) as unknown as App;

  beforeEach(() => {
    renderMarkdownMock.mockReset();
  });

  beforeAll(() => {
    (globalThis as any).activeDocument = document;
  });

  it("normalizes rendered footnotes for assistant messages", async () => {
    renderMarkdownMock.mockImplementation((_markdown: string, el: HTMLElement) => {
      el.innerHTML = `
        <p>Example <sup><a href="#fn-2">2-1</a></sup></p>
        <hr class="content-hr" />
        <div class="footnotes">
          <hr class="footnotes-sep" />
          <ol>
            <li id="fn-2">
              Source <a class="footnote-backref" href="#back">↩</a>
            </li>
          </ol>
        </div>
      `;
    });

    const { container } = render(
      <TooltipProvider>
        <ChatSingleMessage
          message={baseMessage}
          app={createAppStub()}
          isStreaming={false}
          onDelete={() => {}}
        />
      </TooltipProvider>
    );

    await waitFor(() => expect(renderMarkdownMock).toHaveBeenCalled());

    const messageSegment = container.querySelector(".message-segment");
    expect(messageSegment).toBeTruthy();
    expect(messageSegment?.querySelector(".footnotes hr")).toBeNull();
    expect(messageSegment?.querySelector(".footnote-backref")).toBeNull();
    expect(messageSegment?.querySelector(".content-hr")).not.toBeNull();
    expect(messageSegment?.querySelector('a[href="#fn-2"]')?.textContent).toBe("2");
  });

  it("renders ReasoningPanel and strips marker text when message has CORTEX_REASONING marker", async () => {
    const payload: ReasoningPayload = {
      version: 1,
      source: "chat",
      status: "complete",
      elapsedSeconds: 5,
      items: [{ id: "1", kind: "transcript", summary: "Thought about it", state: "done" }],
    };
    const marker = serializeReasoningPayload(payload);
    const messageWithReasoning: ChatMessage = {
      ...baseMessage,
      message: `${marker}\n\nHere is the answer.`,
    };

    renderMarkdownMock.mockImplementation((_markdown: string, el: HTMLElement) => {
      el.innerHTML = `<p>${_markdown}</p>`;
    });

    const { container } = render(
      <TooltipProvider>
        <ChatSingleMessage
          message={messageWithReasoning}
          app={createAppStub()}
          isStreaming={false}
          onDelete={() => {}}
        />
      </TooltipProvider>
    );

    await waitFor(() =>
      expect(container.querySelector("[data-testid='reasoning-panel']")).not.toBeNull()
    );

    // ReasoningPanel is present
    const panel = container.querySelector("[data-testid='reasoning-panel']");
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("data-status")).toBe("complete");

    // The raw marker text must not appear in the rendered DOM
    expect(container.textContent).not.toContain("CORTEX_REASONING");
  });

  it("does not render ReasoningPanel when message has no CORTEX_REASONING marker", async () => {
    renderMarkdownMock.mockImplementation((_markdown: string, el: HTMLElement) => {
      el.innerHTML = `<p>${_markdown}</p>`;
    });

    const { container } = render(
      <TooltipProvider>
        <ChatSingleMessage
          message={baseMessage}
          app={createAppStub()}
          isStreaming={false}
          onDelete={() => {}}
        />
      </TooltipProvider>
    );

    await waitFor(() => expect(renderMarkdownMock).toHaveBeenCalled());

    expect(container.querySelector("[data-testid='reasoning-panel']")).toBeNull();
  });
});
