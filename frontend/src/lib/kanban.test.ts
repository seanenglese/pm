import {
  NO_FILTERS,
  boardLabels,
  cardMatches,
  createId,
  dueStatus,
  hasFilters,
  initialData,
  formatDueDate,
  moveCard,
  moveColumn,
  parseLabels,
  removeColumn,
  todayIso,
  type BoardData,
  type Card,
  type CardFilters,
  type Column,
} from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("moves a card to the end when dropped on its own column", () => {
    const result = moveCard(baseColumns, "card-1", "col-a");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("leaves the board unchanged for unknown ids", () => {
    expect(moveCard(baseColumns, "missing", "card-1")).toBe(baseColumns);
    expect(moveCard(baseColumns, "card-1", "missing")).toBe(baseColumns);
  });

  it("leaves the board unchanged when a card is dropped on itself", () => {
    expect(moveCard(baseColumns, "card-1", "card-1")).toBe(baseColumns);
  });
});

describe("createId", () => {
  it("uses the prefix and does not repeat", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createId("card")));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(/^card-[a-z0-9]+$/);
    }
  });
});

describe("parseLabels", () => {
  it("trims, drops empties, and removes duplicates", () => {
    expect(parseLabels(" design, ,qa,design ,")).toEqual(["design", "qa"]);
  });

  it("returns no labels for blank input", () => {
    expect(parseLabels("   ")).toEqual([]);
  });

  it("keeps within the server's limits", () => {
    const many = Array.from({ length: 12 }, (_, index) => `l${index}`).join(",");
    expect(parseLabels(many)).toHaveLength(10);
    expect(parseLabels("x".repeat(40))).toEqual(["x".repeat(30)]);
  });
});

describe("due dates", () => {
  it("formats today's local date as YYYY-MM-DD", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("classifies a due date against today", () => {
    expect(dueStatus(null, "2026-10-03")).toBeNull();
    expect(dueStatus("2026-10-02", "2026-10-03")).toBe("overdue");
    expect(dueStatus("2026-10-03", "2026-10-03")).toBe("today");
    expect(dueStatus("2026-10-04", "2026-10-03")).toBe("upcoming");
    expect(dueStatus("2025-12-31", "2026-01-01")).toBe("overdue");
  });

  it("formats a due date for display without shifting the day", () => {
    expect(formatDueDate("2026-11-05")).toBe("Nov 5, 2026");
  });
});

describe("moveColumn", () => {
  const columns: Column[] = [
    { id: "col-a", title: "A", cardIds: [] },
    { id: "col-b", title: "B", cardIds: [] },
    { id: "col-c", title: "C", cardIds: [] },
  ];
  const order = (result: Column[]) => result.map((column) => column.id);

  it("moves a column left or right", () => {
    expect(order(moveColumn(columns, "col-b", -1))).toEqual(["col-b", "col-a", "col-c"]);
    expect(order(moveColumn(columns, "col-b", 1))).toEqual(["col-a", "col-c", "col-b"]);
  });

  it("does nothing past either end or for an unknown column", () => {
    expect(moveColumn(columns, "col-a", -1)).toBe(columns);
    expect(moveColumn(columns, "col-c", 1)).toBe(columns);
    expect(moveColumn(columns, "missing", 1)).toBe(columns);
  });
});

describe("removeColumn", () => {
  const card = (id: string) => ({
    id,
    title: id,
    details: "",
    priority: null,
    dueDate: null,
    labels: [],
  });
  const board: BoardData = {
    columns: [
      { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
      { id: "col-b", title: "B", cardIds: ["card-3"] },
    ],
    cards: { "card-1": card("card-1"), "card-2": card("card-2"), "card-3": card("card-3") },
  };

  it("removes the column and only its cards", () => {
    const result = removeColumn(board, "col-a");

    expect(result.columns.map((column) => column.id)).toEqual(["col-b"]);
    expect(Object.keys(result.cards)).toEqual(["card-3"]);
  });

  it("ignores an unknown column", () => {
    expect(removeColumn(board, "missing")).toBe(board);
  });
});

describe("cardMatches", () => {
  const TODAY = "2026-10-04";
  const make = (fields: Partial<Card>): Card => ({
    id: "card-x",
    title: "Write launch post",
    details: "Draft for the blog",
    priority: null,
    dueDate: null,
    labels: [],
    ...fields,
  });
  const matches = (card: Card, filters: Partial<CardFilters>) =>
    cardMatches(card, { ...NO_FILTERS, ...filters }, TODAY);

  it("matches everything with no filters", () => {
    expect(matches(make({}), {})).toBe(true);
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, query: "   " })).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, due: "none" })).toBe(true);
  });

  it("searches title, details, and labels, ignoring case and spaces", () => {
    const card = make({ labels: ["Marketing"] });
    expect(matches(card, { query: " LAUNCH " })).toBe(true);
    expect(matches(card, { query: "blog" })).toBe(true);
    expect(matches(card, { query: "market" })).toBe(true);
    expect(matches(card, { query: "invoice" })).toBe(false);
  });

  it("filters by priority, including cards without one", () => {
    expect(matches(make({ priority: "high" }), { priority: "high" })).toBe(true);
    expect(matches(make({ priority: "low" }), { priority: "high" })).toBe(false);
    expect(matches(make({}), { priority: "none" })).toBe(true);
    expect(matches(make({ priority: "low" }), { priority: "none" })).toBe(false);
  });

  it("filters by label", () => {
    expect(matches(make({ labels: ["qa", "ops"] }), { label: "ops" })).toBe(true);
    expect(matches(make({ labels: ["qa"] }), { label: "ops" })).toBe(false);
  });

  it.each([
    ["overdue", "2026-10-03", true],
    ["overdue", "2026-10-04", false],
    ["today", "2026-10-04", true],
    ["today", "2026-10-05", false],
    ["week", "2026-10-04", true],
    ["week", "2026-10-10", true],
    ["week", "2026-10-11", false],
    ["week", "2026-10-01", false],
    ["week", null, false],
    ["none", null, true],
    ["none", "2026-10-04", false],
  ] as const)("due filter %s with due date %s matches: %s", (due, dueDate, expected) => {
    expect(matches(make({ dueDate }), { due })).toBe(expected);
  });

  it("handles a week that crosses a month boundary", () => {
    expect(cardMatches(make({ dueDate: "2026-11-05" }), { ...NO_FILTERS, due: "week" }, "2026-10-30")).toBe(true);
  });

  it("requires every active filter to match", () => {
    const card = make({ priority: "high", labels: ["ops"], dueDate: "2026-10-04" });
    expect(matches(card, { query: "launch", priority: "high", label: "ops", due: "today" })).toBe(true);
    expect(matches(card, { query: "launch", priority: "low", label: "ops", due: "today" })).toBe(false);
  });
});

describe("boardLabels", () => {
  it("lists each label once, sorted", () => {
    expect(boardLabels(initialData)).toEqual([
      "content",
      "design",
      "marketing",
      "planning",
      "qa",
      "research",
    ]);
  });
});
