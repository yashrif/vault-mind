# Context and Mentions

Copilot uses **context** to give the AI information about your notes, selected text, web content, and more. You can control exactly what context the AI sees using automatic context, @-mentions, and manual commands.

---

## Automatic Context

### Active Note

By default, the content of your currently open note is automatically included in every message you send. This means you can ask things like:

- "Summarize this note"
- "What are the action items here?"
- "Add a conclusion section"

To disable automatic note context: **Settings → Copilot → Basic → Auto-add active note to context** (toggle off).

### Active Web Tab (Desktop Only)

If you have the Copilot Web Viewer open alongside your notes, the content of the currently active web tab is automatically included as context (labeled `{activeWebTab}`). This lets you ask the AI to help you work with web content.

### Selected Text

If you highlight text in a note and then type in the chat, the selected text is automatically included as context. This is useful for asking about or transforming a specific part of a note.

You can enable/disable automatic selection adding in **Settings → Copilot → Basic → Auto-add selection to context**.

### Images in Markdown

If your note contains images (e.g., `![[screenshot.png]]`), and you're using a model with **Vision** capability, those images are automatically included in the context. Copilot will pass the image data to the AI so it can see and describe the image.

To control this behavior: **Settings → Copilot → Basic → Pass markdown images to AI**.

---

## @-Mentions

Type `@` in the chat input to mention and include specific items as context.

### @note — Include a Specific Note

Type `@` followed by the note title to add a note to context:

```
@My Meeting Notes tell me what was decided in this meeting
```

The note's full content is included in the request.

### @folder — Include a Folder of Notes

Type `@` followed by a folder name to include all notes in that folder:

```
@Projects/ what tasks are still open?
```

### @tags — Include Notes by Tag

Use `#` after `@` to include all notes with a specific tag:

```
@#work/project summarize the status of the work project
```

### @URL — Include a Web Page

Paste a URL or type `@https://...` to fetch and include a web page's content:

```
@https://example.com/article summarize this article
```

URL processing allows you to include external content. YouTube URLs are handled specially — Copilot will fetch the video transcript automatically.

### Tool Mentions

These special @-mentions explicitly trigger tools in Agent mode:

| Mention                | What it does                                     |
| ---------------------- | ------------------------------------------------ |
| `@vault`               | Search your vault notes for relevant information |
| `@websearch` or `@web` | Search the internet                              |
| `@composer`            | Create or edit a note                            |
| `@memory`              | Access or update your memory                     |

Example:

```
@vault what did I write about machine learning last month?
@websearch what are the latest changes to the Python packaging ecosystem?
```

---

## Adding Context Manually

### Add Selection to Chat Context

Use the command palette: **Add selection to chat context**

Highlights the selected text and adds it to the chat as context without sending a message. Useful when you want to build up context before sending.

### Add Web Selection to Chat Context

Use the command palette: **Add web selection to chat context**

Works similarly but captures selected text from the Web Viewer. Available on desktop only.

### Adding Files as Context

Click the **attach button** in the bottom-right corner of the chat input to add files as context.

- **Images** are sent as vision input (for models that support Vision).
- **Supported non-image files** from your vault are added as note context, including markdown/text files, PDF, Canvas, DOC/DOCX, XLS/XLSX/CSV, and audio formats.
- Non-image files must resolve to files inside your current vault.

### Adding an Image as Context

Drag an image directly into the chat input box, or click the **attach button** in the bottom-right corner of the chat input. The image is sent to the AI if your selected model supports **Vision** capability.

### Adding Audio as Context

Drag an audio file (MP3, MP4, MPEG, MPGA, M4A, WAV, or WebM) into the chat input box, use the **attach button**, or use **@ mention** to attach a file from your vault. Copilot transcribes the audio via the configured Audio STT model and injects the transcript as text context for the AI.

- Transcription happens automatically on attach and results are cached — re-attaching the same file is instant.
- Files larger than 25 MB cannot be transcribed by Groq. Split or compress the file if you hit this limit.
- The transcript counts toward the context window of your chat model, not a separate quota.
- Audio transcription works in both Chat mode and Projects mode.

To set up audio transcription, configure an Audio STT model in **Settings → Copilot → Models → Audio STT Models**. See [Models and Parameters](models-and-parameters.md#audio-stt-models) for details.

---

## Context Indicators

When context items are added to your message, Copilot shows small pills or badges in the chat input area showing what's included (e.g., the note name, a URL, a tag). This helps you confirm exactly what the AI will see.

---

## Context Behavior by Mode

| Context Type    | Chat           | Vault QA     | Agent Mode   |
| --------------- | -------------- | ------------ | ------------ |
| Active note     | Yes (auto)     | Yes (auto)   | Yes (auto)   |
| Selected text   | Yes (auto)     | Yes (auto)   | Yes (auto)   |
| @note / @folder | Yes            | Yes          | Yes          |
| @URL processing | Yes            | Yes          | Yes          |
| @vault search   | Yes (explicit) | Auto         | Auto         |
| @websearch      | No             | No           | Yes          |
| Images (vision) | Yes            | Yes          | Yes          |
| Active web tab  | Desktop only   | Desktop only | Desktop only |

---

## Related

- [Chat Interface](chat-interface.md) — How the chat panel works
- [Agent Mode and Tools](agent-mode-and-tools.md) — More on @vault and @websearch
- [Vault Search and Indexing](vault-search-and-indexing.md) — How vault search works
