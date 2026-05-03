import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useSettingsValue, updateSetting } from "@/settings/model";
import { getCurrentProject } from "@/aiParams";
import { ChatToolsPopover } from "./tools/ChatToolsPopover";

// ── UI Primitive Mocks ─────────────────────────────────────────────────────────

jest.mock("@/components/ui/popover", () => ({
  Popover: ({ children, onOpenChange }: any) => (
    <div onClick={() => onOpenChange?.(false)}>{children}</div>
  ),
  PopoverTrigger: ({ children }: any) => <div data-testid="popover-trigger">{children}</div>,
  PopoverContent: ({ children }: any) => <div data-testid="popover-content">{children}</div>,
  PopoverClose: ({ children }: any) => <button type="button">{children}</button>,
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/input", () => ({
  Input: ({ value, onChange, placeholder }: any) => (
    <input data-testid="search-input" value={value} onChange={onChange} placeholder={placeholder} />
  ),
}));

jest.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: any) => <div data-testid="scroll-area">{children}</div>,
}));

jest.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: any) => <>{children}</>,
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <span data-testid="tooltip">{children}</span>,
}));

// ── Module Mocks ───────────────────────────────────────────────────────────────

jest.mock("@/settings/model", () => ({
  useSettingsValue: jest.fn(),
  updateSetting: jest.fn(),
}));

jest.mock("@/constants", () => ({
  DEFAULT_SETTINGS: {
    toolDefaults: {
      chat: { webSearch: false, youtubeTranscription: false },
      agent: { localSearch: true, webSearch: true, writeFile: true, editFile: true },
    },
  },
}));

jest.mock("@/aiParams", () => ({
  getCurrentProject: jest.fn(),
}));

jest.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

jest.mock("lucide-react", () => ({
  Blocks: () => <span data-testid="icon-blocks" />,
  Brain: () => <span data-testid="icon-brain" />,
  Calendar: () => <span data-testid="icon-calendar" />,
  CalendarDays: () => <span data-testid="icon-calendar-days" />,
  Check: () => <span data-testid="icon-check" />,
  ClipboardList: () => <span data-testid="icon-clipboard-list" />,
  Code2: () => <span data-testid="icon-code2" />,
  Database: () => <span data-testid="icon-database" />,
  FileCog: () => <span data-testid="icon-file-cog" />,
  FilePen: () => <span data-testid="icon-file-pen" />,
  FilePlus2: () => <span data-testid="icon-file-plus-2" />,
  FileText: () => <span data-testid="icon-file-text" />,
  FolderSearch: () => <span data-testid="icon-folder-search" />,
  Globe2: () => <span data-testid="icon-globe2" />,
  Globe: () => <span data-testid="icon-globe" />,
  Image: () => <span data-testid="icon-image" />,
  ListTodo: () => <span data-testid="icon-list-todo" />,
  Lock: () => <span data-testid="icon-lock" />,
  NotebookText: () => <span data-testid="icon-notebook-text" />,
  PlugZap: () => <span data-testid="icon-plug-zap" />,
  RefreshCcw: () => <span data-testid="icon-refresh-ccw" />,
  Search: () => <span data-testid="icon-search" />,
  Settings: () => <span data-testid="icon-settings" />,
  Trash2: () => <span data-testid="icon-trash2" />,
  Wrench: () => <span data-testid="icon-wrench" />,
  X: () => <span data-testid="icon-x" />,
  Youtube: () => <span data-testid="icon-youtube" />,
}));

// ── ToolRegistry Mock ──────────────────────────────────────────────────────────

const mockGetConfigurableTools = jest.fn();

jest.mock("@/tools/ToolRegistry", () => ({
  ToolRegistry: {
    getInstance: () => ({ getConfigurableTools: mockGetConfigurableTools }),
  },
}));

// ── Test Data ──────────────────────────────────────────────────────────────────

const webSearchTool = {
  tool: {} as any,
  metadata: {
    id: "webSearch",
    displayName: "Web Search",
    description: "Search the internet",
    category: "search" as const,
    icon: "globe-2" as const,
    accessLevel: "costly" as const,
  },
};

const localSearchTool = {
  tool: {} as any,
  metadata: {
    id: "localSearch",
    displayName: "Vault Search",
    description: "Search the vault",
    category: "search" as const,
    icon: "folder-search" as const,
    accessLevel: "costly" as const,
  },
};

const writeFileTool = {
  tool: {} as any,
  metadata: {
    id: "writeFile",
    displayName: "Write File",
    description: "Write to files",
    category: "file" as const,
    icon: "file-plus-2" as const,
    accessLevel: "write" as const,
  },
};

const editFileTool = {
  tool: {} as any,
  metadata: {
    id: "editFile",
    displayName: "Edit File",
    description: "Edit files",
    category: "file" as const,
    icon: "file-pen" as const,
    accessLevel: "write" as const,
  },
};

const customIconTool = {
  tool: {} as any,
  metadata: {
    id: "customIconTool",
    displayName: "Custom Icon Tool",
    description: "Uses metadata-driven icon selection",
    category: "custom" as const,
    accessLevel: "costly" as const,
    icon: "youtube" as const,
  },
};

const allTools = [webSearchTool, localSearchTool, writeFileTool, editFileTool];

const baseSettings = {
  toolDefaults: {
    chat: { webSearch: false },
    agent: { localSearch: true, webSearch: true, writeFile: false, editFile: true },
    telegram: {},
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ChatToolsPopover", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentProject as jest.Mock).mockReturnValue(null);
  });

  // ── surface=chat ─────────────────────────────────────────────────────────────

  describe("surface=chat", () => {
    it("uses a plain settings-style header without an explicit close button", () => {
      mockGetConfigurableTools.mockReturnValue([webSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue({
        toolDefaults: {
          chat: { webSearch: true },
          agent: {},
          telegram: {},
        },
      });

      render(<ChatToolsPopover surface="chat" />);

      expect(screen.getByRole("heading", { name: "Tools" })).toBeTruthy();
      expect(screen.getByText("1/1")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Close tools popover/i })).toBeNull();
    });

    it("shows only isChatConfigurableTool tools — excludes localSearch and write tools", () => {
      mockGetConfigurableTools.mockReturnValue(allTools);
      (useSettingsValue as jest.Mock).mockReturnValue(baseSettings);

      render(<ChatToolsPopover surface="chat" />);

      // webSearch is costly and not localSearch → should appear
      expect(screen.getByText("Web Search")).toBeTruthy();

      // localSearch is excluded even though costly
      expect(screen.queryByText("Vault Search")).toBeNull();

      // write accessLevel tools are excluded
      expect(screen.queryByText("Write File")).toBeNull();
      expect(screen.queryByText("Edit File")).toBeNull();
    });

    it("writes to toolDefaults.chat when toggling", () => {
      mockGetConfigurableTools.mockReturnValue([webSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue({
        toolDefaults: {
          chat: { webSearch: false },
          agent: {},
          telegram: {},
        },
      });

      render(<ChatToolsPopover surface="chat" />);

      const toggleButton = screen.getByRole("button", { name: /Toggle Web Search/i });
      fireEvent.click(toggleButton);

      expect(updateSetting).toHaveBeenCalledWith(
        "toolDefaults",
        expect.objectContaining({
          chat: expect.objectContaining({ webSearch: true }),
        })
      );
    });

    it("does NOT call pill sync callbacks in chat mode", () => {
      mockGetConfigurableTools.mockReturnValue([webSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue({
        toolDefaults: {
          chat: { webSearch: false },
          agent: {},
          telegram: {},
        },
      });

      const onVaultToggleOff = jest.fn();
      const onWebToggleOff = jest.fn();

      render(
        <ChatToolsPopover
          surface="chat"
          onVaultToggleOff={onVaultToggleOff}
          onWebToggleOff={onWebToggleOff}
        />
      );

      const toggleButton = screen.getByRole("button", { name: /Toggle Web Search/i });
      fireEvent.click(toggleButton);

      expect(onVaultToggleOff).not.toHaveBeenCalled();
      expect(onWebToggleOff).not.toHaveBeenCalled();
    });

    it("shows correct active count badge", () => {
      mockGetConfigurableTools.mockReturnValue([webSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue({
        toolDefaults: {
          chat: { webSearch: true },
          agent: {},
          telegram: {},
        },
      });

      render(<ChatToolsPopover surface="chat" />);

      // The badge shows activeCount/total in two separate elements
      // Header shows "activeCount/total" in a span
      expect(screen.getByText("1/1")).toBeTruthy();
    });
  });

  // ── surface=agent ─────────────────────────────────────────────────────────────

  describe("surface=agent", () => {
    it("shows all configurable tools in agent mode", () => {
      mockGetConfigurableTools.mockReturnValue(allTools);
      (useSettingsValue as jest.Mock).mockReturnValue(baseSettings);

      render(<ChatToolsPopover surface="agent" />);

      expect(screen.getByText("Web Search")).toBeTruthy();
      expect(screen.getByText("Vault Search")).toBeTruthy();
      expect(screen.getByText("Write File")).toBeTruthy();
      expect(screen.getByText("Edit File")).toBeTruthy();
    });

    it("uses tool-specific icons instead of reusing the category icon", () => {
      mockGetConfigurableTools.mockReturnValue(allTools);
      (useSettingsValue as jest.Mock).mockReturnValue(baseSettings);

      render(<ChatToolsPopover surface="agent" />);

      const vaultSearchRow = screen.getByRole("button", { name: /Toggle Vault Search/i });
      const webSearchRow = screen.getByRole("button", { name: /Toggle Web Search/i });
      const writeFileRow = screen.getByRole("button", { name: /Toggle Write File/i });
      const editFileRow = screen.getByRole("button", { name: /Toggle Edit File/i });

      expect(within(vaultSearchRow).getByTestId("icon-folder-search")).toBeTruthy();
      expect(within(webSearchRow).getByTestId("icon-globe2")).toBeTruthy();
      expect(within(writeFileRow).getByTestId("icon-file-plus-2")).toBeTruthy();
      expect(within(editFileRow).getByTestId("icon-file-pen")).toBeTruthy();
    });

    it("prefers metadata.icon over local tool-id heuristics", () => {
      mockGetConfigurableTools.mockReturnValue([customIconTool]);
      (useSettingsValue as jest.Mock).mockReturnValue({
        toolDefaults: {
          chat: {},
          agent: { customIconTool: true },
          telegram: {},
        },
      });

      render(<ChatToolsPopover surface="agent" />);

      const customIconRow = screen.getByRole("button", { name: /Toggle Custom Icon Tool/i });
      expect(within(customIconRow).getByTestId("icon-youtube")).toBeTruthy();
    });

    it("writes to toolDefaults.agent when toggling", () => {
      mockGetConfigurableTools.mockReturnValue([writeFileTool]);
      (useSettingsValue as jest.Mock).mockReturnValue({
        toolDefaults: {
          chat: {},
          agent: { writeFile: false },
          telegram: {},
        },
      });

      render(<ChatToolsPopover surface="agent" />);

      const toggleButton = screen.getByRole("button", { name: /Toggle Write File/i });
      fireEvent.click(toggleButton);

      expect(updateSetting).toHaveBeenCalledWith(
        "toolDefaults",
        expect.objectContaining({
          agent: expect.objectContaining({ writeFile: true }),
        })
      );
    });

    it("calls onVaultToggleOff when localSearch toggled off", () => {
      mockGetConfigurableTools.mockReturnValue([localSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue({
        toolDefaults: {
          chat: {},
          agent: { localSearch: true },
          telegram: {},
        },
      });

      const onVaultToggleOff = jest.fn();

      render(<ChatToolsPopover surface="agent" onVaultToggleOff={onVaultToggleOff} />);

      // localSearch is currently true, clicking will toggle it off
      const toggleButton = screen.getByRole("button", { name: /Toggle Vault Search/i });
      fireEvent.click(toggleButton);

      expect(onVaultToggleOff).toHaveBeenCalledTimes(1);
    });

    it("calls onWebToggleOff when webSearch toggled off", () => {
      mockGetConfigurableTools.mockReturnValue([webSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue({
        toolDefaults: {
          chat: {},
          agent: { webSearch: true },
          telegram: {},
        },
      });

      const onWebToggleOff = jest.fn();

      render(<ChatToolsPopover surface="agent" onWebToggleOff={onWebToggleOff} />);

      const toggleButton = screen.getByRole("button", { name: /Toggle Web Search/i });
      fireEvent.click(toggleButton);

      expect(onWebToggleOff).toHaveBeenCalledTimes(1);
    });

    it("calls onComposerToggleOff when writeFile toggled off", () => {
      mockGetConfigurableTools.mockReturnValue([writeFileTool]);
      (useSettingsValue as jest.Mock).mockReturnValue({
        toolDefaults: {
          chat: {},
          agent: { writeFile: true },
          telegram: {},
        },
      });

      const onComposerToggleOff = jest.fn();

      render(<ChatToolsPopover surface="agent" onComposerToggleOff={onComposerToggleOff} />);

      const toggleButton = screen.getByRole("button", { name: /Toggle Write File/i });
      fireEvent.click(toggleButton);

      expect(onComposerToggleOff).toHaveBeenCalledTimes(1);
    });

    it("calls setVaultToggle with new value when localSearch toggled", () => {
      mockGetConfigurableTools.mockReturnValue([localSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue({
        toolDefaults: {
          chat: {},
          agent: { localSearch: false },
          telegram: {},
        },
      });

      const setVaultToggle = jest.fn();

      render(<ChatToolsPopover surface="agent" setVaultToggle={setVaultToggle} />);

      // localSearch is currently false, clicking will toggle it on
      const toggleButton = screen.getByRole("button", { name: /Toggle Vault Search/i });
      fireEvent.click(toggleButton);

      expect(setVaultToggle).toHaveBeenCalledWith(true);
    });
  });

  // ── search filtering ──────────────────────────────────────────────────────────

  describe("search filtering", () => {
    beforeEach(() => {
      mockGetConfigurableTools.mockReturnValue([webSearchTool, localSearchTool, writeFileTool]);
      (useSettingsValue as jest.Mock).mockReturnValue(baseSettings);
    });

    it("filters tools by display name", () => {
      render(<ChatToolsPopover surface="agent" />);

      const input = screen.getByTestId("search-input");
      fireEvent.change(input, { target: { value: "vault" } });

      expect(screen.getByText("Vault Search")).toBeTruthy();
      expect(screen.queryByText("Web Search")).toBeNull();
      expect(screen.queryByText("Write File")).toBeNull();
    });

    it("filters tools by description", () => {
      render(<ChatToolsPopover surface="agent" />);

      const input = screen.getByTestId("search-input");
      fireEvent.change(input, { target: { value: "internet" } });

      expect(screen.getByText("Web Search")).toBeTruthy();
      expect(screen.queryByText("Vault Search")).toBeNull();
      expect(screen.queryByText("Write File")).toBeNull();
    });

    it("shows all tools when search is empty", () => {
      render(<ChatToolsPopover surface="agent" />);

      const input = screen.getByTestId("search-input");

      // Type something then clear it
      fireEvent.change(input, { target: { value: "vault" } });
      fireEvent.change(input, { target: { value: "" } });

      expect(screen.getByText("Web Search")).toBeTruthy();
      expect(screen.getByText("Vault Search")).toBeTruthy();
      expect(screen.getByText("Write File")).toBeTruthy();
    });

    it("shows the query-specific empty state when no tools match", () => {
      render(<ChatToolsPopover surface="agent" />);

      const input = screen.getByTestId("search-input");
      fireEvent.change(input, { target: { value: "missing" } });

      expect(screen.getByText('No tools match "missing"')).toBeTruthy();
      expect(screen.queryByText("Web Search")).toBeNull();
      expect(screen.queryByText("Vault Search")).toBeNull();
      expect(screen.queryByText("Write File")).toBeNull();
    });
  });

  // ── bulk actions ──────────────────────────────────────────────────────────────

  describe("bulk actions", () => {
    it("Enable all calls updateSetting with all tools enabled", () => {
      mockGetConfigurableTools.mockReturnValue([webSearchTool, localSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue({
        toolDefaults: {
          chat: {},
          agent: { webSearch: false, localSearch: false },
          telegram: {},
        },
      });

      render(<ChatToolsPopover surface="agent" />);

      const enableAllButton = screen.getByRole("button", { name: /Enable all/i });
      fireEvent.click(enableAllButton);

      expect(updateSetting).toHaveBeenCalledWith(
        "toolDefaults",
        expect.objectContaining({
          agent: expect.objectContaining({ webSearch: true, localSearch: true }),
        })
      );
    });

    it("Clear all calls updateSetting with all tools disabled", () => {
      mockGetConfigurableTools.mockReturnValue([webSearchTool, localSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue({
        toolDefaults: {
          chat: {},
          agent: { webSearch: true, localSearch: true },
          telegram: {},
        },
      });

      render(<ChatToolsPopover surface="agent" />);

      const clearAllButton = screen.getByRole("button", { name: /Clear all/i });
      fireEvent.click(clearAllButton);

      expect(updateSetting).toHaveBeenCalledWith(
        "toolDefaults",
        expect.objectContaining({
          agent: expect.objectContaining({ webSearch: false, localSearch: false }),
        })
      );
    });

    it("Reset restores DEFAULT_SETTINGS for the surface", () => {
      mockGetConfigurableTools.mockReturnValue([webSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue({
        toolDefaults: {
          chat: { webSearch: true },
          agent: { webSearch: false },
          telegram: {},
        },
      });

      render(<ChatToolsPopover surface="agent" />);

      const resetButton = screen.getByRole("button", { name: /Reset/i });
      fireEvent.click(resetButton);

      expect(updateSetting).toHaveBeenCalledWith(
        "toolDefaults",
        expect.objectContaining({
          agent: { localSearch: true, webSearch: true, writeFile: true, editFile: true },
        })
      );
    });
  });

  // ── project overrides — agent surface ─────────────────────────────────────────

  describe("project overrides — agent surface", () => {
    it("disables checkbox when tool has active project boolean override", () => {
      mockGetConfigurableTools.mockReturnValue([webSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue(baseSettings);
      (getCurrentProject as jest.Mock).mockReturnValue({
        toolOverrides: { agent: { webSearch: false } },
      });

      render(<ChatToolsPopover surface="agent" />);

      const webSearchToggle = screen.getByRole("button", { name: "Toggle Web Search" });
      expect(webSearchToggle.hasAttribute("disabled")).toBe(true);
    });

    it("shows lock tooltip text for overridden tool", () => {
      mockGetConfigurableTools.mockReturnValue([webSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue(baseSettings);
      (getCurrentProject as jest.Mock).mockReturnValue({
        toolOverrides: { agent: { webSearch: false } },
      });

      render(<ChatToolsPopover surface="agent" />);

      expect(screen.getByText("Overridden by current project")).toBeTruthy();
    });

    it("does not disable checkbox when override is 'inherit'", () => {
      mockGetConfigurableTools.mockReturnValue([webSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue(baseSettings);
      (getCurrentProject as jest.Mock).mockReturnValue({
        toolOverrides: { agent: { webSearch: "inherit" } },
      });

      render(<ChatToolsPopover surface="agent" />);

      const webSearchToggle = screen.getByRole("button", { name: "Toggle Web Search" });
      expect(webSearchToggle.hasAttribute("disabled")).toBe(false);
    });

    it("uses the updated footer actions", () => {
      mockGetConfigurableTools.mockReturnValue([webSearchTool]);
      (useSettingsValue as jest.Mock).mockReturnValue(baseSettings);

      render(<ChatToolsPopover surface="agent" />);

      expect(screen.getByRole("button", { name: /Enable all/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /Reset/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /Clear all/i })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Disable all/i })).toBeNull();
    });
  });
});
