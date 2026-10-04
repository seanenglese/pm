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
import { CardEditor } from "@/components/CardEditor";
import { ChatSidebar } from "@/components/ChatSidebar";
import { FilterBar } from "@/components/FilterBar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { fetchBoard, saveBoard, sendChatMessage, type ChatMessage } from "@/lib/api";
import {
  NO_FILTERS,
  boardLabels,
  cardMatches,
  createId,
  hasFilters,
  moveCard,
  moveColumn,
  removeColumn,
  todayIso,
  type BoardData,
  type Card,
} from "@/lib/kanban";

const ASSISTANT_KEY = "pm-assistant";

type KanbanBoardProps = {
  boardId: number;
  boardName: string;
  onRenameBoard: (name: string) => void;
  onDeleteBoard: () => void;
};

type LoadStatus = "loading" | "ready" | "error";

export const KanbanBoard = ({
  boardId,
  boardName,
  onRenameBoard,
  onDeleteBoard,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState(boardName);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [isAssistantOpen, setIsAssistantOpen] = useState(
    () => localStorage.getItem(ASSISTANT_KEY) !== "hidden"
  );

  const toggleAssistant = () => {
    localStorage.setItem(ASSISTANT_KEY, isAssistantOpen ? "hidden" : "shown");
    setIsAssistantOpen(!isAssistantOpen);
  };

  const loadBoard = useCallback(() => {
    fetchBoard(boardId)
      .then((loaded) => {
        setBoard(loaded.board);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [boardId]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const handleRetry = () => {
    setStatus("loading");
    loadBoard();
  };

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(boardName);
    } else if (trimmed !== boardName) {
      onRenameBoard(trimmed);
    }
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
          await saveBoard(boardId, toSave);
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
        [id]: {
          id,
          title,
          details: details || "No details yet.",
          priority: null,
          dueDate: null,
          labels: [],
        },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleUpdateCard = (card: Card) => {
    updateBoard((prev) => ({ ...prev, cards: { ...prev.cards, [card.id]: card } }));
    setEditingCardId(null);
  };

  const handleAddColumn = () => {
    updateBoard((prev) => ({
      ...prev,
      columns: [...prev.columns, { id: createId("col"), title: "New column", cardIds: [] }],
    }));
  };

  const handleMoveColumn = (columnId: string, direction: -1 | 1) => {
    updateBoard((prev) => ({ ...prev, columns: moveColumn(prev.columns, columnId, direction) }));
  };

  const handleDeleteColumn = (columnId: string) => {
    const column = board?.columns.find((candidate) => candidate.id === columnId);
    const count = column?.cardIds.length ?? 0;
    if (
      count > 0 &&
      !window.confirm(
        `Delete "${column?.title}" and its ${count} ${count === 1 ? "card" : "cards"}?`
      )
    ) {
      return;
    }
    updateBoard((prev) => removeColumn(prev, columnId));
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
        boardId,
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
  const editingCard = editingCardId ? board?.cards[editingCardId] : null;

  if (status === "loading") {
    return (
      <main className="flex justify-center py-24">
        <p className="text-sm font-semibold text-[var(--gray-text)]">
          Loading your board...
        </p>
      </main>
    );
  }

  if (status === "error" || !board) {
    return (
      <main className="flex flex-col items-center justify-center gap-4 py-24">
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

  const cardCount = Object.keys(board.cards).length;
  const isFiltered = hasFilters(filters);
  const today = todayIso();
  const visibleCards = (cardIds: string[]) =>
    cardIds
      .map((cardId) => board.cards[cardId])
      .filter((card) => !isFiltered || cardMatches(card, filters, today));
  const shownCount = board.columns.reduce(
    (total, column) => total + visibleCards(column.cardIds).length,
    0
  );

  return (
    <main className="mx-auto flex max-w-[1500px] flex-col gap-6 px-6 pb-16 pt-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            maxLength={80}
            aria-label="Board name"
            className="w-full bg-transparent font-display text-3xl font-semibold text-[var(--navy-dark)] outline-none focus:border-b-2 focus:border-[var(--accent-yellow)]"
          />
          <p className="mt-1 text-sm text-[var(--gray-text)]">
            {board.columns.length} {board.columns.length === 1 ? "column" : "columns"}, {cardCount} {cardCount === 1 ? "card" : "cards"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAssistant}
            aria-pressed={isAssistantOpen}
            className="rounded-full border border-[var(--stroke)] px-4 py-2 text-sm font-semibold text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
          >
            {isAssistantOpen ? "Hide assistant" : "Show assistant"}
          </button>
          <button
            type="button"
            onClick={onDeleteBoard}
            className="rounded-full border border-[var(--stroke)] px-4 py-2 text-sm font-semibold text-[var(--gray-text)] transition hover:border-red-300 hover:text-red-600"
          >
            Delete board
          </button>
        </div>
      </header>
      <FilterBar
        filters={filters}
        labels={boardLabels(board)}
        shown={shownCount}
        total={cardCount}
        onChange={setFilters}
      />
      {saveError ? (
        <p role="alert" className="text-sm font-medium text-red-600">
          {saveError}
        </p>
      ) : null}

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
            <section className="flex gap-4 overflow-x-auto pb-4">
              {board.columns.map((column, index) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={visibleCards(column.cardIds)}
                  isFiltered={isFiltered}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onEditCard={setEditingCardId}
                  onDeleteCard={handleDeleteCard}
                  onMove={handleMoveColumn}
                  onDelete={handleDeleteColumn}
                  isFirst={index === 0}
                  isLast={index === board.columns.length - 1}
                />
              ))}
              <button
                type="button"
                onClick={handleAddColumn}
                className="h-12 w-[200px] shrink-0 rounded-3xl border border-dashed border-[var(--primary-blue)] text-sm font-semibold text-[var(--primary-blue)] transition hover:bg-white"
              >
                Add column
              </button>
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

        {isAssistantOpen ? (
          <ChatSidebar
            history={chatHistory}
            isLoading={isChatLoading}
            error={chatError}
            onSend={handleChatSend}
          />
        ) : null}
      </div>
      {editingCard ? (
        <CardEditor
          card={editingCard}
          onSave={handleUpdateCard}
          onClose={() => setEditingCardId(null)}
        />
      ) : null}
    </main>
  );
};
