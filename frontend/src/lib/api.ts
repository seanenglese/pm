import type { BoardData } from "@/lib/kanban";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type BoardResponse = {
  username: string;
  board: BoardData;
};

type ChatResponse = {
  reply: string;
  board: BoardData;
};

export const fetchBoard = async (username: string): Promise<BoardData> => {
  const response = await fetch(`/api/users/${username}/board`);
  if (!response.ok) {
    throw new Error(`Failed to load board (status ${response.status})`);
  }
  const payload = (await response.json()) as BoardResponse;
  return payload.board;
};

export const sendChatMessage = async (
  username: string,
  message: string,
  history: ChatMessage[]
): Promise<ChatResponse> => {
  const response = await fetch(`/api/users/${username}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!response.ok) {
    throw new Error(`Failed to reach the assistant (status ${response.status})`);
  }
  return (await response.json()) as ChatResponse;
};

export const saveBoard = async (
  username: string,
  board: BoardData
): Promise<BoardData> => {
  const response = await fetch(`/api/users/${username}/board`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(board),
  });
  if (!response.ok) {
    throw new Error(`Failed to save board (status ${response.status})`);
  }
  const payload = (await response.json()) as BoardResponse;
  return payload.board;
};
