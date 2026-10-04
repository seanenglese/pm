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

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
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
export const MAX_LABEL_LENGTH = 30;

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

export type DueStatus = "overdue" | "today" | "upcoming";

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
