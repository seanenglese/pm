import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardEditor } from "@/components/CardEditor";
import type { Card } from "@/lib/kanban";

const CARD: Card = {
  id: "card-1",
  title: "Plan launch",
  details: "Draft the checklist",
  priority: "medium",
  dueDate: "2026-11-05",
  labels: ["ops", "launch"],
};

const renderEditor = (card: Card = CARD) => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<CardEditor card={card} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose };
};

describe("CardEditor", () => {
  it("opens as a dialog filled with the card's current values", () => {
    renderEditor();

    expect(screen.getByRole("dialog", { name: "Edit card" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Plan launch");
    expect(screen.getByLabelText("Title")).toHaveFocus();
    expect(screen.getByLabelText("Details")).toHaveValue("Draft the checklist");
    expect(screen.getByLabelText("Priority")).toHaveValue("medium");
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-11-05");
    expect(screen.getByLabelText("Labels")).toHaveValue("ops, launch");
  });

  it("saves every edited field", async () => {
    const { onSave } = renderEditor();

    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.type(screen.getByLabelText("Title"), "  Ship launch  ");
    await userEvent.clear(screen.getByLabelText("Details"));
    await userEvent.type(screen.getByLabelText("Details"), "Go live");
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "high");
    await userEvent.clear(screen.getByLabelText("Due date"));
    await userEvent.type(screen.getByLabelText("Due date"), "2026-12-24");
    await userEvent.clear(screen.getByLabelText("Labels"));
    await userEvent.type(screen.getByLabelText("Labels"), "release, ops, release");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      id: "card-1",
      title: "Ship launch",
      details: "Go live",
      priority: "high",
      dueDate: "2026-12-24",
      labels: ["release", "ops"],
    });
  });

  it("clears priority, due date, and labels", async () => {
    const { onSave } = renderEditor();

    await userEvent.selectOptions(screen.getByLabelText("Priority"), "None");
    await userEvent.clear(screen.getByLabelText("Due date"));
    await userEvent.clear(screen.getByLabelText("Labels"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ priority: null, dueDate: null, labels: [] })
    );
  });

  it("does not save a blank title", async () => {
    const { onSave } = renderEditor();

    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.type(screen.getByLabelText("Title"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes without saving on Cancel, Escape, or a click outside", async () => {
    const { onSave, onClose } = renderEditor();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("dialog").parentElement!);
    await userEvent.click(screen.getByRole("dialog"));

    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onSave).not.toHaveBeenCalled();
  });
});
