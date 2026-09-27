import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import Home from "@/app/page";
import { initialData, type BoardData } from "@/lib/kanban";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

type ChatHandler = (
  message: string,
  history: unknown[],
  board: BoardData
) => { reply: string; board?: BoardData };

/**
 * Fakes the `/api/users/:username/board` GET/PUT contract and the
 * `/api/users/:username/chat` POST contract with an in-memory store.
 */
const mockBoardApi = (seed: BoardData = initialData, chatHandler?: ChatHandler) => {
  let storedBoard = seed;

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/chat")) {
      const { message, history } = JSON.parse(init?.body as string);
      const result = chatHandler
        ? chatHandler(message, history, storedBoard)
        : { reply: `Echo: ${message}` };
      if (result.board) {
        storedBoard = result.board;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ reply: result.reply, board: storedBoard }),
      } as Response;
    }

    if (init?.method === "PUT") {
      storedBoard = JSON.parse(init.body as string) as BoardData;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ username: "user", board: storedBoard }),
    } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

/** Makes matching requests wait until the returned `release` is called. */
const holdRequests = (
  fetchMock: ReturnType<typeof mockBoardApi>,
  shouldHold: (url: string, init?: RequestInit) => boolean
) => {
  const realImpl = fetchMock.getMockImplementation()!;
  const pending: Array<() => void> = [];
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (shouldHold(url, init)) {
      await new Promise<void>((resolve) => pending.push(resolve));
    }
    return realImpl(url, init);
  });
  return { release: () => pending.shift()?.() };
};

const putBodies = (fetchMock: ReturnType<typeof mockBoardApi>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === "PUT")
    .map(([, init]) => JSON.parse(init!.body as string) as BoardData);

const chatCallCount = (fetchMock: ReturnType<typeof mockBoardApi>) =>
  fetchMock.mock.calls.filter(([url]) => url.includes("/chat")).length;

const mockFailingBoardApi = () => {
  const fetchMock = vi.fn(
    async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KanbanBoard", () => {
  it("shows a loading state before the board arrives", async () => {
    mockBoardApi();
    render(<KanbanBoard username="user" />);
    expect(screen.getByText(/loading your board/i)).toBeInTheDocument();
    await waitFor(() => expect(getFirstColumn()).toBeInTheDocument());
  });

  it("renders five columns once loaded", async () => {
    mockBoardApi();
    render(<KanbanBoard username="user" />);
    await waitFor(() =>
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5)
    );
  });

  it("shows a retry option when the initial load fails", async () => {
    mockFailingBoardApi();
    render(<KanbanBoard username="user" />);
    await waitFor(() =>
      expect(screen.getByText(/could not load your board/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renames a column and persists it through the API", async () => {
    const fetchMock = mockBoardApi();
    render(<KanbanBoard username="user" />);
    await waitFor(() => expect(getFirstColumn()).toBeInTheDocument());

    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "PUT"
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const lastCall = putCalls[putCalls.length - 1];
      const body = JSON.parse((lastCall[1] as RequestInit).body as string);
      expect(body.columns[0].title).toBe("New Name");
    });
  });

  it("adds and removes a card, persisting each change", async () => {
    const fetchMock = mockBoardApi();
    render(<KanbanBoard username="user" />);
    await waitFor(() => expect(getFirstColumn()).toBeInTheDocument());

    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "PUT"
      );
      expect(putCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("sends one save at a time and finishes with the newest board", async () => {
    const fetchMock = mockBoardApi();
    render(<KanbanBoard username="user" />);
    await waitFor(() => expect(getFirstColumn()).toBeInTheDocument());
    const puts = holdRequests(fetchMock, (_url, init) => init?.method === "PUT");

    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Abc");

    // Only the first save is in flight; the later keystrokes wait behind it.
    expect(putBodies(fetchMock)).toHaveLength(1);

    puts.release();
    await waitFor(() => expect(putBodies(fetchMock)).toHaveLength(2));
    expect(putBodies(fetchMock)[1].columns[0].title).toBe("Abc");
    puts.release();
  });

  it("reloads the previously saved board after a refresh", async () => {
    mockBoardApi();
    const { unmount } = render(<KanbanBoard username="user" />);
    await waitFor(() => expect(getFirstColumn()).toBeInTheDocument());

    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed Column");

    await waitFor(() =>
      expect(
        within(getFirstColumn()).getByLabelText("Column title")
      ).toHaveValue("Renamed Column")
    );

    unmount();
    render(<KanbanBoard username="user" />);

    await waitFor(() =>
      expect(
        within(getFirstColumn()).getByLabelText("Column title")
      ).toHaveValue("Renamed Column")
    );
  });
});

describe("KanbanBoard chat sidebar", () => {
  it("sends a message and displays the assistant's reply", async () => {
    mockBoardApi(initialData, (message) => ({
      reply: `You said: ${message}`,
    }));
    render(<KanbanBoard username="user" />);
    await waitFor(() => expect(getFirstColumn()).toBeInTheDocument());

    await userEvent.type(
      screen.getByLabelText("Chat message"),
      "How many cards are there?"
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      screen.getByText("How many cards are there?")
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("You said: How many cards are there?")
      ).toBeInTheDocument()
    );
  });

  it("applies a board update returned by the assistant automatically", async () => {
    mockBoardApi(initialData, (_message, _history, board) => ({
      reply: "Renamed the first column for you.",
      board: {
        ...board,
        columns: board.columns.map((column, index) =>
          index === 0 ? { ...column, title: "Renamed by AI" } : column
        ),
      },
    }));
    render(<KanbanBoard username="user" />);
    await waitFor(() => expect(getFirstColumn()).toBeInTheDocument());

    await userEvent.type(
      screen.getByLabelText("Chat message"),
      "Rename the first column"
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(
        within(getFirstColumn()).getByLabelText("Column title")
      ).toHaveValue("Renamed by AI")
    );
  });

  it("waits for pending saves and locks the board while the assistant works", async () => {
    const fetchMock = mockBoardApi(initialData, (message) => ({
      reply: `You said: ${message}`,
    }));
    render(<KanbanBoard username="user" />);
    await waitFor(() => expect(getFirstColumn()).toBeInTheDocument());
    const held = holdRequests(
      fetchMock,
      (url, init) => init?.method === "PUT" || url.includes("/chat")
    );

    await userEvent.click(
      screen.getByRole("button", { name: /delete align roadmap themes/i })
    );
    await userEvent.type(screen.getByLabelText("Chat message"), "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    const titleInput = within(getFirstColumn()).getByLabelText("Column title");
    expect(screen.getByRole("group", { name: "Board" })).toBeDisabled();
    expect(titleInput).toBeDisabled();
    expect(chatCallCount(fetchMock)).toBe(0);

    held.release(); // the delete's save lands, then the chat request goes out
    await waitFor(() => expect(chatCallCount(fetchMock)).toBe(1));

    held.release(); // the assistant replies
    await waitFor(() =>
      expect(screen.getByText("You said: hello")).toBeInTheDocument()
    );
    expect(titleInput).toBeEnabled();
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("shows an error when the assistant call fails", async () => {
    mockBoardApi();
    render(<KanbanBoard username="user" />);
    await waitFor(() => expect(getFirstColumn()).toBeInTheDocument());

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }) as Response)
    );

    await userEvent.type(screen.getByLabelText("Chat message"), "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /could not reach the assistant/i
      )
    );
  });
});

describe("Home auth flow", () => {
  it("requires login before showing the Kanban board", async () => {
    mockBoardApi();
    render(<Home />);

    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/single board kanban/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText(/single board kanban/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("rejects invalid credentials and allows logout", async () => {
    mockBoardApi();
    render(<Home />);

    await userEvent.type(screen.getByLabelText(/username/i), "wrong");
    await userEvent.type(screen.getByLabelText(/password/i), "pass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/username/i));
    await userEvent.clear(screen.getByLabelText(/password/i));
    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/single board kanban/i)).not.toBeInTheDocument();
  });
});
