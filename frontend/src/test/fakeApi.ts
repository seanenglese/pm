import { initialData, type BoardData } from "@/lib/kanban";

export type ChatHandler = (
  message: string,
  history: unknown[],
  board: BoardData
) => { reply: string; board?: BoardData };

type StoredBoard = {
  id: number;
  owner: string;
  name: string;
  board: BoardData;
  createdAt: string;
  updatedAt: string;
};

const json = (status: number, body?: unknown) =>
  ({
    ok: status < 400,
    status,
    json: async () => body,
  }) as Response;

const BLANK: BoardData = {
  columns: [
    { id: "col-todo", title: "To Do", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
  cards: {},
};

/**
 * An in-memory stand-in for the FastAPI backend: auth, boards, and chat, with
 * the same URLs, status codes, and payload shapes. Tokens are "tok-<username>".
 * Seeded with the demo account (user/password) owning one board (id 1).
 */
export const installFakeApi = (options: { chat?: ChatHandler } = {}) => {
  const passwords = new Map<string, string>([["user", "password"]]);
  const sessions = new Set<string>();
  let nextBoardId = 1;
  const boards: StoredBoard[] = [];

  const addBoard = (owner: string, name: string, board: BoardData) => {
    const stored = {
      id: nextBoardId++,
      owner,
      name,
      board,
      createdAt: "2026-10-01 10:00:00",
      updatedAt: "2026-10-01 10:00:00",
    };
    boards.push(stored);
    return stored;
  };
  addBoard("user", "My board", initialData);

  const summary = ({ id, name, createdAt, updatedAt }: StoredBoard) => ({
    id,
    name,
    createdAt,
    updatedAt,
  });
  const detail = (stored: StoredBoard) => ({ ...summary(stored), board: stored.board });
  const userOf = (username: string) => ({
    id: [...passwords.keys()].indexOf(username) + 1,
    username,
    createdAt: "2026-10-01 10:00:00",
  });
  const startSession = (username: string) => {
    const token = `tok-${username}`;
    sessions.add(token);
    return { token, user: userOf(username) };
  };

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
    const token = auth?.replace("Bearer ", "");
    const username = token && sessions.has(token) ? token.slice(4) : null;

    if (url === "/api/auth/register" && method === "POST") {
      if (body.username.length < 3 || body.password.length < 8) {
        return json(422, { detail: [{ msg: "invalid" }] });
      }
      if (passwords.has(body.username)) {
        return json(409, { detail: "That username is already taken" });
      }
      passwords.set(body.username, body.password);
      addBoard(body.username, "My first board", initialData);
      return json(201, startSession(body.username));
    }
    if (url === "/api/auth/login" && method === "POST") {
      if (passwords.get(body.username) !== body.password) {
        return json(401, { detail: "Invalid username or password" });
      }
      return json(200, startSession(body.username));
    }

    if (!username) {
      return json(401, { detail: "Not signed in" });
    }

    if (url === "/api/auth/logout") {
      sessions.delete(token!);
      return json(204);
    }
    if (url === "/api/auth/me" && method === "DELETE") {
      if (passwords.get(username) !== body.password) {
        return json(400, { detail: "Password is incorrect" });
      }
      passwords.delete(username);
      sessions.delete(token!);
      for (const stored of boards.filter((candidate) => candidate.owner === username)) {
        boards.splice(boards.indexOf(stored), 1);
      }
      return json(204);
    }
    if (url === "/api/auth/me") {
      return json(200, userOf(username));
    }
    if (url === "/api/auth/password") {
      if (passwords.get(username) !== body.currentPassword) {
        return json(400, { detail: "Current password is incorrect" });
      }
      passwords.set(username, body.newPassword);
      return json(204);
    }

    const owned = boards.filter((stored) => stored.owner === username);
    if (url === "/api/boards") {
      if (method === "POST") {
        return json(201, detail(addBoard(username, body.name.trim(), BLANK)));
      }
      return json(200, owned.map(summary));
    }

    const match = url.match(/^\/api\/boards\/(\d+)(\/chat)?$/);
    const stored = match && owned.find((candidate) => candidate.id === Number(match[1]));
    if (!stored) {
      return json(404, { detail: "Board not found" });
    }
    if (match[2]) {
      const result = options.chat
        ? options.chat(body.message, body.history, stored.board)
        : { reply: `Echo: ${body.message}` };
      if (result.board) {
        stored.board = result.board;
      }
      return json(200, { reply: result.reply, board: stored.board });
    }
    if (method === "PUT") {
      stored.board = body;
    } else if (method === "PATCH") {
      stored.name = body.name;
      return json(200, summary(stored));
    } else if (method === "DELETE") {
      boards.splice(boards.indexOf(stored), 1);
      return json(204);
    }
    return json(200, detail(stored));
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    fetchMock,
    boards,
    /** Act as an already signed-in user, as if the token were saved from an earlier visit. */
    signIn: (name = "user") => {
      sessions.add(`tok-${name}`);
      localStorage.setItem("pm-session-token", `tok-${name}`);
    },
    /** Invalidate every session server-side, as if they all expired. */
    expireSessions: () => sessions.clear(),
    calls: (predicate: (url: string, method: string) => boolean) =>
      fetchMock.mock.calls.filter(([url, init]) => predicate(url, init?.method ?? "GET")),
  };
};

export type FakeApi = ReturnType<typeof installFakeApi>;

/** Makes matching requests wait until the returned `release` is called. */
export const holdRequests = (
  api: FakeApi,
  shouldHold: (url: string, init?: RequestInit) => boolean
) => {
  const realImpl = api.fetchMock.getMockImplementation()!;
  const pending: Array<() => void> = [];
  api.fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (shouldHold(url, init)) {
      await new Promise<void>((resolve) => pending.push(resolve));
    }
    return realImpl(url, init);
  });
  return { release: () => pending.shift()?.() };
};
