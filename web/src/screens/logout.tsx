"use client";

// Logout — DELETE /api/session, clear cached session, return to connect.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { sessionApi } from "@/lib/api/endpoints";

export function LogoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    sessionApi
      .logout()
      .catch(() => undefined)
      .finally(() => {
        queryClient.removeQueries({ queryKey: ["session"] });
        router.replace("/");
      });
  }, [router, queryClient]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <p className="aurora-text-body text-[var(--aurora-text-muted)]">Signing out…</p>
    </main>
  );
}
