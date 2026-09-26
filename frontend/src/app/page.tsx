"use client";

import { FormEvent, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";

const VALID_USERNAME = "user";
const VALID_PASSWORD = "password";

export default function Home() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      setIsAuthenticated(true);
      setError("");
      return;
    }

    setError("Invalid username or password");
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUsername("");
    setPassword("");
    setError("");
  };

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-6 py-12">
        <div className="w-full max-w-md rounded-[28px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
          <h1 className="font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-[var(--gray-text)]">
            Use the demo account to continue to your board.
          </p>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="username" className="block text-sm font-medium text-[var(--navy-dark)]">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none ring-0 transition focus:border-[var(--primary-blue)]"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-[var(--navy-dark)]">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none ring-0 transition focus:border-[var(--primary-blue)]"
              />
            </div>

            {error ? (
              <p className="text-sm font-medium text-red-600" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Sign in
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="relative">
      <div className="flex justify-end px-6 pt-6">
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm font-semibold text-[var(--navy-dark)] shadow-sm transition hover:border-[var(--primary-blue)]"
        >
          Log out
        </button>
      </div>
      <KanbanBoard username={username} />
    </div>
  );
}
