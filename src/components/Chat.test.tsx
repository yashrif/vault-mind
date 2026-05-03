import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import Chat from "@/components/Chat";
import { useSettingsValue } from "@/settings/model";
import { useChatManager } from "@/hooks/useChatManager";

jest.mock("@/aiParams", () => ({
  clearSelectedTextContexts: jest.fn(),
  getCurrentProject: jest.fn(() => null),
  getSelectedTextContexts: jest.fn(() => []),
  removeSelectedTextContext: jest.fn(),
  setCurrentProject: jest.fn(),
  updateIndexingProgressState: jest.fn(),
  useChainPresetId: jest.fn(() => ["chat", jest.fn()]),
  useIndexingProgress: jest.fn(() => [{ isActive: false, completionStatus: "none" }]),
  useModelKey: jest.fn(() => ["gpt-4.1-mini", jest.fn()]),
  useSelectedTextContexts: jest.fn(() => [[]]),
}));

jest.mock("@/settings/model", () => ({
  updateSetting: jest.fn(),
  useSettingsValue: jest.fn(),
}));

jest.mock("@/system-prompts", () => ({
  resetSessionSystemPromptSettings: jest.fn(),
}));

jest.mock("@/hooks/useProjectContextStatus", () => ({
  useProjectContextStatus: jest.fn(() => "ready"),
}));

jest.mock("@/logger", () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

jest.mock("@/channels/telegram/TelegramMessageAdapter", () => ({
  mapTelegramMessagesToChatMessages: jest.fn(() => []),
}));

jest.mock("@/components/chat-components/ChannelsView", () => {
  const MockChannelsView = () => <div data-testid="channels-view" />;
  MockChannelsView.displayName = "MockChannelsView";
  return {
    ChannelsView: MockChannelsView,
  };
});

jest.mock("@/components/chat-components/ChatControls", () => ({
  ChatControls: ({ surface = "default", channelsActive = false, onChannelsToggle }: any) => (
    <div
      data-testid="chat-controls"
      data-surface={surface}
      data-channels-active={String(channelsActive)}
    >
      <button type="button" onClick={onChannelsToggle}>
        Toggle channels
      </button>
    </div>
  ),
  reloadCurrentProject: jest.fn(),
}));

jest.mock("@/components/chat-components/ChatInput", () => ({
  __esModule: true,
  default: ({ surface = "default" }: any) => (
    <div data-testid="chat-input" data-surface={surface} />
  ),
}));

jest.mock("@/components/chat-components/ChatMessages", () => {
  const MockChatMessages = () => <div data-testid="chat-messages" />;
  MockChatMessages.displayName = "MockChatMessages";
  return MockChatMessages;
});

jest.mock("@/components/chat-components/NewVersionBanner", () => {
  const MockNewVersionBanner = () => <div data-testid="new-version-banner" />;
  MockNewVersionBanner.displayName = "MockNewVersionBanner";
  return {
    NewVersionBanner: MockNewVersionBanner,
  };
});

jest.mock("@/context", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  return {
    AppContext: ReactModule.createContext(undefined),
    EventTargetContext: ReactModule.createContext(undefined),
  };
});

jest.mock("@/context/ChatInputContext", () => {
  const MockChatInputProvider = ({ children }: any) => <>{children}</>;
  MockChatInputProvider.displayName = "MockChatInputProvider";
  return {
    ChatInputProvider: MockChatInputProvider,
    useChatInput: () => ({
      focusInput: jest.fn(),
    }),
  };
});

jest.mock("@/hooks/useChatManager", () => ({
  useChatManager: jest.fn(),
}));

jest.mock("@/hooks/useChatFileDrop", () => ({
  useChatFileDrop: jest.fn(() => ({ isDragActive: false })),
}));

jest.mock("@/langchainStream", () => ({
  getAIResponse: jest.fn(),
}));

jest.mock("@/LLMProviders/chainRunner/utils/promptPayloadRecorder", () => ({
  clearRecordedPromptPayload: jest.fn(),
}));

jest.mock("@/logFileManager", () => ({
  logFileManager: {
    clear: jest.fn(),
  },
}));

jest.mock("@/runtime/ChainPreset", () => ({
  isRichContextPresetId: jest.fn(() => true),
}));

jest.mock("@/utils", () => ({
  err2String: jest.fn(() => "error"),
}));

jest.mock("@/utils/base64", () => ({
  arrayBufferToBase64: jest.fn(() => ""),
}));

jest.mock("@/utils/fileContentExtractor", () => ({
  extractFileContent: jest.fn(),
  isImageFile: jest.fn(() => false),
}));

jest.mock("obsidian", () => ({
  Notice: jest.fn(),
  TFile: class {},
}));

jest.mock("@/components/modals/project/context-manage-modal", () => ({
  ContextManageModal: class {
    open() {}
  },
}));

jest.mock("@/components/chat-components/hooks/useActiveWebTabState", () => ({
  useActiveWebTabState: jest.fn(() => ({ activeWebTabForMentions: null })),
}));

describe("Chat command-center surface wiring", () => {
  const plugin = {
    app: {},
    chatSelectionHighlightController: {
      clearForNewChat: jest.fn(),
      clearIfNoNoteContexts: jest.fn(),
      persistFromPointerDown: jest.fn(),
    },
    manifest: {
      version: "1.0.0",
    },
    suppressCurrentWebSelection: jest.fn(),
  } as any;

  const chainManager = {
    chatModelManager: {
      getChatModel: jest.fn(),
    },
  } as any;

  const chatUIState = {
    clearMessages: jest.fn(),
    getMessages: jest.fn(() => []),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (useSettingsValue as jest.Mock).mockReturnValue({
      autoAddActiveContentToContext: false,
      autosaveChat: false,
      debug: false,
      enableRecentConversations: false,
      telegramAllowedChatIds: [],
      telegramBotApiKey: "",
      telegramEnabled: false,
    });
    (useChatManager as jest.Mock).mockReturnValue({
      addMessage: jest.fn(),
      messages: [],
    });
  });

  it("enables the command-center surface only on the main chat path", () => {
    render(
      <Chat
        chainManager={chainManager}
        onSaveChat={jest.fn()}
        updateUserMessageHistory={jest.fn()}
        fileParserManager={{} as any}
        plugin={plugin}
        chatUIState={chatUIState}
      />
    );

    expect(screen.getByTestId("chat-controls").getAttribute("data-surface")).toBe("command-center");
    expect(screen.getByTestId("chat-input").getAttribute("data-surface")).toBe("command-center");
    expect(screen.queryByTestId("channels-view")).toBeNull();
  });

  it("keeps channels on the transport-specific path without the command-center composer", () => {
    render(
      <Chat
        chainManager={chainManager}
        onSaveChat={jest.fn()}
        updateUserMessageHistory={jest.fn()}
        fileParserManager={{} as any}
        plugin={plugin}
        chatUIState={chatUIState}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle channels" }));

    expect(screen.getByTestId("chat-controls").getAttribute("data-surface")).toBe("default");
    expect(screen.getByTestId("chat-controls").getAttribute("data-channels-active")).toBe("true");
    expect(screen.queryByTestId("chat-input")).toBeNull();
    expect(screen.getByTestId("channels-view")).toBeTruthy();
  });
});
