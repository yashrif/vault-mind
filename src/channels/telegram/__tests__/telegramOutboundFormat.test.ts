import { formatTelegramOutboundMessage } from "../telegramOutboundFormat";

describe("formatTelegramOutboundMessage", () => {
  it("removes hidden agent metadata before building Telegram payloads", () => {
    const input = `<!--AGENT_REASONING:complete:3:["Consulting my notes"]-->

Hello!`;

    expect(formatTelegramOutboundMessage(input)).toEqual({
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
      storageText: "assistant\nHello there!",
      transportMessages: [{ parseMode: "HTML", text: "assistant\nHello there!" }],
    });
  });
});
