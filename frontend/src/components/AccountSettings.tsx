"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, changePassword, deleteAccount, type User } from "@/lib/api";

type AccountSettingsProps = {
  user: User;
  onClose: () => void;
  onAccountDeleted: () => void;
};

const fieldClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]";

const messageFor = (caught: unknown) =>
  caught instanceof ApiError && caught.status === 400
    ? caught.message
    : "Something went wrong. Try again.";

export const AccountSettings = ({ user, onClose, onAccountDeleted }: AccountSettingsProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      setPasswordStatus({ ok: false, text: "The new password needs at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ ok: false, text: "The new passwords don't match." });
      return;
    }
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus({
        ok: true,
        text: "Password changed. Any other devices signed in to this account were signed out.",
      });
    } catch (caught) {
      setPasswordStatus({ ok: false, text: messageFor(caught) });
    }
  };

  const handleDeleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !window.confirm(
        `Delete the account "${user.username}" and all of its boards? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await deleteAccount(deletePassword);
      onAccountDeleted();
    } catch (caught) {
      setDeleteError(messageFor(caught));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy-dark)]/40 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="account-title" className="font-display text-xl font-semibold text-[var(--navy-dark)]">
              Account
            </h2>
            <p className="mt-1 text-sm text-[var(--gray-text)]">
              Signed in as <span className="font-semibold text-[var(--navy-dark)]">{user.username}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-sm font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Close
          </button>
        </div>

        <form
          onSubmit={handleChangePassword}
          aria-labelledby="change-password-title"
          className="mt-6 space-y-3 border-t border-[var(--stroke)] pt-5"
        >
          <h3 id="change-password-title" className="font-display text-base font-semibold text-[var(--navy-dark)]">
            Change password
          </h3>
          <div className="space-y-1.5">
            <label htmlFor="current-password" className={labelClass}>
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-password" className={labelClass}>
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="confirm-password" className={labelClass}>
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className={fieldClass}
            />
          </div>
          {passwordStatus ? (
            <p
              role={passwordStatus.ok ? "status" : "alert"}
              className={`text-sm font-medium ${passwordStatus.ok ? "text-green-700" : "text-red-600"}`}
            >
              {passwordStatus.text}
            </p>
          ) : null}
          <button
            type="submit"
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Change password
          </button>
        </form>

        <form
          onSubmit={handleDeleteAccount}
          aria-labelledby="delete-account-title"
          className="mt-6 space-y-3 border-t border-[var(--stroke)] pt-5"
        >
          <h3 id="delete-account-title" className="font-display text-base font-semibold text-red-700">
            Delete account
          </h3>
          <p className="text-sm text-[var(--gray-text)]">
            Permanently deletes your account and every board in it. Enter your password to confirm.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="delete-password" className={labelClass}>
              Password
            </label>
            <input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              required
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              className={fieldClass}
            />
          </div>
          {deleteError ? (
            <p role="alert" className="text-sm font-medium text-red-600">
              {deleteError}
            </p>
          ) : null}
          <button
            type="submit"
            className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
          >
            Delete my account
          </button>
        </form>
      </div>
    </div>
  );
};
