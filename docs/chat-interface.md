# Chat Interface

The Cortex chat panel is the main way you interact with AI in Obsidian. This guide covers the full layout of the chat UI — every section, button, and control — as well as modes, message actions, history, settings, and advanced features like auto-compact.

---

## Layout Overview

The chat panel is divided into three main sections stacked top to bottom:

1. **Header bar** — Mode selector and toolbar controls
2. **Messages area** — Conversation history, suggested prompts, and relevant notes
3. **Input area** — Context bar, text editor, and send controls

---

## Header Bar

The header runs across the top of the chat panel and contains two groups of controls.

### Left side: Mode selector

The **mode selector** on the left shows the current chat mode. Click it to switch between Chat, Agent, and Channels. See [Modes and Channels](#modes-and-channels) below for details.

### Right side: Toolbar icons

From left to right:

- **Token counter** (coin icon) — Estimates how many tokens are in your current context based on the latest AI response. Shows `<1k` for under 1,000 tokens, or `Xk` for larger counts. Hover to see the exact number. Hidden in Channels view.

- **New Chat** (message-circle-plus icon) — Starts a fresh conversation. Saves the current chat if autosave is enabled, then clears the window. In Channels view, this resets the channel instead.

- **Chat Settings** (gear icon) — Opens per-session settings that apply only to the current conversation. Hidden in Channels view. See [Per-Session Settings](#per-session-settings-gear-icon) below.

- **Save Chat as Note** (download icon) — Manually saves the current conversation to your vault. Only shown when autosave is turned off.

- **Chat History** (history/clock icon) — Opens a list of previous conversations. Click any entry to load it. You can also rename, delete, or open the source file from this list.

- **More options** (three-dot icon) — Opens a dropdown with additional toggles:
  - **Suggested Prompts** — Show or hide prompt suggestions in the empty chat state
  - **Relevant Notes** — Show or hide the related notes panel
  - **Auto-accept Edits** — When enabled, agent edit actions are applied without confirmation prompts
  - **Refresh Vault Index / Reload Current Project** — Re-reads current index data
  - **Force Reindex Vault / Force Rebuild Context** — Full rebuild of the search index (shown with a warning icon; use when the index seems stale)

---

## Modes and Channels

The mode selector controls how Cortex responds and what tools it has access to.

- **Chat**: conversational mode for general questions and note-aware context.
- **Chat + RAG**: Chat with vault retrieval enabled. Cortex prefers searching your notes when your request needs vault context.
- **Agent**: tool-using mode that can use read and write tools according to your settings.
- **Project Agent**: Agent scoped to the selected project context.
- **Telegram**: channel-specific behavior with isolated Telegram history and Telegram-safe formatting.

### Chat

General-purpose conversation. Good for writing, brainstorming, summarizing, or any task where you want to talk to an AI. Your currently open note and selected text are automatically included as context.

Chat can use the context you attach or already have open, such as the active note, selected text, and mentioned notes. To let Cortex search across your vault automatically, switch to **Chat + RAG**.

The secondary control in Chat mode is a retrieval toggle:

- **General** — Responds from the model's training knowledge plus your active note/selection context. No vault search.
- **Ask vault** — Automatically searches your vault for relevant notes and includes them as context. Good for questions about your notes.

### Agent

The most powerful mode. Combines conversational chat with a tool-using agent that can search your vault and the web, read and edit notes, remember things across conversations, and use a growing set of tools automatically.

The secondary control in Agent mode is a scope selector:

- **All notes** — Agent has access to your full vault.
- **Project: [name]** — Agent is scoped to a specific project. Projects have their own context, model, system prompt, and isolated chat history. Click the scope selector to switch projects. See [Projects](projects.md) for details.

### Channels

Click the **antenna/radio icon** in the mode selector to open the Channels view. Channels are external messaging integrations that receive and send messages outside Obsidian.

#### Telegram

A bridge between Telegram and Cortex. Shows one always-on read-only thread managed by Telegram channel state.

- Requires desktop app
- Requires a Telegram bot token
- Requires at least one allowlisted chat ID in **Settings → Cortex → Telegram → Allowed Chat IDs**
- The first inbound message from an allowlisted chat becomes the primary chat
- Obsidian composer input is disabled in Channels view (send messages from Telegram)
- Messages that arrive from Telegram still receive AI replies sent back to Telegram
- In-message actions are intentionally limited to avoid unsafe edits/regenerations on external chat history

**Telegram tool settings** are configurable under **Settings → Cortex → Telegram → Telegram Tools**. All configurable tools are on by default; toggle individual tools off to prevent the bot from using them. Always-enabled tools (such as time lookup and note reading) are not shown and cannot be disabled.

---

## Context Bar

Just above the text editor is the context bar — a row that shows everything Cortex currently has as context for your message.

### Adding context

Click the **@ button** on the left to open the context menu. You can add:

- Notes (by name)
- Folders
- URLs
- Web tabs (desktop)
- Selections from notes

You can also type `[[Note Title]]` directly in your message to pull in a note's content as inline context.

### Context badges

Each piece of context appears as a badge in the row:

| Badge type     | Icon                   | Details                                   |
| -------------- | ---------------------- | ----------------------------------------- |
| Active note    | File icon              | Current open note; click to open the file |
| Active web tab | Favicon                | Current browser tab (desktop only)        |
| Note           | File icon              | A specific vault note                     |
| URL            | Globe icon             | A web address                             |
| Web tab        | Favicon                | A specific browser tab                    |
| Folder         | Folder icon            | An entire folder of notes                 |
| Selected text  | File icon + line range | A highlighted range, e.g. L12–L18         |

Click the **×** on any badge to remove it from context.

If a note, selected text, search result, or attached file contains Cortex's saved reasoning display metadata, Cortex removes that metadata before sending the context to the AI. Your original notes and files are not changed.

### Context status (projects)

When a project is active, a status icon appears on the right side of the context bar:

- **Check circle** (green) — Context is ready
- **Spinner** — Context is loading
- **Alert circle** (red) — An error occurred; click to see details
- **Dashed circle** — Not yet started

When not in a project, an **Indexing...** spinner appears while the vault index is being built. Click it for indexing progress details.

---

## Messages Area

The scrollable center of the panel shows all messages in the current conversation.

### Empty state

Before any messages are sent, the messages area shows:

- **Relevant Notes** — A list of notes semantically related to your active note (if enabled). See [Relevant Notes](#relevant-notes).
- **Suggested Prompts** — Three prompt ideas based on the current mode (if enabled). See [Suggested Prompts](#suggested-prompts).

### Message display

Each message in the conversation shows the sender name and content. AI responses are rendered with full markdown formatting.

#### User message buttons

Hover over your message to reveal action buttons:

- **Edit** — Modify the message text. Press Enter to re-send the edited message.
- **Copy** — Copy the message text to clipboard.
- **Delete** — Remove this message from the conversation.

#### AI message buttons

Hover over an AI response to reveal action buttons:

- **Show Sources** — If the response used vault or web search, this shows the source references. Only appears when sources are available.
- **Insert at cursor** — Inserts the AI's response at your cursor position in the active note.
- **Replace at cursor** — Replaces the currently selected text in your note with the AI's response.
- **Copy** — Copies the response to clipboard.
- **Regenerate** — Asks the AI to generate a new response to the same message.
- **Delete** — Removes this response from the conversation.

---

## Input Area

The input area at the bottom of the panel is where you compose messages.

### Text editor

Type your message in the editor. The placeholder text reads:

> Your AI assistant for Obsidian • @ to add context • / for custom prompts

- Press **Enter** to send (configurable in Settings → Basic → **Default Send Shortcut**)
- Press **Shift+Enter** to add a new line
- Type **@** to open the context menu inline
- Type **/** to trigger custom prompt slash commands

When a project is loading, a rotating status message appears as an overlay on the editor.

### Attached files

If you attach images or documents, they appear above the editor as thumbnails or file cards. Click the **×** on any file to remove it before sending.

### Bottom control bar

The bar at the very bottom of the input area contains controls on both sides.

**Left side:**

- While the AI is generating: a loading spinner and "Generating..." label.
- While idle: the **model selector** dropdown lets you choose which AI model to use for this conversation. Disabled when the current project has a locked model.

**Right side:**

- While the AI is **generating**: a **Stop** button (stop-circle icon) — click to interrupt the stream immediately.
- While **idle**:
  - **Tool toggles** (see [Tool Toggles](#tool-toggles) below)
  - **Attach file** (image icon) — Opens the file picker to attach images or documents. Tooltip: "Attach file(s)".
  - **Cancel** (edit mode only) — Cancels an in-progress message edit.
  - **Send / Save button** — Labeled "chat" in normal mode, "save" in edit mode. Shows a return-arrow icon. Sends the message or saves the edit.

### Drag and drop

You can drag image or document files directly onto the chat panel. A full-panel overlay appears with "Drop files here..." to confirm the drop zone is active.

---

## Tool Toggles

Chat uses the **General / Ask vault** retrieval toggle next to the mode selector. Agent and Project Agent show tool toggles to the left of the send button. On wider panels they show as individual icons; on narrow panels they collapse into a **⋯** dropdown menu.

| Toggle       | Icon           | Description                                                 |
| ------------ | -------------- | ----------------------------------------------------------- |
| Vault Search | Database       | Searches your vault for relevant notes when responding.     |
| Web Search   | Globe          | Searches the web for up-to-date information.                |
| Composer     | Sparkles + Pen | Enables the agent to propose and apply edits to your notes. |

Active toggles are highlighted. Project Agent follows the selected project's tool settings and overrides.

---

## Chat History

Click the **history icon** in the header toolbar to open the Chat History panel. You can:

- Browse previous conversations sorted by most recent or alphabetically
- Click a conversation to load it and continue from where you left off
- Rename a conversation
- Delete conversations you no longer need
- Open the underlying source file in your vault

---

## Per-Session Settings (Gear Icon)

Click the **gear icon** in the header toolbar to open per-session settings. These apply only to the current conversation and reset when you start a new chat:

- **System prompt** — Select or override the system prompt for this session using the dropdown selector.
- **Model parameters** — Adjust Temperature (controls randomness, 0 = deterministic, 1 = creative) and Max Tokens (maximum response length). A reset button restores defaults.
- **Disable built-in system prompt** — Turns off Cortex's default system prompt for this session. A confirmation prompt appears before applying.

A note at the bottom of the popover reminds you: "Settings apply to this chat session only."

---

## Token Counter

The **token counter** (coin icon) in the header toolbar estimates how many tokens are being consumed by your current context, based on the latest AI response. Use it to gauge when you're approaching the model's context limits.

- `<1k` — fewer than 1,000 tokens
- `Xk` — thousands of tokens (rounded down)
- Hover to see the exact token count

---

## Auto-Compact

When a conversation grows very long, it can exceed the model's context window. Auto-compact automatically summarizes the older portion of the conversation and replaces it with a compressed summary, letting you continue chatting without losing track of what was discussed.

The threshold is configured in Settings → Basic → **Auto-compact threshold**, which defaults to 128,000 tokens. Valid range: 64,000–1,000,000 tokens.

When auto-compact triggers, you'll see a "Compacting" indicator in the chat. The conversation continues normally — older messages are replaced by a summary, so the AI still understands the history even though you can no longer scroll back to see the original messages.

---

## Suggested Prompts

When starting a new chat, Cortex shows suggested prompts based on the current mode. Each prompt card shows a category label and the prompt text. Click **+ Add to Chat** to drop the prompt into the editor.

You can enable or disable suggested prompts in the **⋯ more options** menu in the header, or in Settings → Basic → **Show suggested prompts**.

---

## Relevant Notes

Cortex displays a list of notes semantically related to your currently active note at the top of the messages area. This helps surface notes you might want to reference without manually searching.

Each entry shows:

- A similarity score badge (color-coded: green = high, orange = medium, red = low)
- The note title (click to open)
- A content preview
- Back-link and outgoing link indicators
- An **Add to Chat** button to pull the note into your context

A **Refresh** button re-runs the similarity search. If the vault index hasn't been built yet, a **Build Index** button appears instead.

You can enable or disable Relevant Notes in the **⋯ more options** menu in the header, or in **Settings → Cortex → Basic → Relevant Notes** (on by default).

---

## Saving a Chat Manually

If autosave is off, or you want to save mid-conversation, click the **Save Chat as Note** button (download icon) in the header toolbar. This saves the current conversation to your configured save folder.

---

## Autosave and Chat File Names

By default, Cortex automatically saves your conversations as markdown files in `cortex/cortex-conversations/`. You can turn off autosave in Settings → Basic.

The filename template controls how saved chats are named. The default is:

```
{$topic}@{$date}_{$time}
```

Where:

- `{$topic}` — An AI-generated title (or the first few words of your first message if AI titles are off)
- `{$date}` — Date in YYYY-MM-DD format
- `{$time}` — Time in HH-MM-SS format

All three variables are required. You can customize the format in Settings → Basic → **Conversation note name**.

When **Generate AI chat title on save** is enabled (default), Cortex asks the AI to generate a short descriptive title when saving. When disabled, the first 10 words of your first message are used instead.

---

## New Chat Behavior

Click the **new chat icon** (message-circle-plus) in the toolbar, or use the command palette: **New Cortex Chat**. This:

1. Saves the current conversation (if autosave is enabled)
2. Clears the chat window
3. Resets the context to your currently active note

---

## Related

- [Context and Mentions](context-and-mentions.md) — Control what context the AI sees
- [System Prompts](system-prompts.md) — Customize AI behavior with system prompts
- [Agent Mode and Tools](agent-mode-and-tools.md) — What the agent can do
- [Projects](projects.md) — Isolated workspaces with separate histories
