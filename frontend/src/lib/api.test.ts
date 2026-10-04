import {
  ApiError,
  UNAUTHORIZED_EVENT,
  changePassword,
  createBoard,
  deleteBoard,
  fetchBoard,
  getToken,
  login,
  logout,
  register,
  renameBoard,
  saveBoard,
  sendChatMessage,
} from "@/lib/api";
import { initialData } from "@/lib/kanban";

const respond = (status: number, body?: unknown) =>
  vi.fn<typeof fetch>(
    async () => ({ ok: status < 400, status, json: async () => body }) as Response
  );

const stubFetch = (status: number, body?: unknown) => {
  const fetchMock = respond(status, body);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("api client", () => {
  it("stores the session token on login and sends it afterwards", async () => {
    stubFetch(200, { token: "abc", user: { id: 1, username: "user" } });

    const user = await login("user", "password");

    expect(user.username).toBe("user");
    expect(getToken()).toBe("abc");

    const fetchMock = stubFetch(200, { id: 1, name: "B", board: initialData });
    await fetchBoard(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/1", {
      method: "GET",
      headers: { Authorization: "Bearer abc" },
      body: undefined,
    });
  });

  it("registers through the register endpoint", async () => {
    const fetchMock = stubFetch(201, { token: "new", user: { id: 2, username: "n" } });

    await register("newbie", "password1");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/register");
    expect(getToken()).toBe("new");
  });

  it("sends JSON bodies with the right method for each board call", async () => {
    localStorage.setItem("pm-session-token", "abc");
    const fetchMock = stubFetch(200, {});

    await createBoard("Launch");
    await saveBoard(3, initialData);
    await renameBoard(3, "Renamed");
    await sendChatMessage(3, "hi", [{ role: "user", content: "earlier" }]);
    await changePassword("old-password", "new-password");

    const sent = fetchMock.mock.calls.map(([url, init]) => [
      url,
      init?.method,
      JSON.parse(init?.body as string),
    ]);
    expect(sent).toEqual([
      ["/api/boards", "POST", { name: "Launch" }],
      ["/api/boards/3", "PUT", initialData],
      ["/api/boards/3", "PATCH", { name: "Renamed" }],
      ["/api/boards/3/chat", "POST", { message: "hi", history: [{ role: "user", content: "earlier" }] }],
      ["/api/auth/password", "PUT", { currentPassword: "old-password", newPassword: "new-password" }],
    ]);
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      Authorization: "Bearer abc",
      "Content-Type": "application/json",
    });
  });

  it("treats 204 responses as empty", async () => {
    localStorage.setItem("pm-session-token", "abc");
    stubFetch(204);

    await expect(deleteBoard(3)).resolves.toBeUndefined();
  });

  it("raises the server's error detail with the status", async () => {
    stubFetch(409, { detail: "That username is already taken" });

    const error = await register("user", "password1").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe("That username is already taken");
    expect(error.status).toBe(409);
  });

  it("falls back to a generic message when there is no usable detail", async () => {
    stubFetch(422, { detail: [{ msg: "bad" }] });
    await expect(fetchBoard(1)).rejects.toThrow("Request failed (status 422)");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError("not json");
        },
      }))
    );
    await expect(fetchBoard(1)).rejects.toThrow("Request failed (status 500)");
  });

  it("clears the session and announces it when the server rejects the token", async () => {
    localStorage.setItem("pm-session-token", "stale");
    stubFetch(401, { detail: "Session expired" });
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);

    await expect(fetchBoard(1)).rejects.toThrow("Session expired");

    expect(getToken()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });

  it("does not announce an expired session for a failed sign-in", async () => {
    stubFetch(401, { detail: "Invalid username or password" });
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);

    await expect(login("user", "nope")).rejects.toThrow("Invalid username or password");

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });

  it("forgets the token on logout even if the server call fails", async () => {
    localStorage.setItem("pm-session-token", "abc");
    stubFetch(500);

    await expect(logout()).rejects.toThrow();

    expect(getToken()).toBeNull();
  });
});
