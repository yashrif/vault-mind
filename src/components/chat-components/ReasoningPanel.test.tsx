import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReasoningPanel } from "@/components/chat-components/ReasoningPanel";
import type { ReasoningPayload, ReasoningItem } from "@/core/reasoning";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Radix Collapsible: forward open/disabled as data attributes so we can
// assert on collapse state without needing CSS.
jest.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({
    children,
    open,
    disabled,
    onOpenChange,
    className,
  }: {
    children: React.ReactNode;
    open: boolean;
    disabled?: boolean;
    onOpenChange?: (open: boolean) => void;
    className?: string;
  }) => (
    <div
      data-testid="collapsible"
      data-open={String(open)}
      data-disabled={String(Boolean(disabled))}
      className={className}
      onClick={() => onOpenChange && onOpenChange(!open)}
    >
      {children}
    </div>
  ),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="collapsible-content">{children}</div>
  ),
  CollapsibleTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    disabled?: boolean;
  }) => <div data-testid="collapsible-trigger">{children}</div>,
}));

// Mock lucide-react icons used in the component
jest.mock("lucide-react", () => ({
  ChevronRight: ({ className }: { className?: string }) => (
    <span data-testid="chevron-icon" className={className} />
  ),
  AlertCircle: ({
    className,
    "aria-hidden": ariaHidden,
  }: {
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }) => <span data-testid="alert-circle" className={className} aria-hidden={ariaHidden} />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal valid ReasoningPayload for testing.
 */
function makePayload(
  overrides: Partial<ReasoningPayload> & { items?: ReasoningItem[] } = {}
): ReasoningPayload {
  return {
    version: 1,
    source: "agent",
    status: "complete",
    elapsedSeconds: 5,
    items: [],
    ...overrides,
  };
}

/**
 * Builds a minimal ReasoningItem for testing.
 */
function makeItem(overrides: Partial<ReasoningItem> = {}): ReasoningItem {
  return {
    id: "item-1",
    kind: "step",
    summary: "Test summary",
    state: "done",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReasoningPanel", () => {
  describe("empty items", () => {
    it("returns null when items array is empty", () => {
      const { container } = render(<ReasoningPanel payload={makePayload({ items: [] })} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("reasoning status (active)", () => {
    it("shows the CortexSpinner SVG when status is reasoning", () => {
      const payload = makePayload({
        status: "reasoning",
        elapsedSeconds: 3,
        items: [makeItem({ state: "active" })],
      });
      const { container } = render(<ReasoningPanel payload={payload} />);
      // CortexSpinner renders as an <svg> with class "cortex-spinner"
      const spinner = container.querySelector("svg.cortex-spinner");
      expect(spinner).not.toBeNull();
    });

    it("shows elapsed time when status is reasoning", () => {
      const payload = makePayload({
        status: "reasoning",
        elapsedSeconds: 7,
        items: [makeItem()],
      });
      render(<ReasoningPanel payload={payload} />);
      expect(screen.getByText("7s")).toBeTruthy();
    });

    it("shows 'Reasoning' label when active", () => {
      const payload = makePayload({
        status: "reasoning",
        elapsedSeconds: 2,
        items: [makeItem()],
      });
      render(<ReasoningPanel payload={payload} />);
      expect(screen.getByText("Reasoning")).toBeTruthy();
    });

    it("panel is open (expanded) during reasoning", () => {
      const payload = makePayload({
        status: "reasoning",
        elapsedSeconds: 2,
        items: [makeItem()],
      });
      render(<ReasoningPanel payload={payload} />);
      const collapsible = screen.getByTestId("collapsible");
      expect(collapsible.getAttribute("data-open")).toBe("true");
    });
  });

  describe("complete / collapsed status", () => {
    it("renders all item summaries when status is complete", () => {
      const payload = makePayload({
        status: "complete",
        elapsedSeconds: 10,
        items: [
          makeItem({ id: "a", summary: "First step" }),
          makeItem({ id: "b", summary: "Second step" }),
          makeItem({ id: "c", summary: "Third step" }),
        ],
      });
      render(<ReasoningPanel payload={payload} />);
      expect(screen.getByText("First step")).toBeTruthy();
      expect(screen.getByText("Second step")).toBeTruthy();
      expect(screen.getByText("Third step")).toBeTruthy();
    });

    it("shows 'Reasoned for' label and elapsed time when complete", () => {
      const payload = makePayload({
        status: "complete",
        elapsedSeconds: 42,
        items: [makeItem()],
      });
      render(<ReasoningPanel payload={payload} />);
      expect(screen.getByText("Reasoned for")).toBeTruthy();
      expect(screen.getByText("42s")).toBeTruthy();
    });

    it("shows chevron icon (not spinner) when complete", () => {
      const payload = makePayload({
        status: "complete",
        elapsedSeconds: 5,
        items: [makeItem()],
      });
      const { container } = render(<ReasoningPanel payload={payload} />);
      expect(screen.getByTestId("chevron-icon")).toBeTruthy();
      expect(container.querySelector("svg.cortex-spinner")).toBeNull();
    });

    it("panel starts collapsed when status transitions to complete", () => {
      const payload = makePayload({
        status: "complete",
        elapsedSeconds: 5,
        items: [makeItem()],
      });
      render(<ReasoningPanel payload={payload} />);
      const collapsible = screen.getByTestId("collapsible");
      expect(collapsible.getAttribute("data-open")).toBe("false");
    });
  });

  describe("item with detail — disclosure behavior", () => {
    it("detail is hidden by default for an agent step item", () => {
      const payload = makePayload({
        status: "complete",
        elapsedSeconds: 3,
        items: [
          makeItem({
            id: "step-1",
            kind: "step",
            summary: "Ran local search",
            detail: "Found 5 notes matching the query",
          }),
        ],
      });
      render(<ReasoningPanel payload={payload} />);
      // Detail text should not be in the document initially
      expect(screen.queryByText("Found 5 notes matching the query")).toBeNull();
    });

    it("detail is shown after clicking the disclosure triangle", () => {
      const payload = makePayload({
        status: "complete",
        elapsedSeconds: 3,
        items: [
          makeItem({
            id: "step-1",
            kind: "step",
            summary: "Ran local search",
            detail: "Found 5 notes matching the query",
          }),
        ],
      });
      render(<ReasoningPanel payload={payload} />);
      // Find and click the disclosure button (aria-label "Toggle detail")
      const toggleBtn = screen.getByRole("button", { name: "Toggle detail" });
      fireEvent.click(toggleBtn);
      expect(screen.getByText("Found 5 notes matching the query")).toBeTruthy();
    });

    it("clicking the disclosure triangle again hides the detail", () => {
      const payload = makePayload({
        status: "complete",
        elapsedSeconds: 3,
        items: [
          makeItem({
            id: "step-1",
            kind: "step",
            summary: "Ran local search",
            detail: "Found 5 notes matching the query",
          }),
        ],
      });
      render(<ReasoningPanel payload={payload} />);
      const toggleBtn = screen.getByRole("button", { name: "Toggle detail" });
      fireEvent.click(toggleBtn); // open
      fireEvent.click(toggleBtn); // close
      expect(screen.queryByText("Found 5 notes matching the query")).toBeNull();
    });
  });

  describe("chat transcript item", () => {
    it("renders a transcript item the same way as a step item (single item panel shell)", () => {
      const payload = makePayload({
        source: "chat",
        status: "complete",
        elapsedSeconds: 8,
        items: [
          makeItem({
            id: "transcript-1",
            kind: "transcript",
            summary: "Reasoning transcript",
            state: "done",
          }),
        ],
      });
      render(<ReasoningPanel payload={payload} />);
      // Header and single item are rendered
      expect(screen.getByText("Reasoned for")).toBeTruthy();
      expect(screen.getByText("Reasoning transcript")).toBeTruthy();
    });

    it("transcript item with detail has same disclosure as agent step", () => {
      const payload = makePayload({
        source: "chat",
        status: "complete",
        elapsedSeconds: 8,
        items: [
          makeItem({
            id: "transcript-1",
            kind: "transcript",
            summary: "Reasoning transcript",
            detail: "Full transcript content here",
            state: "done",
          }),
        ],
      });
      render(<ReasoningPanel payload={payload} />);
      // Detail hidden by default
      expect(screen.queryByText("Full transcript content here")).toBeNull();
      // Click to reveal
      const toggleBtn = screen.getByRole("button", { name: "Toggle detail" });
      fireEvent.click(toggleBtn);
      expect(screen.getByText("Full transcript content here")).toBeTruthy();
    });
  });

  describe("error state item", () => {
    it("renders error item with AlertCircle icon", () => {
      const payload = makePayload({
        status: "complete",
        elapsedSeconds: 2,
        items: [
          makeItem({
            id: "err-1",
            summary: "Something went wrong",
            state: "error",
          }),
        ],
      });
      render(<ReasoningPanel payload={payload} />);
      expect(screen.getByTestId("alert-circle")).toBeTruthy();
    });

    it("renders error item summary text with error styling class", () => {
      const payload = makePayload({
        status: "complete",
        elapsedSeconds: 2,
        items: [
          makeItem({
            id: "err-1",
            summary: "Something went wrong",
            state: "error",
          }),
        ],
      });
      const { container } = render(<ReasoningPanel payload={payload} />);
      // There should be at least one element with tw-text-error that contains the summary text.
      // querySelectorAll is used because the AlertCircle icon also carries tw-text-error.
      const errorElements = container.querySelectorAll(".tw-text-error");
      expect(errorElements.length).toBeGreaterThan(0);
      const summaryEl = Array.from(errorElements).find((el) =>
        el.textContent?.includes("Something went wrong")
      );
      expect(summaryEl).toBeTruthy();
    });
  });

  describe("time formatting", () => {
    it("formats elapsed seconds under 60 as Xs", () => {
      const payload = makePayload({
        status: "complete",
        elapsedSeconds: 45,
        items: [makeItem()],
      });
      render(<ReasoningPanel payload={payload} />);
      expect(screen.getByText("45s")).toBeTruthy();
    });

    it("formats elapsed seconds >= 60 as Xm Ys", () => {
      const payload = makePayload({
        status: "complete",
        elapsedSeconds: 90,
        items: [makeItem()],
      });
      render(<ReasoningPanel payload={payload} />);
      expect(screen.getByText("1m 30s")).toBeTruthy();
    });
  });
});
