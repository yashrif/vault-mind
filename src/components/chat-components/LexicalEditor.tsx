import React, { useCallback, useEffect } from "react";
import { $getRoot, EditorState, LexicalEditor as LexicalEditorType } from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { TFile } from "obsidian";
import type { WebTabContext } from "@/types/message";
import { SlashCommandPlugin } from "./plugins/SlashCommandPlugin";
import { NoteCommandPlugin } from "./plugins/NoteCommandPlugin";
import { TagCommandPlugin } from "./plugins/TagCommandPlugin";
import { AtMentionCommandPlugin } from "./plugins/AtMentionCommandPlugin";
import { NotePillNode } from "./pills/NotePillNode";
import { URLPillNode } from "./pills/URLPillNode";
import { ToolPillNode } from "./pills/ToolPillNode";
import { FolderPillNode } from "./pills/FolderPillNode";
import { ActiveNotePillNode } from "./pills/ActiveNotePillNode";
import { WebTabPillNode } from "./pills/WebTabPillNode";
import { ActiveWebTabPillNode } from "./pills/ActiveWebTabPillNode";
import { PillDeletionPlugin } from "./plugins/PillDeletionPlugin";
import { KeyboardPlugin } from "./plugins/KeyboardPlugin";
import { ValueSyncPlugin } from "./plugins/ValueSyncPlugin";
import { FocusPlugin } from "./plugins/FocusPlugin";
import { NotePillSyncPlugin } from "./plugins/NotePillSyncPlugin";
import { URLPillSyncPlugin } from "./plugins/URLPillSyncPlugin";
import { ToolPillSyncPlugin } from "./plugins/ToolPillSyncPlugin";
import { FolderPillSyncPlugin } from "./plugins/FolderPillSyncPlugin";
import { ActiveNotePillSyncPlugin } from "./plugins/ActiveNotePillSyncPlugin";
import { WebTabPillSyncPlugin } from "./plugins/WebTabPillSyncPlugin";
import { PastePlugin } from "./plugins/PastePlugin";
import { TextInsertionPlugin } from "./plugins/TextInsertionPlugin";
import { useChatInput } from "@/context/ChatInputContext";
import { cn } from "@/lib/utils";
import { logError } from "@/logger";
import { ActiveFileProvider } from "./context/ActiveFileContext";
import { isRichContextPresetId, type ChainPresetId } from "@/runtime/ChainPreset";
import { useSettingsValue } from "@/settings/model";

interface LexicalEditorProps {
  surface?: "default" | "command-center";
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onNotesChange?: (notes: { path: string; basename: string }[]) => void;
  onNotesRemoved?: (removedNotes: { path: string; basename: string }[]) => void;
  onURLsChange?: (urls: string[]) => void;
  onURLsRemoved?: (removedUrls: string[]) => void;
  onToolsChange?: (tools: string[]) => void;
  onToolsRemoved?: (removedTools: string[]) => void;
  onFoldersChange?: (folders: string[]) => void;
  onFoldersRemoved?: (removedFolders: string[]) => void;
  onActiveNoteAdded?: () => void;
  onActiveNoteRemoved?: () => void;
  onWebTabsChange?: (webTabs: WebTabContext[]) => void;
  onWebTabsRemoved?: (removedWebTabs: WebTabContext[]) => void;
  onActiveWebTabAdded?: () => void;
  onActiveWebTabRemoved?: () => void;
  onEditorReady?: (editor: any) => void;
  onImagePaste?: (files: File[]) => void;
  onTagSelected?: () => void;
  isAgentMode?: boolean;
  currentActiveFile?: TFile | null;
  presetId?: ChainPresetId;
}

const LexicalEditor: React.FC<LexicalEditorProps> = ({
  surface = "default",
  value,
  onChange,
  onSubmit,
  placeholder = "Type a message...",
  disabled = false,
  className = "",
  onNotesChange,
  onNotesRemoved,
  onURLsChange,
  onURLsRemoved,
  onToolsChange,
  onToolsRemoved,
  onFoldersChange,
  onFoldersRemoved,
  onActiveNoteAdded,
  onActiveNoteRemoved,
  onWebTabsChange,
  onWebTabsRemoved,
  onActiveWebTabAdded,
  onActiveWebTabRemoved,
  onEditorReady,
  onImagePaste,
  onTagSelected,
  isAgentMode = false,
  currentActiveFile = null,
  presetId,
}) => {
  const [focusFn, setFocusFn] = React.useState<(() => void) | null>(null);
  const [editorInstance, setEditorInstance] = React.useState<LexicalEditorType | null>(null);
  const chatInputContext = useChatInput();
  const settings = useSettingsValue();

  // Wrapper to properly set function state (avoids React's updater function interpretation)
  const handleFocusRegistration = React.useCallback((fn: () => void) => {
    setFocusFn(() => fn);
  }, []);

  // Register editor and focus handler with context
  useEffect(() => {
    if (editorInstance) {
      chatInputContext.registerEditor(editorInstance);
    }
  }, [editorInstance, chatInputContext]);

  useEffect(() => {
    if (focusFn) {
      chatInputContext.registerFocusHandler(focusFn);
    }
  }, [focusFn, chatInputContext]);

  const initialConfig = React.useMemo(
    () => ({
      namespace: "ChatEditor",
      theme: {
        root: "tw-outline-none",
        paragraph: "tw-m-0",
      },
      nodes: [
        NotePillNode,
        ActiveNotePillNode,
        ToolPillNode,
        FolderPillNode,
        WebTabPillNode,
        ActiveWebTabPillNode,
        ...(onURLsChange ? [URLPillNode] : []),
      ],
      onError: (error: Error) => {
        logError("Lexical error:", error);
      },
      editable: !disabled,
    }),
    [onURLsChange, disabled]
  );

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const root = $getRoot();
        const textContent = root.getTextContent();
        onChange(textContent);
      });
    },
    [onChange]
  );

  const handleEditorReady = useCallback(
    (editor: LexicalEditorType) => {
      setEditorInstance(editor);
      onEditorReady?.(editor);
    },
    [onEditorReady]
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <ActiveFileProvider currentActiveFile={currentActiveFile}>
        <div className={cn("tw-relative", className)}>
          <PlainTextPlugin
            contentEditable={
              <ContentEditable
                className={cn(
                  "tw-w-full tw-resize-none tw-overflow-y-auto tw-border-none tw-bg-transparent tw-text-sm tw-text-normal tw-outline-none focus-visible:tw-ring-0",
                  surface === "command-center"
                    ? "tw-max-h-32 tw-min-h-[44px] tw-rounded-none tw-px-2.5 tw-pb-1 tw-pt-0.5"
                    : "tw-max-h-40 tw-min-h-[60px] tw-rounded-md tw-px-2"
                )}
                aria-label="Chat input"
              />
            }
            placeholder={
              <div
                className={cn(
                  "tw-pointer-events-none tw-absolute tw-select-none tw-text-sm tw-text-muted/60",
                  surface === "command-center" ? "tw-left-2.5 tw-top-0.5" : "tw-left-2 tw-top-0"
                )}
              >
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <OnChangePlugin onChange={handleEditorChange} />
          <HistoryPlugin />
          <KeyboardPlugin onSubmit={onSubmit} sendShortcut={settings.defaultSendShortcut} />
          <ValueSyncPlugin value={value} />
          <FocusPlugin onFocus={handleFocusRegistration} onEditorReady={handleEditorReady} />
          <NotePillSyncPlugin onNotesChange={onNotesChange} onNotesRemoved={onNotesRemoved} />
          {onURLsChange && (
            <URLPillSyncPlugin onURLsChange={onURLsChange} onURLsRemoved={onURLsRemoved} />
          )}
          <ToolPillSyncPlugin onToolsChange={onToolsChange} onToolsRemoved={onToolsRemoved} />
          <FolderPillSyncPlugin
            onFoldersChange={onFoldersChange}
            onFoldersRemoved={onFoldersRemoved}
          />
          <ActiveNotePillSyncPlugin
            onActiveNoteAdded={onActiveNoteAdded}
            onActiveNoteRemoved={onActiveNoteRemoved}
          />
          <WebTabPillSyncPlugin
            onWebTabsChange={onWebTabsChange}
            onWebTabsRemoved={onWebTabsRemoved}
            onActiveWebTabAdded={onActiveWebTabAdded}
            onActiveWebTabRemoved={onActiveWebTabRemoved}
          />
          <PillDeletionPlugin />
          <PastePlugin enableURLPills={!!onURLsChange} onImagePaste={onImagePaste} />
          <SlashCommandPlugin />
          <NoteCommandPlugin isAgentMode={isAgentMode} currentActiveFile={currentActiveFile} />
          {presetId && isRichContextPresetId(presetId) && (
            <TagCommandPlugin onTagSelected={onTagSelected} />
          )}
          <AtMentionCommandPlugin isAgentMode={isAgentMode} currentActiveFile={currentActiveFile} />
          <TextInsertionPlugin />
        </div>
      </ActiveFileProvider>
    </LexicalComposer>
  );
};

export default LexicalEditor;
