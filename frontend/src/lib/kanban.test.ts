import {
  createId,
  dueStatus,
  formatDueDate,
  moveCard,
  parseLabels,
  todayIso,
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
