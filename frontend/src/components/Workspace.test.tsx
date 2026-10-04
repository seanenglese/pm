import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/Workspace";
import { installFakeApi } from "@/test/fakeApi";

const USER = { id: 1, username: "user", createdAt: "2026-10-01 10:00:00" };

const setup = () => {
  const api = installFakeApi();
  api.signIn();
  const onLogout = vi.fn();
  render(<Workspace user={USER} onLogout={onLogout} />);
  return { api, onLogout };
};

const boardTabs = () => within(screen.getByRole("navigation", { name: "Boards" }));

const activeTab = () =>
  screen
    .getAllByRole("button")
    .find((button) => button.getAttribute("aria-current") === "page");

const createBoard = async (name: string) => {
  await userEvent.click(screen.getByRole("button", { name: "New board" }));
  await userEvent.type(screen.getByLabelText("New board name"), name);
  await userEvent.click(screen.getByRole("button", { name: "Create" }));
};

describe("Workspace", () => {
  it("shows the signed-in user and opens their first board", async () => {
    setup();

    expect(screen.getByText("user")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("My board"));
    expect(activeTab()).toHaveTextContent("My board");
  });

  it("logs out", async () => {
    const { onLogout } = setup();

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("creates a blank board and switches to it", async () => {
    const { api } = setup();
    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("My board"));

    await createBoard("Launch plan");

    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Launch plan"));
    expect(activeTab()).toHaveTextContent("Launch plan");
    expect(screen.getAllByTestId(/column-/)).toHaveLength(2);
    expect(api.boards.map((board) => board.name)).toEqual(["My board", "Launch plan"]);
  });

  it("ignores a blank new board name and can cancel", async () => {
    const { api } = setup();
    await waitFor(() => expect(screen.getByLabelText("Board name")).toBeInTheDocument());

    await createBoard("   ");
    expect(api.calls((url, method) => url === "/api/boards" && method === "POST")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("New board name")).not.toBeInTheDocument();
  });

  it("switches between boards", async () => {
    setup();
    await waitFor(() => expect(screen.getByLabelText("Board name")).toBeInTheDocument());
    await createBoard("Second");
    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Second"));

    await userEvent.click(boardTabs().getByRole("button", { name: "My board" }));

    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("My board"));
    expect(screen.getAllByTestId(/column-/)).toHaveLength(5);
  });

  it("remembers the last opened board", async () => {
    setup();
    await waitFor(() => expect(screen.getByLabelText("Board name")).toBeInTheDocument());
    await createBoard("Second");
    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Second"));

    expect(localStorage.getItem("pm-active-board")).toBe("2");
  });

  it("renames the active board in the tab list", async () => {
    const { api } = setup();
    await waitFor(() => expect(screen.getByLabelText("Board name")).toBeInTheDocument());

    const nameInput = screen.getByLabelText("Board name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Roadmap{Enter}");

    await waitFor(() => expect(activeTab()).toHaveTextContent("Roadmap"));
    expect(api.boards[0].name).toBe("Roadmap");
  });

  it("deletes a board after confirmation and shows the empty state", async () => {
    const { api } = setup();
    await waitFor(() => expect(screen.getByLabelText("Board name")).toBeInTheDocument());
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));

    expect(confirm).toHaveBeenCalledWith('Delete "My board" and all of its cards?');
    await waitFor(() => expect(screen.getByText("No boards yet")).toBeInTheDocument());
    expect(api.boards).toHaveLength(0);
  });

  it("keeps the board when deletion is not confirmed", async () => {
    const { api } = setup();
    await waitFor(() => expect(screen.getByLabelText("Board name")).toBeInTheDocument());
    vi.spyOn(window, "confirm").mockReturnValue(false);

    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));

    expect(api.boards).toHaveLength(1);
    expect(screen.getByLabelText("Board name")).toBeInTheDocument();
  });

  it("shows an error when a board action fails", async () => {
    const { api } = setup();
    await waitFor(() => expect(screen.getByLabelText("Board name")).toBeInTheDocument());
    api.fetchMock.mockImplementation(
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response
    );

    await createBoard("Doomed");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not create the board/i);
  });

  it("offers a retry when the board list cannot load", async () => {
    const api = installFakeApi();
    api.signIn();
    const realImpl = api.fetchMock.getMockImplementation()!;
    api.fetchMock.mockImplementationOnce(
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response
    );
    render(<Workspace user={USER} onLogout={vi.fn()} />);

    await userEvent.click(await screen.findByRole("button", { name: /retry/i }));
    api.fetchMock.mockImplementation(realImpl);

    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("My board"));
  });
});
