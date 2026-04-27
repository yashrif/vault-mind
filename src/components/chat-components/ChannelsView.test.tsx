import React from "react";
import { render, screen } from "@testing-library/react";
import { ChannelsView } from "@/components/chat-components/ChannelsView";

jest.mock("@/components/chat-components/TelegramChannelView", () => ({
  TelegramChannelView: () => <div data-testid="telegram-channel-view" />,
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, className, ...props }: any) => (
    <button type="button" className={className} {...props}>
      {children}
    </button>
  ),
}));

jest.mock("@/lib/utils", () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(" "),
}));

jest.mock("lucide-react", () => ({
  Send: () => <span data-testid="send-icon" />,
}));

/** Render the channels view with the minimal dependencies needed for layout tests. */
function renderChannelsView() {
  return render(
    <ChannelsView
      telegramStore={undefined}
      telegramChatHistory={[]}
      telegramReplyState={null}
      telegramPrimaryChatId={null}
      telegramAllowlistConfigured={false}
      app={{} as any}
    />
  );
}

describe("ChannelsView", () => {
  it("uses a compact top channel selector instead of a fixed-width side rail", () => {
    renderChannelsView();

    const telegramButton = screen.getByRole("button", { name: /telegram/i });
    const selector = telegramButton.parentElement;

    expect(selector?.className).not.toContain("tw-flex-col");
    expect(selector?.className).toContain("tw-overflow-x-auto");
    expect(selector?.className).not.toContain("tw-w-32");
    expect(telegramButton.className).not.toContain("tw-w-full");
  });
});
