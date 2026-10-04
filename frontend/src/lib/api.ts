import type { BoardData } from "@/lib/kanban";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type User = {
  id: number;
  username: string;
  createdAt: string;
};

export type BoardSummary = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type BoardDetail = BoardSummary & { board: BoardData };

type AuthResponse = { token: string; user: User };

type ChatResponse = {
  reply: string;
  board: BoardData;
};

const TOKEN_KEY = "pm-session-token";

/** Fired on window when the server rejects the session, so the app can return to sign-in. */
export const UNAUTHORIZED_EVENT = "pm:unauthorized";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const request = async <T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> => {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearToken();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const payload = await response.json().catch(() => null);
    const detail = typeof payload?.detail === "string" ? payload.detail : null;
    throw new ApiError(detail ?? `Request failed (status ${response.status})`, response.status);
  }

  return (response.status === 204 ? undefined : await response.json()) as T;
};

const startSession = async (path: string, username: string, password: string) => {
  const { token, user } = await request<AuthResponse>(path, {
    method: "POST",
    body: { username, password },
  });
  localStorage.setItem(TOKEN_KEY, token);
  return user;
};

export const login = (username: string, password: string) =>
  startSession("/api/auth/login", username, password);

export const register = (username: string, password: string) =>
  startSession("/api/auth/register", username, password);

export const logout = async () => {
  try {
    await request<void>("/api/auth/logout", { method: "POST" });
  } finally {
    clearToken();
  }
};

export const getMe = () => request<User>("/api/auth/me");

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>("/api/auth/password", {
    method: "PUT",
    body: { currentPassword, newPassword },
  });

/** Deletes the signed-in account, its boards, and all of its sessions. */
export const deleteAccount = async (password: string) => {
  await request<void>("/api/auth/me", { method: "DELETE", body: { password } });
  clearToken();
};

export const listBoards = () => request<BoardSummary[]>("/api/boards");

export const createBoard = (name: string) =>
  request<BoardDetail>("/api/boards", { method: "POST", body: { name } });

export const fetchBoard = (boardId: number) =>
  request<BoardDetail>(`/api/boards/${boardId}`);

export const saveBoard = (boardId: number, board: BoardData) =>
  request<BoardDetail>(`/api/boards/${boardId}`, { method: "PUT", body: board });

export const renameBoard = (boardId: number, name: string) =>
  request<BoardSummary>(`/api/boards/${boardId}`, { method: "PATCH", body: { name } });

export const deleteBoard = (boardId: number) =>
  request<void>(`/api/boards/${boardId}`, { method: "DELETE" });

export const sendChatMessage = (
  boardId: number,
  message: string,
  history: ChatMessage[]
) =>
  request<ChatResponse>(`/api/boards/${boardId}/chat`, {
    method: "POST",
    body: { message, history },
  });
