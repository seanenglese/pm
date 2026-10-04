"use client";

import { useState, type FormEvent } from "react";
import { ApiError, login, register, type User } from "@/lib/api";

type AuthFormProps = {
  onAuthenticated: (user: User) => void;
};

type Mode = "signin" | "register";

const inputClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none ring-0 transition focus:border-[var(--primary-blue)]";

export const AuthForm = ({ onAuthenticated }: AuthFormProps) => {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === "register";

  const switchMode = () => {
    setMode(isRegister ? "signin" : "register");
    setError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const user = isRegister
        ? await register(username.trim(), password)
        : await login(username.trim(), password);
      onAuthenticated(user);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 422) {
        setError(
          "Usernames are 3-32 letters, numbers, dots, dashes or underscores; passwords need at least 8 characters."
        );
      } else if (caught instanceof ApiError && caught.status < 500) {
        setError(caught.message);
      } else {
        setError("Could not reach the server. Try again.");
      }
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-6 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Kanban Studio
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          {isRegister ? "Create account" : "Sign in"}
        </h1>
        <p className="mt-2 text-sm text-[var(--gray-text)]">
          {isRegister
            ? "Pick a username and a password of at least 8 characters."
            : "Welcome back. Sign in to see your boards."}
        </p>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm font-medium text-[var(--navy-dark)]">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-[var(--navy-dark)]">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
              required
            />
          </div>

          {error ? (
            <p className="text-sm font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {isRegister ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--gray-text)]">
          {isRegister ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            onClick={switchMode}
            className="font-semibold text-[var(--primary-blue)] hover:underline"
          >
            {isRegister ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </main>
  );
};
