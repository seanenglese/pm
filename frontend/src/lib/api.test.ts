import { fetchBoard, saveBoard } from "@/lib/api";
import { initialData } from "@/lib/kanban";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchBoard", () => {
  it("requests the user-scoped board and returns it", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ username: "user", board: initialData }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const board = await fetchBoard("user");

    expect(fetchMock).toHaveBeenCalledWith("/api/users/user/board");
    expect(board).toEqual(initialData);
  });

  it("encodes the username in the URL", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ username: "a/b c", board: initialData }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    await fetchBoard("a/b c");

    expect(fetchMock).toHaveBeenCalledWith("/api/users/a%2Fb%20c/board");
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch
    );

    await expect(fetchBoard("missing-user")).rejects.toThrow(/404/);
  });
});

describe("saveBoard", () => {
  it("PUTs the board as JSON and returns the saved result", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ username: "user", board: initialData }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const saved = await saveBoard("user", initialData);

    expect(fetchMock).toHaveBeenCalledWith("/api/users/user/board", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(initialData),
    });
    expect(saved).toEqual(initialData);
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 422 })) as unknown as typeof fetch
    );

    await expect(saveBoard("user", initialData)).rejects.toThrow(/422/);
  });
});
