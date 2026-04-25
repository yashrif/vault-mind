# Advanced Features and Self-Host

Copilot includes several advanced features that enhance your experience. These features can use either cloud-based services or your own self-hosted infrastructure.

---

## Advanced Features

### Features Overview

Copilot provides:

- **Autonomous agent mode** — AI that reasons step-by-step and uses tools automatically
- **File editing tools** — Write to File and Replace in File for AI-driven note editing
- **Web search** — Search the internet from chat
- **YouTube transcription** — Fetch video transcripts and use them as context
- **Memory system** — Persistent memory across conversations
- **Flash model** — A built-in model that requires no separate API key
- **URL processing** — Fetch and summarize web pages as context
- **High-quality embedding models** — For semantic search

### Setting Up Features

Most advanced features are ready to use out of the box. You can configure them in **Settings → Copilot → Advanced**.

---

### Flash Model

**Flash Model** is a built-in AI model included with Copilot:

- No separate API key needed
- Works out of the box
- Supports vision (image inputs)
- Good for general-purpose tasks

It appears as `copilot-flash` in the model selector.

---

## Memory System

The memory system lets Copilot remember things across conversations, so you don't have to repeat yourself.

### Recent Conversations

Copilot can reference your recent conversation history to provide more contextually relevant responses. This is separate from the current chat window — it's a summary of what you've been working on.

- **Enable**: **Settings → Copilot → Advanced → Reference Recent Conversation** (on by default)
- **How many**: **Settings → Copilot → Advanced → Max Recent Conversations** — default 30, range 10–50
- All history is stored locally in your vault (no data leaves your machine for this feature)

### Saved Memories

You can ask Copilot to explicitly remember specific facts about you:

```
@memory remember that I'm preparing for JLPT N3 and prefer bullet-point summaries
```

Copilot saves this to a memory file in your vault and references it in future conversations.

- **Enable**: **Settings → Copilot → Advanced → Reference Saved Memories** (on by default)
- **Memory folder**: **Settings → Copilot → Advanced → Memory Folder Name** — default: `copilot/memory`
- **Update memory tool**: The AI can add, update, or remove memories when you ask

---

## Document Processor

When Copilot processes PDFs and other non-markdown files, it converts them to markdown for the AI to read.

You can optionally save the converted markdown to a folder in your vault:

- **Setting**: **Settings → Copilot → Advanced → Store converted markdown at**
- Leave empty to skip saving (conversion still happens, it just isn't persisted)

---

## Self-Host Mode

### What Is Self-Host Mode?

Self-Host Mode lets you replace Copilot's cloud services with your own infrastructure. Instead of relying on cloud services, you run everything locally or on your own server.

### What Self-Host Mode Enables

- Use local or custom LLM servers
- Custom web search via Firecrawl or Perplexity Sonar
- Local YouTube transcript extraction via Supadata
- Miyo desktop app for local PDF parsing, semantic search, and more

### Enabling Self-Host Mode

1. Go to **Settings → Copilot → Advanced**
2. Under **Self-Host Mode**, toggle **Enable Self-Host Mode**

### Web Search in Self-Host Mode

Choose your web search provider:

- **Firecrawl** — A web crawling and scraping API. Get a key at firecrawl.dev. Enter it in **Settings → Copilot → Agent → Firecrawl API Key**.
- **Perplexity Sonar** — An AI-powered search API. Get a key at perplexity.ai. Enter it in **Settings → Copilot → Agent → Perplexity API Key**.

### YouTube Transcription in Self-Host Mode

Use your own Supadata API key for YouTube transcript extraction:

- Get a key at supadata.ai
- Enter it in **Settings → Copilot → Advanced → Supadata API Key**

---

## Miyo Desktop App

Miyo is a companion desktop app from the same developer that enhances Copilot with local, offline capabilities:

### What Miyo Provides

- **Local semantic search** — Fast vector search without embedding API calls
- **PDF parsing** — Converts PDFs to markdown locally (no cloud OCR)
- **Context hub** — Manages your indexed documents locally
- **Custom server URL** — Run Miyo on any machine (local or server)

### Setting Up Miyo

1. Download and install the Miyo desktop app
2. Start the Miyo server
3. In Copilot, go to **Settings → Copilot → Advanced → Enable Miyo Search**
4. Miyo automatically connects to the local server (or use a custom URL in **Miyo Server URL**)
5. Index your vault — Copilot will use Miyo to generate and store embeddings locally

### Custom Miyo Server URL

If Miyo is running on a different machine (e.g., a home server), enter its address:

```
http://192.168.1.10:8742
```

Leave empty to use automatic local discovery.

---

## Related

- [Agent Mode and Tools](agent-mode-and-tools.md) — Using the autonomous agent
- [Vault Search and Indexing](vault-search-and-indexing.md) — How Miyo enhances semantic search
- [Getting Started](getting-started.md) — First-time setup
