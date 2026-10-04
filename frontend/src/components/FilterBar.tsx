import {
  NO_FILTERS,
  PRIORITIES,
  hasFilters,
  type CardFilters,
  type DueFilter,
  type Priority,
} from "@/lib/kanban";

type FilterBarProps = {
  filters: CardFilters;
  labels: string[];
  shown: number;
  total: number;
  onChange: (filters: CardFilters) => void;
};

const controlClass =
  "rounded-full border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

export const FilterBar = ({ filters, labels, shown, total, onChange }: FilterBarProps) => {
  const update = (changes: Partial<CardFilters>) => onChange({ ...filters, ...changes });
  const active = hasFilters(filters);
  // Keep the chosen label selectable even after the last card using it changes.
  const labelOptions =
    filters.label && !labels.includes(filters.label) ? [...labels, filters.label] : labels;

  return (
    <div role="search" className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={filters.query}
        onChange={(event) => update({ query: event.target.value })}
        placeholder="Search cards"
        aria-label="Search cards"
        className={`${controlClass} w-56`}
      />
      <select
        value={filters.priority}
        onChange={(event) => update({ priority: event.target.value as Priority | "" | "none" })}
        aria-label="Filter by priority"
        className={controlClass}
      >
        <option value="">Any priority</option>
        {PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {capitalize(priority)}
          </option>
        ))}
        <option value="none">No priority</option>
      </select>
      <select
        value={filters.label}
        onChange={(event) => update({ label: event.target.value })}
        aria-label="Filter by label"
        className={controlClass}
      >
        <option value="">Any label</option>
        {labelOptions.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>
      <select
        value={filters.due}
        onChange={(event) => update({ due: event.target.value as DueFilter })}
        aria-label="Filter by due date"
        className={controlClass}
      >
        <option value="">Any due date</option>
        <option value="overdue">Overdue</option>
        <option value="today">Due today</option>
        <option value="week">Due in the next 7 days</option>
        <option value="none">No due date</option>
      </select>
      {active ? (
        <>
          <span className="text-sm text-[var(--gray-text)]" aria-live="polite">
            Showing {shown} of {total} {total === 1 ? "card" : "cards"}
          </span>
          <button
            type="button"
            onClick={() => onChange(NO_FILTERS)}
            className="rounded-full px-3 py-2 text-sm font-semibold text-[var(--primary-blue)] hover:underline"
          >
            Clear filters
          </button>
        </>
      ) : null}
    </div>
  );
};
