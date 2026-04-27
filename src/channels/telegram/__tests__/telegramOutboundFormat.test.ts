import { formatTelegramOutboundMessage } from "../telegramOutboundFormat";

describe("formatTelegramOutboundMessage", () => {
  it("removes hidden agent metadata before building Telegram payloads", () => {
    const input = `<!--AGENT_REASONING:complete:3:["Consulting my notes"]-->

Hello!`;

    expect(formatTelegramOutboundMessage(input)).toEqual({
      displayText: input,
      storageText: "Hello!",
      transportMessages: [{ parseMode: "HTML", text: "Hello!" }],
    });
  });

  it("renders common markdown into Telegram HTML while preserving local markdown storage", () => {
    const input = `# Study Plan

**Focus:** Review [Lecture 03](https://example.com/lecture-03)

- Revisit \`AdaBoost\`
- Check ~~old~~ updated notes`;

    expect(formatTelegramOutboundMessage(input)).toEqual({
      displayText: input,
      storageText: input,
      transportMessages: [
        {
          parseMode: "HTML",
          text: '<b>Study Plan</b>\n\n<b>Focus:</b> Review <a href="https://example.com/lecture-03">Lecture 03</a>\n\n• Revisit <code>AdaBoost</code>\n• Check <s>old</s> updated notes',
        },
      ],
    });
  });

  it("renders fenced code and tables into Telegram preformatted HTML", () => {
    const input = `| Name | Score |
| --- | --- |
| Ada | 95 |

\`\`\`python
print("hi")
\`\`\``;

    expect(formatTelegramOutboundMessage(input)).toEqual({
      displayText: input,
      storageText: input,
      transportMessages: [
        {
          parseMode: "HTML",
          text: '<pre>| Name | Score |\n| --- | --- |\n| Ada | 95 |</pre>\n\n<pre><code class="language-python">print("hi")</code></pre>',
        },
      ],
    });
  });

  it("strips leaked chat template control tokens", () => {
    const input = "<|im_start|>assistant\nHello there!<|im_end|>";

    expect(formatTelegramOutboundMessage(input)).toEqual({
      displayText: "assistant\nHello there!",
      storageText: "assistant\nHello there!",
      transportMessages: [{ parseMode: "HTML", text: "assistant\nHello there!" }],
    });
  });

  it("preserves reasoning while still stripping tool markers from local display text", () => {
    const input = `<!--AGENT_REASONING:complete:3:["Consulting my notes"]-->

<!--TOOL_CALL_START:123:localSearch:Local Search:🔍::true-->Searching...<!--TOOL_CALL_END:123:Found 5 results-->

Hello!`;

    expect(formatTelegramOutboundMessage(input)).toEqual({
      displayText: `<!--AGENT_REASONING:complete:3:["Consulting my notes"]-->

Hello!`,
      storageText: "Hello!",
      transportMessages: [{ parseMode: "HTML", text: "Hello!" }],
    });
  });

  it("removes CORTEX_REASONING:v1 markers from transport messages", () => {
    const input = `<!--CORTEX_REASONING:v1:{"version":1,"source":"agent","status":"complete","elapsedSeconds":5,"items":["Searching notes","Analyzed results"]}-->

Hello!`;

    const result = formatTelegramOutboundMessage(input);
    expect(result.storageText).toBe("Hello!");
    expect(result.transportMessages).toEqual([{ parseMode: "HTML", text: "Hello!" }]);
    // displayText preserves the reasoning marker for the Obsidian panel
    expect(result.displayText).toContain("CORTEX_REASONING:v1");
  });

  it("preserves CORTEX_REASONING:v1 in displayText while stripping tool markers", () => {
    const reasoning = `<!--CORTEX_REASONING:v1:{"version":1,"source":"agent","status":"complete","elapsedSeconds":3,"items":["Consulting notes"]}-->`;
    const input = `${reasoning}

<!--TOOL_CALL_START:123:localSearch:Local Search:🔍::true-->Searching...<!--TOOL_CALL_END:123:Found 5 results-->

Hello!`;

    const result = formatTelegramOutboundMessage(input);
    expect(result.displayText).toContain("CORTEX_REASONING:v1");
    expect(result.displayText).not.toContain("TOOL_CALL_START");
    expect(result.storageText).toBe("Hello!");
    expect(result.transportMessages).toEqual([{ parseMode: "HTML", text: "Hello!" }]);
  });
});
