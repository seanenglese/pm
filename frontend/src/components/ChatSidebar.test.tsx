import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";

describe("ChatSidebar", () => {
  it("shows a prompt when there is no history yet", () => {
    render(
      <ChatSidebar history={[]} isLoading={false} error={null} onSend={vi.fn()} />
    );

    expect(screen.getByText(/ask a question about your board/i)).toBeInTheDocument();
  });

  it("renders prior messages by role", () => {
    render(
      <ChatSidebar
        history={[
          { role: "user", content: "Add a card" },
          { role: "assistant", content: "Done!" },
        ]}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
      />
    );

    const messages = screen.getAllByTestId("chat-message");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toHaveAttribute("data-role", "user");
    expect(messages[1]).toHaveAttribute("data-role", "assistant");
  });

  it("sends a trimmed message and clears the input", async () => {
    const onSend = vi.fn();
    render(
      <ChatSidebar history={[]} isLoading={false} error={null} onSend={onSend} />
    );

    const input = screen.getByLabelText("Chat message");
    await userEvent.type(input, "  How many cards?  ");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith("How many cards?");
    expect(input).toHaveValue("");
  });

  it("does not send an empty or whitespace-only message", async () => {
    const onSend = vi.fn();
    render(
      <ChatSidebar history={[]} isLoading={false} error={null} onSend={onSend} />
    );

    await userEvent.type(screen.getByLabelText("Chat message"), "   ");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables input and shows a thinking indicator while loading", () => {
    render(
      <ChatSidebar history={[]} isLoading={true} error={null} onSend={vi.fn()} />
    );

    expect(screen.getByLabelText("Chat message")).toBeDisabled();
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it("shows an error message when provided", () => {
    render(
      <ChatSidebar
        history={[]}
        isLoading={false}
        error="Could not reach the assistant. Try again."
        onSend={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/could not reach the assistant/i);
  });
});
