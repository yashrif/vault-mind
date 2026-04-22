import { formatTelegramOutboundText } from "../telegramOutboundFormat";

describe("formatTelegramOutboundText", () => {
  it("removes hidden agent metadata before sending to Telegram", () => {
    const input = `<!--AGENT_REASONING:complete:3:["Consulting my notes"]-->

Hello!`;

    expect(formatTelegramOutboundText(input)).toBe("Hello!");
  });

  it("normalizes common markdown into Telegram-friendly plain text", () => {
    const input = `# Study Plan

**Focus:** Review [Lecture 03](https://example.com/lecture-03)

- Revisit \`AdaBoost\`
- Check ~~old~~ updated notes

\`\`\`python
print("hi")
\`\`\``;

    expect(formatTelegramOutboundText(input)).toBe(`Study Plan

Focus: Review Lecture 03 (https://example.com/lecture-03)

• Revisit AdaBoost
• Check old updated notes

python:
print("hi")`);
  });

  it("strips leaked chat template control tokens", () => {
    const input = "<|im_start|>assistant\nHello there!<|im_end|>";

    expect(formatTelegramOutboundText(input)).toBe("assistant\nHello there!");
  });
});
