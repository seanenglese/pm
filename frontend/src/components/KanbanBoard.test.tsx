import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";
import { holdRequests, installFakeApi, type ChatHandler, type FakeApi } from "@/test/fakeApi";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

const renderBoard = (props: Partial<Parameters<typeof KanbanBoard>[0]> = {}) => {
  const handlers = { onRenameBoard: vi.fn(), onDeleteBoard: vi.fn() };
  const result = render(
    <KanbanBoard boardId={1} boardName="My board" {...handlers} {...props} />
  );
  return { ...result, ...handlers };
};

const setup = (chat?: ChatHandler) => {
  const api = installFakeApi({ chat });
  api.signIn();
  return api;
};

const putBodies = (api: FakeApi) =>
  api
    .calls((url, method) => url === "/api/boards/1" && method === "PUT")
    .map(([, init]) => JSON.parse(init!.body as string) as BoardData);

const chatCallCount = (api: FakeApi) => api.calls((url) => url.endsWith("/chat")).length;

const waitForBoard = () => waitFor(() => expect(getFirstColumn()).toBeInTheDocument());

describe("KanbanBoard", () => {
  it("shows a loading state before the board arrives", async () => {
    setup();
    renderBoard();
    expect(screen.getByText(/loading your board/i)).toBeInTheDocument();
    await waitForBoard();
  });

  it("renders every column of the board with a summary", async () => {
    setup();
    renderBoard();
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));
    expect(screen.getByText("5 columns, 8 cards")).toBeInTheDocument();
  });

  it("loads the board it was given, sending the session token", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();

    const [url, init] = api.fetchMock.mock.calls[0];
    expect(url).toBe("/api/boards/1");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-user");
  });

  it("shows a retry option when the initial load fails, and recovers", async () => {
    const api = setup();
    const realImpl = api.fetchMock.getMockImplementation()!;
    api.fetchMock.mockImplementationOnce(
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response
    );
    renderBoard();
    await waitFor(() =>
      expect(screen.getByText(/could not load your board/i)).toBeInTheDocument()
    );

    api.fetchMock.mockImplementation(realImpl);
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitForBoard();
  });

  it("renames a column and persists it through the API", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();

    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");

    await waitFor(() => expect(api.boards[0].board.columns[0].title).toBe("New Name"));
  });

  it("adds and removes a card, persisting each change", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();

    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(column).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();
    await waitFor(() =>
      expect(Object.values(api.boards[0].board.cards).map((card) => card.title)).toContain(
        "New card"
      )
    );

    await userEvent.click(within(column).getByRole("button", { name: /delete new card/i }));

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(Object.values(api.boards[0].board.cards).map((card) => card.title)).not.toContain(
        "New card"
      )
    );
  });

  it("shows an error when a save fails", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();
    api.fetchMock.mockImplementation(
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response
    );

    await userEvent.click(
      screen.getByRole("button", { name: /delete align roadmap themes/i })
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not save your changes/i)
    );
  });

  it("sends one save at a time and finishes with the newest board", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();
    const puts = holdRequests(api, (_url, init) => init?.method === "PUT");

    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Abc");

    // Only the first save is in flight; the later keystrokes wait behind it.
    expect(putBodies(api)).toHaveLength(1);

    puts.release();
    await waitFor(() => expect(putBodies(api)).toHaveLength(2));
    expect(putBodies(api)[1].columns[0].title).toBe("Abc");
    puts.release();
  });

  it("reloads the previously saved board after a refresh", async () => {
    setup();
    const { unmount } = renderBoard();
    await waitForBoard();

    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed Column");
    await waitFor(() =>
      expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveValue(
        "Renamed Column"
      )
    );

    unmount();
    renderBoard();

    await waitFor(() =>
      expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveValue(
        "Renamed Column"
      )
    );
  });
});

describe("KanbanBoard header", () => {
  it("renames the board when the name is edited and committed", async () => {
    setup();
    const { onRenameBoard } = renderBoard();
    await waitForBoard();

    const nameInput = screen.getByLabelText("Board name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Roadmap{Enter}");

    expect(onRenameBoard).toHaveBeenCalledExactlyOnceWith("Roadmap");
  });

  it("does not rename when the name is unchanged, and restores a blank name", async () => {
    setup();
    const { onRenameBoard } = renderBoard();
    await waitForBoard();

    const nameInput = screen.getByLabelText("Board name");
    await userEvent.click(nameInput);
    await userEvent.tab();
    await userEvent.clear(nameInput);
    await userEvent.tab();

    expect(onRenameBoard).not.toHaveBeenCalled();
    expect(nameInput).toHaveValue("My board");
  });

  it("asks to delete the board", async () => {
    setup();
    const { onDeleteBoard } = renderBoard();
    await waitForBoard();

    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));

    expect(onDeleteBoard).toHaveBeenCalledOnce();
  });
});

describe("KanbanBoard chat sidebar", () => {
  it("sends a message and displays the assistant's reply", async () => {
    setup((message) => ({ reply: `You said: ${message}` }));
    renderBoard();
    await waitForBoard();

    await userEvent.type(screen.getByLabelText("Chat message"), "How many cards are there?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(screen.getByText("How many cards are there?")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("You said: How many cards are there?")).toBeInTheDocument()
    );
  });

  it("sends earlier conversation turns as history", async () => {
    const histories: unknown[][] = [];
    setup((message, history) => {
      histories.push(history);
      return { reply: `Re: ${message}` };
    });
    renderBoard();
    await waitForBoard();

    await userEvent.type(screen.getByLabelText("Chat message"), "first");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(screen.getByText("Re: first")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Chat message"), "second");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(screen.getByText("Re: second")).toBeInTheDocument());

    expect(histories).toEqual([
      [],
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "Re: first" },
      ],
    ]);
  });

  it("applies a board update returned by the assistant automatically", async () => {
    setup((_message, _history, board) => ({
      reply: "Renamed the first column for you.",
      board: {
        ...board,
        columns: board.columns.map((column, index) =>
          index === 0 ? { ...column, title: "Renamed by AI" } : column
        ),
      },
    }));
    renderBoard();
    await waitForBoard();

    await userEvent.type(screen.getByLabelText("Chat message"), "Rename the first column");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveValue(
        "Renamed by AI"
      )
    );
  });

  it("waits for pending saves and locks the board while the assistant works", async () => {
    const api = setup((message) => ({ reply: `You said: ${message}` }));
    renderBoard();
    await waitForBoard();
    const held = holdRequests(
      api,
      (url, init) => init?.method === "PUT" || url.endsWith("/chat")
    );

    await userEvent.click(
      screen.getByRole("button", { name: /delete align roadmap themes/i })
    );
    await userEvent.type(screen.getByLabelText("Chat message"), "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    const titleInput = within(getFirstColumn()).getByLabelText("Column title");
    expect(screen.getByRole("group", { name: "Board" })).toBeDisabled();
    expect(titleInput).toBeDisabled();
    expect(chatCallCount(api)).toBe(0);

    held.release(); // the delete's save lands, then the chat request goes out
    await waitFor(() => expect(chatCallCount(api)).toBe(1));

    held.release(); // the assistant replies
    await waitFor(() => expect(screen.getByText("You said: hello")).toBeInTheDocument());
    expect(titleInput).toBeEnabled();
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("shows an error when the assistant call fails", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();
    api.fetchMock.mockImplementation(
      async () => ({ ok: false, status: 502, json: async () => ({}) }) as Response
    );

    await userEvent.type(screen.getByLabelText("Chat message"), "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not reach the assistant/i)
    );
  });
});

describe("KanbanBoard card editing", () => {
  it("edits a card's fields and persists them", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();

    await userEvent.click(screen.getByRole("button", { name: "Edit Align roadmap themes" }));
    const dialog = screen.getByRole("dialog", { name: "Edit card" });
    await userEvent.clear(within(dialog).getByLabelText("Title"));
    await userEvent.type(within(dialog).getByLabelText("Title"), "Roadmap v2");
    await userEvent.selectOptions(within(dialog).getByLabelText("Priority"), "low");
    await userEvent.type(within(dialog).getByLabelText("Due date"), "2030-01-15");
    await userEvent.clear(within(dialog).getByLabelText("Labels"));
    await userEvent.type(within(dialog).getByLabelText("Labels"), "strategy, q1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const card = screen.getByTestId("card-card-1");
    expect(within(card).getByText("Roadmap v2")).toBeInTheDocument();
    expect(within(card).getByText("low")).toBeInTheDocument();
    expect(within(card).getByText("Due Jan 15, 2030")).toBeInTheDocument();
    expect(within(card).getByText("strategy")).toBeInTheDocument();

    await waitFor(() =>
      expect(api.boards[0].board.cards["card-1"]).toEqual({
        id: "card-1",
        title: "Roadmap v2",
        details: "Draft quarterly themes with impact statements and metrics.",
        priority: "low",
        dueDate: "2030-01-15",
        labels: ["strategy", "q1"],
      })
    );
  });

  it("discards edits when the editor is cancelled", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();

    await userEvent.click(screen.getByRole("button", { name: "Edit Align roadmap themes" }));
    await userEvent.type(screen.getByLabelText("Title"), " changed");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(api.calls((_url, method) => method === "PUT")).toHaveLength(0);
  });

  it("gives new cards empty metadata", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();

    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "Fresh");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    await waitFor(() => {
      const fresh = Object.values(api.boards[0].board.cards).find((card) => card.title === "Fresh");
      expect(fresh).toMatchObject({ priority: null, dueDate: null, labels: [] });
    });
  });
});

describe("KanbanBoard column management", () => {
  const columnTitles = () =>
    screen.getAllByLabelText("Column title").map((input) => (input as HTMLInputElement).value);
  const savedTitles = (api: FakeApi) => api.boards[0].board.columns.map((column) => column.title);

  it("adds a column at the end and persists it", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();

    await userEvent.click(screen.getByRole("button", { name: "Add column" }));

    expect(columnTitles()).toHaveLength(6);
    expect(columnTitles()[5]).toBe("New column");
    expect(screen.getByText("6 columns, 8 cards")).toBeInTheDocument();
    await waitFor(() => expect(savedTitles(api)[5]).toBe("New column"));
  });

  it("moves columns left and right, disabling the ends", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();

    expect(screen.getByRole("button", { name: "Move Backlog left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Done right" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Move Backlog right" }));
    expect(columnTitles().slice(0, 2)).toEqual(["Discovery", "Backlog"]);

    await userEvent.click(screen.getByRole("button", { name: "Move Done left" }));
    expect(columnTitles().slice(3)).toEqual(["Done", "Review"]);

    await waitFor(() =>
      expect(savedTitles(api)).toEqual(["Discovery", "Backlog", "In Progress", "Done", "Review"])
    );
  });

  it("deletes an empty column without asking", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();
    const confirm = vi.spyOn(window, "confirm");
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));

    await userEvent.click(screen.getByRole("button", { name: "Delete column New column" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(columnTitles()).toHaveLength(5);
    await waitFor(() => expect(savedTitles(api)).toHaveLength(5));
  });

  it("asks before deleting a column with cards, then removes the cards too", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    await userEvent.click(screen.getByRole("button", { name: "Delete column Backlog" }));

    expect(confirm).toHaveBeenCalledWith('Delete "Backlog" and its 2 cards?');
    expect(columnTitles()[0]).toBe("Discovery");
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
    await waitFor(() => expect(Object.keys(api.boards[0].board.cards)).toHaveLength(6));
  });

  it("keeps the column when deletion is not confirmed", async () => {
    const api = setup();
    renderBoard();
    await waitForBoard();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    await userEvent.click(screen.getByRole("button", { name: "Delete column Discovery" }));

    expect(columnTitles()).toHaveLength(5);
    expect(api.calls((_url, method) => method === "PUT")).toHaveLength(0);
  });
});

describe("KanbanBoard assistant panel", () => {
  it("hides and shows the assistant, remembering the choice", async () => {
    setup();
    const { unmount } = renderBoard();
    await waitForBoard();
    expect(screen.getByLabelText("Chat message")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hide assistant" }));
    expect(screen.queryByLabelText("Chat message")).not.toBeInTheDocument();

    unmount();
    renderBoard();
    await waitForBoard();
    expect(screen.queryByLabelText("Chat message")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show assistant" }));
    expect(screen.getByLabelText("Chat message")).toBeInTheDocument();
  });

  it("keeps the conversation when the panel is hidden and shown again", async () => {
    setup((message) => ({ reply: `You said: ${message}` }));
    renderBoard();
    await waitForBoard();
    await userEvent.type(screen.getByLabelText("Chat message"), "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(screen.getByText("You said: hello")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Hide assistant" }));
    await userEvent.click(screen.getByRole("button", { name: "Show assistant" }));

    expect(screen.getByText("You said: hello")).toBeInTheDocument();
  });
});
