"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import clsx from "clsx";
import { AccountSettings } from "@/components/AccountSettings";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  createBoard,
  deleteBoard,
  listBoards,
  renameBoard,
  type BoardSummary,
  type User,
} from "@/lib/api";

type WorkspaceProps = {
  user: User;
  onLogout: () => void;
  onAccountDeleted: () => void;
};

const ACTIVE_BOARD_KEY = "pm-active-board";

const rememberedBoardId = () => Number(localStorage.getItem(ACTIVE_BOARD_KEY));

export const Workspace = ({ user, onLogout, onAccountDeleted }: WorkspaceProps) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  const loadBoards = useCallback(() => {
    listBoards()
      .then((list) => {
        setBoards(list);
        const remembered = rememberedBoardId();
        const initial = list.find((board) => board.id === remembered) ?? list[0];
        setActiveId(initial?.id ?? null);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    if (activeId !== null) {
      localStorage.setItem(ACTIVE_BOARD_KEY, String(activeId));
    }
  }, [activeId]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newBoardName.trim();
    if (!name) {
      return;
    }
    try {
      const created = await createBoard(name);
      setBoards((prev) => [...(prev ?? []), created]);
      setActiveId(created.id);
      setNewBoardName("");
      setIsCreating(false);
      setActionError(null);
    } catch {
      setActionError("Could not create the board. Try again.");
    }
  };

  const handleRename = async (boardId: number, name: string) => {
    try {
      const renamed = await renameBoard(boardId, name);
      setBoards((prev) =>
        (prev ?? []).map((board) => (board.id === boardId ? renamed : board))
      );
      setActionError(null);
    } catch {
      setActionError("Could not rename the board. Try again.");
    }
  };

  const handleDelete = async (boardId: number) => {
    const board = boards?.find((candidate) => candidate.id === boardId);
    if (!board || !window.confirm(`Delete "${board.name}" and all of its cards?`)) {
      return;
    }
    try {
      await deleteBoard(boardId);
      const remaining = (boards ?? []).filter((candidate) => candidate.id !== boardId);
      setBoards(remaining);
      setActiveId(remaining[0]?.id ?? null);
      setActionError(null);
    } catch {
      setActionError("Could not delete the board. Try again.");
    }
  };

  const activeBoard = boards?.find((board) => board.id === activeId);

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--stroke)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <p className="font-display text-xl font-semibold text-[var(--navy-dark)]">
            Kanban Studio
          </p>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--gray-text)]">
              Signed in as{" "}
              <span className="font-semibold text-[var(--navy-dark)]">{user.username}</span>
            </span>
            <button
              type="button"
              onClick={() => setIsAccountOpen(true)}
              className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm font-semibold text-[var(--navy-dark)] shadow-sm transition hover:border-[var(--primary-blue)]"
            >
              Account
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm font-semibold text-[var(--navy-dark)] shadow-sm transition hover:border-[var(--primary-blue)]"
            >
              Log out
            </button>
          </div>
        </div>
        <nav
          aria-label="Boards"
          className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2 px-6 pb-4"
        >
          {boards?.map((board) => (
            <button
              key={board.id}
              type="button"
              onClick={() => setActiveId(board.id)}
              aria-current={board.id === activeId ? "page" : undefined}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold transition",
                board.id === activeId
                  ? "bg-[var(--navy-dark)] text-white"
                  : "border border-[var(--stroke)] bg-white text-[var(--navy-dark)] hover:border-[var(--primary-blue)]"
              )}
            >
              {board.name}
            </button>
          ))}
          {isCreating ? (
            <form onSubmit={handleCreate} className="flex items-center gap-2">
              <input
                autoFocus
                value={newBoardName}
                onChange={(event) => setNewBoardName(event.target.value)}
                placeholder="Board name"
                aria-label="New board name"
                maxLength={80}
                className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm outline-none transition focus:border-[var(--primary-blue)]"
              />
              <button
                type="submit"
                className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewBoardName("");
                }}
                className="rounded-full px-3 py-2 text-sm font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="rounded-full border border-dashed border-[var(--primary-blue)] px-4 py-2 text-sm font-semibold text-[var(--primary-blue)] transition hover:bg-[var(--surface)]"
            >
              New board
            </button>
          )}
        </nav>
        {actionError ? (
          <p role="alert" className="mx-auto max-w-[1500px] px-6 pb-4 text-sm font-medium text-red-600">
            {actionError}
          </p>
        ) : null}
      </header>

      {loadError ? (
        <main className="flex flex-col items-center justify-center gap-4 py-24">
          <p className="text-sm font-semibold text-[var(--gray-text)]">
            Could not load your boards.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoadError(false);
              loadBoards();
            }}
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Retry
          </button>
        </main>
      ) : boards === null ? (
        <main className="flex justify-center py-24">
          <p className="text-sm font-semibold text-[var(--gray-text)]">Loading your boards...</p>
        </main>
      ) : activeBoard ? (
        <KanbanBoard
          key={activeBoard.id}
          boardId={activeBoard.id}
          boardName={activeBoard.name}
          onRenameBoard={(name) => handleRename(activeBoard.id, name)}
          onDeleteBoard={() => handleDelete(activeBoard.id)}
        />
      ) : (
        <main className="flex flex-col items-center justify-center gap-2 py-24 text-center">
          <p className="font-display text-xl font-semibold text-[var(--navy-dark)]">
            No boards yet
          </p>
          <p className="text-sm text-[var(--gray-text)]">
            Use New board above to start one.
          </p>
        </main>
      )}
      {isAccountOpen ? (
        <AccountSettings
          user={user}
          onClose={() => setIsAccountOpen(false)}
          onAccountDeleted={onAccountDeleted}
        />
      ) : null}
    </div>
  );
};
