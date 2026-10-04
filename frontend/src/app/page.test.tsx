import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import { getToken } from "@/lib/api";
import { installFakeApi } from "@/test/fakeApi";

const fillCredentials = async (username: string, password: string) => {
  await userEvent.type(screen.getByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/password/i), password);
};

const signInHeading = () => screen.findByRole("heading", { name: /sign in/i });

describe("Home auth flow", () => {
  it("requires sign-in before showing the boards", async () => {
    installFakeApi();
    render(<Home />);

    await signInHeading();
    expect(screen.queryByRole("navigation", { name: "Boards" })).not.toBeInTheDocument();

    await fillCredentials("user", "password");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("My board"));
    expect(getToken()).toBe("tok-user");
  });

  it("rejects invalid credentials", async () => {
    installFakeApi();
    render(<Home />);
    await signInHeading();

    await fillCredentials("user", "wrong-pass");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password");
    expect(getToken()).toBeNull();
  });

  it("creates an account and lands on its starter board", async () => {
    const api = installFakeApi();
    render(<Home />);
    await signInHeading();

    await userEvent.click(screen.getByRole("button", { name: /create an account/i }));
    expect(screen.getByRole("heading", { name: /create account/i })).toBeInTheDocument();
    await fillCredentials("newbie", "newbie-password");
    await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));

    await waitFor(() =>
      expect(screen.getByLabelText("Board name")).toHaveValue("My first board")
    );
    expect(screen.getByText("newbie")).toBeInTheDocument();
    expect(api.boards.filter((board) => board.owner === "newbie")).toHaveLength(1);
  });

  it("explains a taken username and the input rules", async () => {
    installFakeApi();
    render(<Home />);
    await signInHeading();
    await userEvent.click(screen.getByRole("button", { name: /create an account/i }));

    await fillCredentials("user", "long-enough");
    await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That username is already taken");

    await userEvent.clear(screen.getByLabelText(/username/i));
    await userEvent.clear(screen.getByLabelText(/password/i));
    await fillCredentials("ab", "short");
    await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/at least 8 characters/i)
    );

    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports an unreachable server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    render(<Home />);
    await signInHeading();

    await fillCredentials("user", "password");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
  });

  it("restores a saved session without asking to sign in again", async () => {
    const api = installFakeApi();
    api.signIn();
    render(<Home />);

    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("My board"));
    expect(screen.queryByRole("heading", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("drops a stale saved session and shows sign-in", async () => {
    installFakeApi();
    localStorage.setItem("pm-session-token", "tok-expired");
    render(<Home />);

    await signInHeading();
    expect(getToken()).toBeNull();
  });

  it("logs out and forgets the session", async () => {
    const api = installFakeApi();
    api.signIn();
    render(<Home />);
    await waitFor(() => expect(screen.getByLabelText("Board name")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    await signInHeading();
    await waitFor(() => expect(getToken()).toBeNull());
    expect(api.calls((url) => url === "/api/auth/logout")).toHaveLength(1);
  });

  it("returns to sign-in when the session expires mid-use", async () => {
    const api = installFakeApi();
    api.signIn();
    render(<Home />);
    await waitFor(() => expect(screen.getByLabelText("Board name")).toBeInTheDocument());

    api.expireSessions();
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "New board" }));
      await userEvent.type(screen.getByLabelText("New board name"), "Late");
      await userEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    await signInHeading();
  });
});

describe("Home account settings", () => {
  it("deletes the account from the Account dialog and returns to sign-in", async () => {
    const api = installFakeApi();
    render(<Home />);
    await signInHeading();
    await userEvent.click(screen.getByRole("button", { name: /create an account/i }));
    await fillCredentials("leaving", "leaving-password");
    await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    await waitFor(() => expect(screen.getByLabelText("Board name")).toBeInTheDocument());
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    await userEvent.type(screen.getByLabelText("Password", { exact: true }), "leaving-password");
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    await signInHeading();
    expect(getToken()).toBeNull();
    expect(api.boards.some((board) => board.owner === "leaving")).toBe(false);

    await fillCredentials("leaving", "leaving-password");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password");
  });
});
