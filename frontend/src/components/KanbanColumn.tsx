import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onEditCard: (cardId: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onMove: (columnId: string, direction: -1 | 1) => void;
  onDelete: (columnId: string) => void;
  isFirst: boolean;
  isLast: boolean;
};

const controlClass =
  "rounded-full px-2 py-0.5 text-xs font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)] disabled:pointer-events-none disabled:opacity-30";

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onMove,
  onDelete,
  isFirst,
  isLast,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] w-[272px] shrink-0 flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              {cards.length} {cards.length === 1 ? "card" : "cards"}
            </span>
            <div className="ml-auto flex items-center">
              <button
                type="button"
                onClick={() => onMove(column.id, -1)}
                disabled={isFirst}
                aria-label={`Move ${column.title} left`}
                className={controlClass}
              >
                &lsaquo;
              </button>
              <button
                type="button"
                onClick={() => onMove(column.id, 1)}
                disabled={isLast}
                aria-label={`Move ${column.title} right`}
                className={controlClass}
              >
                &rsaquo;
              </button>
              <button
                type="button"
                onClick={() => onDelete(column.id)}
                aria-label={`Delete column ${column.title}`}
                className={clsx(controlClass, "hover:text-red-600")}
              >
                Delete
              </button>
            </div>
          </div>
          <input
            value={column.title}
            onChange={(event) => onRename(column.id, event.target.value)}
            className="mt-3 w-full bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none"
            aria-label="Column title"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onEdit={onEditCard}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};
