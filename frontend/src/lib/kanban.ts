export type Priority = "low" | "medium" | "high";

export type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority | null;
  /** ISO date, YYYY-MM-DD. */
  dueDate: string | null;
  labels: string[];
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

export const initialData: BoardData = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    {
      id: "col-progress",
      title: "In Progress",
      cardIds: ["card-4", "card-5"],
    },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
      priority: "high",
      dueDate: null,
      labels: ["planning"],
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags, sales notes, and churn feedback.",
      priority: "medium",
      dueDate: null,
      labels: ["research"],
    },
    "card-3": {
      id: "card-3",
      title: "Prototype analytics view",
      details: "Sketch initial dashboard layout and key drill-downs.",
      priority: "medium",
      dueDate: null,
      labels: ["design"],
    },
    "card-4": {
      id: "card-4",
      title: "Refine status language",
      details: "Standardize column labels and tone across the board.",
      priority: "low",
      dueDate: null,
      labels: ["content"],
    },
    "card-5": {
      id: "card-5",
      title: "Design card layout",
      details: "Add hierarchy and spacing for scanning dense lists.",
      priority: "high",
      dueDate: null,
      labels: ["design"],
    },
    "card-6": {
      id: "card-6",
      title: "QA micro-interactions",
      details: "Verify hover, focus, and loading states.",
      priority: "medium",
      dueDate: null,
      labels: ["qa"],
    },
    "card-7": {
      id: "card-7",
      title: "Ship marketing page",
      details: "Final copy approved and asset pack delivered.",
      priority: null,
      dueDate: null,
      labels: ["marketing"],
    },
    "card-8": {
      id: "card-8",
      title: "Close onboarding sprint",
      details: "Document release notes and share internally.",
      priority: "low",
      dueDate: null,
      labels: [],
    },
  },
};

const findColumn = (columns: Column[], id: string) =>
  columns.find((column) => column.id === id) ??
  columns.find((column) => column.cardIds.includes(id));

/** Moves a card onto another card (taking its place) or onto a column (to its end). */
export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumn = findColumn(columns, activeId);
  const overColumn = findColumn(columns, overId);
  if (
    !activeColumn ||
    !overColumn ||
    !activeColumn.cardIds.includes(activeId) ||
    activeId === overId
  ) {
    return columns;
  }

  const withoutActive = (cardIds: string[]) => cardIds.filter((id) => id !== activeId);
  const nextOverCardIds = withoutActive(overColumn.cardIds);
  const insertIndex =
    overColumn.id === overId ? nextOverCardIds.length : overColumn.cardIds.indexOf(overId);
  nextOverCardIds.splice(insertIndex, 0, activeId);

  return columns.map((column) => {
    if (column.id === overColumn.id) {
      return { ...column, cardIds: nextOverCardIds };
    }
    if (column.id === activeColumn.id) {
      return { ...column, cardIds: withoutActive(column.cardIds) };
    }
    return column;
  });
};

export const createId = (prefix: string) => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}-${randomPart}${timePart}`;
};

export const PRIORITIES: Priority[] = ["high", "medium", "low"];

export const MAX_LABELS = 10;
const MAX_LABEL_LENGTH = 30;

/** Splits "a, b, a" into unique, trimmed labels, within the server's limits. */
export const parseLabels = (text: string): string[] =>
  [
    ...new Set(
      text
        .split(",")
        .map((label) => label.trim().slice(0, MAX_LABEL_LENGTH))
        .filter(Boolean)
    ),
  ].slice(0, MAX_LABELS);

/** Today's date in the user's time zone, as YYYY-MM-DD. */
export const todayIso = (now = new Date()) => {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

type DueStatus = "overdue" | "today" | "upcoming";

// ISO dates compare correctly as strings.
export const dueStatus = (dueDate: string | null, today: string): DueStatus | null => {
  if (!dueDate) {
    return null;
  }
  if (dueDate < today) {
    return "overdue";
  }
  return dueDate === today ? "today" : "upcoming";
};

export const formatDueDate = (dueDate: string) => {
  const [year, month, day] = dueDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

/** Swaps a column with its neighbour; a move past either end changes nothing. */
export const moveColumn = (
  columns: Column[],
  columnId: string,
  direction: -1 | 1
): Column[] => {
  const index = columns.findIndex((column) => column.id === columnId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= columns.length) {
    return columns;
  }
  const next = [...columns];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

/** Removes a column together with the cards in it. */
export const removeColumn = (board: BoardData, columnId: string): BoardData => {
  const column = board.columns.find((candidate) => candidate.id === columnId);
  if (!column) {
    return board;
  }
  return {
    columns: board.columns.filter((candidate) => candidate.id !== columnId),
    cards: Object.fromEntries(
      Object.entries(board.cards).filter(([id]) => !column.cardIds.includes(id))
    ),
  };
};

export type DueFilter = "" | "overdue" | "today" | "week" | "none";

export type CardFilters = {
  query: string;
  /** "" means any priority, "none" means cards without one. */
  priority: Priority | "" | "none";
  /** "" means any label. */
  label: string;
  due: DueFilter;
};

export const NO_FILTERS: CardFilters = { query: "", priority: "", label: "", due: "" };

export const hasFilters = (filters: CardFilters) =>
  Boolean(filters.query.trim() || filters.priority || filters.label || filters.due);

const addDays = (isoDate: string, days: number) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return todayIso(new Date(year, month - 1, day + days));
};

const matchesDue = (dueDate: string | null, due: DueFilter, today: string) => {
  const status = dueStatus(dueDate, today);
  switch (due) {
    case "":
      return true;
    case "none":
      return status === null;
    case "week":
      // Today through the next six days.
      return status !== null && status !== "overdue" && dueDate! <= addDays(today, 6);
    default:
      return status === due;
  }
};

export const cardMatches = (card: Card, filters: CardFilters, today: string) => {
  const query = filters.query.trim().toLowerCase();
  if (
    query &&
    ![card.title, card.details, ...card.labels].some((text) => text.toLowerCase().includes(query))
  ) {
    return false;
  }
  if (filters.priority && (card.priority ?? "none") !== filters.priority) {
    return false;
  }
  if (filters.label && !card.labels.includes(filters.label)) {
    return false;
  }
  return matchesDue(card.dueDate, filters.due, today);
};

/** Every label used on the board, sorted, for the label filter. */
export const boardLabels = (board: BoardData) =>
  [...new Set(Object.values(board.cards).flatMap((card) => card.labels))].sort((a, b) =>
    a.localeCompare(b)
  );
