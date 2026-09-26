"use client";

import { useState, type FormEvent } from "react";
import clsx from "clsx";
import type { ChatMessage } from "@/lib/api";

type ChatSidebarProps = {
  history: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  onSend: (message: string) => void;
};

export const ChatSidebar = ({
  history,
  isLoading,
  error,
  onSend,
}: ChatSidebarProps) => {
  const [input, setInput] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) {
      return;
    }
    onSend(trimmed);
    setInput("");
  };

  return (
    <aside className="flex w-full flex-col gap-4 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow)] backdrop-blur lg:sticky lg:top-12 lg:h-[calc(100vh-6rem)] lg:w-[340px]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Board Assistant
        </p>
        <h2 className="mt-2 font-display text-xl font-semibold text-[var(--navy-dark)]">
          Ask, or ask me to make changes
        </h2>
      </div>

      <div
        className="flex-1 space-y-3 overflow-y-auto"
        data-testid="chat-history"
      >
        {history.length === 0 ? (
          <p className="text-sm text-[var(--gray-text)]">
            Ask a question about your board, or ask me to add, edit, move, or
            remove cards.
          </p>
        ) : (
          history.map((entry, index) => (
            <div
              key={index}
              data-testid="chat-message"
              data-role={entry.role}
              className={clsx(
                "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
                entry.role === "user"
                  ? "ml-auto bg-[var(--primary-blue)] text-white"
                  : "mr-auto bg-[var(--surface)] text-[var(--navy-dark)]"
              )}
            >
              {entry.content}
            </div>
          ))
        )}
        {isLoading ? (
          <p className="text-sm italic text-[var(--gray-text)]">
            Thinking...
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about your board..."
          aria-label="Chat message"
          className="flex-1 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm outline-none transition focus:border-[var(--primary-blue)]"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
};
