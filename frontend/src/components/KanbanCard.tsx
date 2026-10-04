import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { dueStatus, formatDueDate, todayIso, type Card, type Priority } from "@/lib/kanban";

const priorityStyles: Record<Priority, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-[#ecad0a]/15 text-[#8a6400]",
  low: "bg-[var(--primary-blue)]/10 text-[#13648a]",
};

const dueText = { overdue: "Overdue", today: "Due today", upcoming: "Due" };

/** Priority, due date, and labels: shown on a card and on its drag preview. */
export const CardMeta = ({ card }: { card: Card }) => {
  const status = dueStatus(card.dueDate, todayIso());
  if (!card.priority && !status && card.labels.length === 0) {
    return null;
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      {card.priority ? (
        <span
          className={clsx("rounded-full px-2 py-0.5 uppercase tracking-wide", priorityStyles[card.priority])}
        >
          {card.priority}
        </span>
      ) : null}
      {status && card.dueDate ? (
        <span
          data-testid="due-date"
          className={clsx(
            "rounded-full px-2 py-0.5",
            status === "overdue" && "bg-red-600 text-white",
            status === "today" && "bg-[var(--accent-yellow)] text-[var(--navy-dark)]",
            status === "upcoming" && "bg-[var(--surface)] text-[var(--navy-dark)]"
          )}
        >
          {status === "today" ? dueText.today : `${dueText[status]} ${formatDueDate(card.dueDate)}`}
        </span>
      ) : null}
      {card.labels.map((label) => (
        <span
          key={label}
          className="rounded-full border border-[var(--secondary-purple)]/30 px-2 py-0.5 text-[var(--secondary-purple)]"
        >
          {label}
        </span>
      ))}
    </div>
  );
};

type KanbanCardProps = {
  card: Card;
  onEdit: (cardId: string) => void;
  onDelete: (cardId: string) => void;
};

export const KanbanCard = ({ card, onEdit, onDelete }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
        {card.title}
      </h4>
      <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">{card.details}</p>
      <CardMeta card={card} />
      <div className="mt-3 flex justify-end gap-1">
        <button
          type="button"
          onClick={() => onEdit(card.id)}
          className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--primary-blue)] transition hover:border-[var(--stroke)]"
          aria-label={`Edit ${card.title}`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(card.id)}
          className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
          aria-label={`Delete ${card.title}`}
        >
          Remove
        </button>
      </div>
    </article>
  );
};
