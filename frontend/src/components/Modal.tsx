"use client";

import { useEffect, type ReactNode } from "react";
import clsx from "clsx";

export const fieldClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";
export const labelClass =
  "block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]";

type ModalProps = {
  /** Id of the element that names the dialog. */
  labelledBy: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
};

/** A dialog over a dimmed backdrop; Escape or a click on the backdrop closes it. */
export const Modal = ({ labelledBy, className, onClose, children }: ModalProps) => {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

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
        aria-labelledby={labelledBy}
        className={clsx(
          "w-full max-w-lg rounded-[28px] border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)]",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
};
