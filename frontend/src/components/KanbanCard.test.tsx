import { render, screen } from "@testing-library/react";
import { CardMeta } from "@/components/KanbanCard";
import type { Card } from "@/lib/kanban";

const card = (fields: Partial<Card>): Card => ({
  id: "card-1",
  title: "Card",
  details: "",
  priority: null,
  dueDate: null,
  labels: [],
  ...fields,
});

describe("CardMeta", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing for a card without metadata", () => {
    const { container } = render(<CardMeta card={card({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows priority and labels", () => {
    render(<CardMeta card={card({ priority: "high", labels: ["design", "qa"] })} />);

    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("design")).toBeInTheDocument();
    expect(screen.getByText("qa")).toBeInTheDocument();
  });

  it.each([
    ["2026-10-02", "Overdue Oct 2, 2026"],
    ["2026-10-03", "Due today"],
    ["2026-10-20", "Due Oct 20, 2026"],
  ])("describes a card due %s as %s", (dueDate, text) => {
    render(<CardMeta card={card({ dueDate })} />);

    expect(screen.getByTestId("due-date")).toHaveTextContent(text);
  });
});
