import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSettings } from "@/components/AccountSettings";
import { getToken } from "@/lib/api";
import { installFakeApi } from "@/test/fakeApi";

const USER = { id: 1, username: "user", createdAt: "2026-10-01 10:00:00" };

const setup = () => {
  const api = installFakeApi();
  api.signIn();
  const onClose = vi.fn();
  const onAccountDeleted = vi.fn();
  render(<AccountSettings user={USER} onClose={onClose} onAccountDeleted={onAccountDeleted} />);
  return { api, onClose, onAccountDeleted };
};

const fillPasswords = async (current: string, next: string, confirm = next) => {
  await userEvent.type(screen.getByLabelText("Current password"), current);
  await userEvent.type(screen.getByLabelText("New password"), next);
  await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Change password" }));
};

const passwordCalls = (api: ReturnType<typeof installFakeApi>) =>
  api.calls((url) => url === "/api/auth/password");

describe("AccountSettings: change password", () => {
  it("changes the password and clears the form", async () => {
    const { api } = setup();

    await fillPasswords("password", "brand-new-pass");

    expect(await screen.findByRole("status")).toHaveTextContent(/password changed/i);
    expect(JSON.parse(passwordCalls(api)[0][1]!.body as string)).toEqual({
      currentPassword: "password",
      newPassword: "brand-new-pass",
    });
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("shows the server's message for a wrong current password", async () => {
    setup();

    await fillPasswords("not-it", "brand-new-pass");

    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect");
  });

  it("checks length and confirmation before calling the server", async () => {
    const { api } = setup();

    await fillPasswords("password", "short");
    expect(screen.getByRole("alert")).toHaveTextContent(/at least 8 characters/i);

    await userEvent.clear(screen.getByLabelText("Current password"));
    await userEvent.clear(screen.getByLabelText("New password"));
    await userEvent.clear(screen.getByLabelText("Confirm new password"));
    await fillPasswords("password", "long-enough-1", "long-enough-2");
    expect(screen.getByRole("alert")).toHaveTextContent(/don't match/i);

    expect(passwordCalls(api)).toHaveLength(0);
  });

  it("reports an unexpected failure", async () => {
    const { api } = setup();
    api.fetchMock.mockImplementation(
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response
    );

    await fillPasswords("password", "brand-new-pass");

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });
});

describe("AccountSettings: delete account", () => {
  const deleteWith = async (password: string) => {
    await userEvent.type(screen.getByLabelText("Password", { exact: true }), password);
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));
  };

  it("deletes the account after confirmation", async () => {
    const { api, onAccountDeleted } = setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    await deleteWith("password");

    expect(confirm).toHaveBeenCalledWith(
      'Delete the account "user" and all of its boards? This cannot be undone.'
    );
    await vi.waitFor(() => expect(onAccountDeleted).toHaveBeenCalledOnce());
    expect(api.boards).toHaveLength(0);
    expect(getToken()).toBeNull();
  });

  it("does nothing when the confirmation is declined", async () => {
    const { api, onAccountDeleted } = setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    await deleteWith("password");

    expect(api.calls((url, method) => url === "/api/auth/me" && method === "DELETE")).toHaveLength(0);
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });

  it("keeps the account when the password is wrong", async () => {
    const { api, onAccountDeleted } = setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await deleteWith("wrong-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("Password is incorrect");
    expect(onAccountDeleted).not.toHaveBeenCalled();
    expect(api.boards).toHaveLength(1);
    expect(getToken()).toBe("tok-user");
  });
});

describe("AccountSettings: closing", () => {
  it("closes with the Close button, Escape, or a click outside", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("dialog").parentElement!);
    await userEvent.click(screen.getByRole("dialog"));

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
