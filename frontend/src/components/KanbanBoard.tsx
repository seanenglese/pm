"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { fetchBoard, saveBoard, sendChatMessage, type ChatMessage } from "@/lib/api";
import { createId, moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  username: string;
};

type LoadStatus = "loading" | "ready" | "error";

export const KanbanBoard = ({ username }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const loadBoard = useCallback(() => {
    fetchBoard(username)
      .then((loaded) => {
        setBoard(loaded);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [username]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const handleRetry = () => {
    setStatus("loading");
    loadBoard();
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  // Saves run one at a time so they can't land out of order. Edits made while
  // a save is in flight collapse into a single follow-up save of the newest board.
  const unsavedBoard = useRef<BoardData | null>(null);
  const activeSave = useRef<Promise<void> | null>(null);

  const queueSave = (next: BoardData) => {
    unsavedBoard.current = next;
    if (activeSave.current) {
      return;
    }
    activeSave.current = (async () => {
      while (unsavedBoard.current) {
        const toSave = unsavedBoard.current;
        unsavedBoard.current = null;
        try {
          await saveBoard(username, toSave);
          setSaveError(null);
        } catch {
          setSaveError("Could not save your changes. Try again.");
        }
      }
      activeSave.current = null;
    })();
  };

  const updateBoard = (updater: (prev: BoardData) => BoardData) => {
    if (!board || isChatLoading) {
      return;
    }
    const next = updater(board);
    setBoard(next);
    queueSave(next);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    updateBoard((prev) => ({
      ...prev,
      columns: moveCard(prev.columns, active.id as string, over.id as string),
    }));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    updateBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    updateBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    updateBoard((prev) => ({
      ...prev,
      cards: Object.fromEntries(
        Object.entries(prev.cards).filter(([id]) => id !== cardId)
      ),
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    }));
  };

  const handleChatSend = async (message: string) => {
    const historyBeforeSend = chatHistory;
    setChatHistory((prev) => [...prev, { role: "user", content: message }]);
    setChatError(null);
    setIsChatLoading(true);

    try {
      // The assistant reads the board from the server, so let pending edits land first.
      await activeSave.current;
      const { reply, board: updatedBoard } = await sendChatMessage(
        username,
        message,
        historyBeforeSend
      );
      setChatHistory((prev) => [...prev, { role: "assistant", content: reply }]);
      setBoard(updatedBoard);
    } catch {
      setChatError("Could not reach the assistant. Try again.");
    } finally {
      setIsChatLoading(false);
    }
  };

  const activeCard = activeCardId ? board?.cards[activeCardId] : null;

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm font-semibold text-[var(--gray-text)]">
          Loading your board...
        </p>
      </main>
    );
  }

  if (status === "error" || !board) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm font-semibold text-[var(--gray-text)]">
          Could not load your board.
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Retry
        </button>
      </main>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
            </div>
          </div>
          {saveError ? (
            <p role="alert" className="text-sm font-medium text-red-600">
              {saveError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <div className="flex flex-col gap-6 lg:flex-row">
          <DndContext
            sensors={isChatLoading ? [] : sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* The board is read-only while the assistant works, so its reply can't overwrite an edit. */}
            <fieldset
              disabled={isChatLoading}
              aria-label="Board"
              className="min-w-0 flex-1 transition disabled:opacity-60"
            >
              <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
                {board.columns.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    cards={column.cardIds.map((cardId) => board.cards[cardId])}
                    onRename={handleRenameColumn}
                    onAddCard={handleAddCard}
                    onDeleteCard={handleDeleteCard}
                  />
                ))}
              </section>
            </fieldset>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <ChatSidebar
            history={chatHistory}
            isLoading={isChatLoading}
            error={chatError}
            onSend={handleChatSend}
          />
        </div>
      </main>
    </div>
  );
};
