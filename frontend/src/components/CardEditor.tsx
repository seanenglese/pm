"use client";

import { useEffect, useState, type FormEvent } from "react";
import { MAX_LABELS, PRIORITIES, parseLabels, type Card, type Priority } from "@/lib/kanban";

type CardEditorProps = {
  card: Card;
  onSave: (card: Card) => void;
  onClose: () => void;
};

const fieldClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]";

export const CardEditor = ({ card, onSave, onClose }: CardEditorProps) => {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [priority, setPriority] = useState<Priority | "">(card.priority ?? "");
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [labels, setLabels] = useState(card.labels.join(", "));

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onSave({
      ...card,
      title: title.trim(),
      details: details.trim(),
      priority: priority || null,
      dueDate: dueDate || null,
      labels: parseLabels(labels),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy-dark)]/40 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-editor-title"
        className="w-full max-w-lg rounded-[28px] border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)]"
      >
        <h2 id="card-editor-title" className="font-display text-xl font-semibold text-[var(--navy-dark)]">
          Edit card
        </h2>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="card-title" className={labelClass}>
              Title
            </label>
            <input
              id="card-title"
              autoFocus
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="card-details" className={labelClass}>
              Details
            </label>
            <textarea
              id="card-details"
              rows={4}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              className={`${fieldClass} resize-none`}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="card-priority" className={labelClass}>
                Priority
              </label>
              <select
                id="card-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority | "")}
                className={fieldClass}
              >
                <option value="">None</option>
                {PRIORITIES.map((option) => (
                  <option key={option} value={option}>
                    {option[0].toUpperCase() + option.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="card-due" className={labelClass}>
                Due date
              </label>
              <input
                id="card-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="card-labels" className={labelClass}>
              Labels
            </label>
            <input
              id="card-labels"
              value={labels}
              onChange={(event) => setLabels(event.target.value)}
              placeholder="design, frontend"
              className={fieldClass}
            />
            <p className="text-xs text-[var(--gray-text)]">
              Separate labels with commas (up to {MAX_LABELS}).
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--stroke)] px-4 py-2 text-sm font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
