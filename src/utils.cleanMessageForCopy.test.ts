import { serializeReasoningPayload } from "@/LLMProviders/chainRunner/utils/AgentReasoningState";
import { cleanMessageForCopy } from "./utils";

describe("cleanMessageForCopy", () => {
  it("should remove Think blocks", () => {
    const input = "Before text\n<think>This is my thought process</think>\nAfter text";
    const expected = "Before text\n\nAfter text";
    expect(cleanMessageForCopy(input)).toBe(expected);
  });

  it("should remove writeFile blocks wrapped in XML codeblocks", () => {
    const input = `Some text before
\`\`\`xml
<writeFile>
<path>test.md</path>
<content>File content here</content>
</writeFile>
\`\`\`
Some text after`;
    const expected = "Some text before\n\nSome text after";
    expect(cleanMessageForCopy(input)).toBe(expected);
  });

  it("should remove standalone writeFile blocks", () => {
    const input = `Text before
<writeFile>
<path>test.md</path>
<content>File content</content>
</writeFile>
Text after`;
    const expected = "Text before\n\nText after";
    expect(cleanMessageForCopy(input)).toBe(expected);
  });

  it("should remove tool call markers", () => {
    const input =
      "Before\n<!--TOOL_CALL_START:123:localSearch:Local Search:🔍::true-->Searching...<!--TOOL_CALL_END:123:Found 5 results-->\nAfter";
    const expected = "Before\n\nAfter";
    expect(cleanMessageForCopy(input)).toBe(expected);
  });

  it("should handle multiple blocks in one message", () => {
    const input = `Start of message
<think>First thought</think>
Middle part
<writeFile><path>file.md</path><content>content</content></writeFile>
<!--TOOL_CALL_START:456:webSearch:Web Search:🌐::false-->Searching web<!--TOOL_CALL_END:456:Results-->
End of message`;
    const expected = "Start of message\n\nMiddle part\n\nEnd of message";
    expect(cleanMessageForCopy(input)).toBe(expected);
  });

  it("should clean up multiple consecutive newlines", () => {
    const input = `Text\n\n\n\n\nMore text`;
    const expected = "Text\n\nMore text";
    expect(cleanMessageForCopy(input)).toBe(expected);
  });

  it("should preserve normal content", () => {
    const input = `# Heading
This is a normal message with:
- Bullet points
- Code blocks: \`const x = 1;\`
- **Bold** and *italic* text

\`\`\`javascript
function test() {
  return true;
}
\`\`\`

More content here.`;
    expect(cleanMessageForCopy(input)).toBe(input);
  });

  it("should handle nested think blocks", () => {
    const input =
      "Before\n<think>Outer thought <think>Inner thought</think> back to outer</think>\nAfter";
    const expected = "Before\n back to outer\nAfter";
    expect(cleanMessageForCopy(input)).toBe(expected);
  });

  it("should handle multiline content in blocks", () => {
    const input = `Start
<think>
Line 1 of thought
Line 2 of thought
Line 3 of thought
</think>
End`;
    const expected = "Start\n\nEnd";
    expect(cleanMessageForCopy(input)).toBe(expected);
  });

  it("should trim leading and trailing whitespace", () => {
    const input = "\n\n  Content with spaces  \n\n";
    const expected = "Content with spaces";
    expect(cleanMessageForCopy(input)).toBe(expected);
  });

  it("should handle empty message", () => {
    expect(cleanMessageForCopy("")).toBe("");
  });

  it("should handle message with only blocks to remove", () => {
    const input = "<think>Only a thought</think>";
    const expected = "";
    expect(cleanMessageForCopy(input)).toBe(expected);
  });

  it("should remove shared reasoning markers", () => {
    const input = `${serializeReasoningPayload({
      source: "agent",
      status: "complete",
      elapsedSeconds: 12,
      items: [
        { id: "step-0", kind: "step", summary: "Searching notes" },
        { id: "step-1", kind: "step", summary: "Read 3 notes" },
        { id: "step-2", kind: "step", summary: "Analyzing content" },
      ],
    })}Here is my response based on the analysis.`;
    const expected = "Here is my response based on the analysis.";
    expect(cleanMessageForCopy(input)).toBe(expected);
  });

  it("should remove shared reasoning markers when they prefix the visible answer", () => {
    const input = `${serializeReasoningPayload({
      source: "agent",
      status: "collapsed",
      elapsedSeconds: 5,
      items: [{ id: "step-0", kind: "step", summary: "Searching notes" }],
    })}
Here is the actual response.`;
    const expected = "Here is the actual response.";
    expect(cleanMessageForCopy(input)).toBe(expected);
  });

  it("should handle shared reasoning markers whose detail contains -->", () => {
    const input = `${serializeReasoningPayload({
      source: "agent",
      status: "complete",
      elapsedSeconds: 8,
      items: [
        { id: "step-0", kind: "step", summary: "Step with arrow", detail: "Step with --> inside" },
      ],
    })}Actual response.`;
    const expected = "Actual response.";
    expect(cleanMessageForCopy(input)).toBe(expected);
  });
});
