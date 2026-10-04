"use client";

import { useEffect, useState } from "react";
import { AuthForm } from "@/components/AuthForm";
import { Workspace } from "@/components/Workspace";
import { UNAUTHORIZED_EVENT, getMe, getToken, logout, type User } from "@/lib/api";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    const restored = getToken() ? getMe().catch(() => null) : Promise.resolve(null);
    restored.then(setUser).finally(() => setIsRestoring(false));
  }, []);

  useEffect(() => {
    const handleExpired = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, handleExpired);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleExpired);
  }, []);

  const handleLogout = () => {
    setUser(null);
    logout().catch(() => {});
  };

  if (isRestoring) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm font-semibold text-[var(--gray-text)]">Loading...</p>
      </main>
    );
  }

  if (!user) {
    return <AuthForm onAuthenticated={setUser} />;
  }

  return <Workspace user={user} onLogout={handleLogout} />;
}
