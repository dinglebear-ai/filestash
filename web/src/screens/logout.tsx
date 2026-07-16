"use client";

// Logout — DELETE /api/session, clear cached session, return to connect.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { sessionApi } from "@/lib/api/endpoints";
import { Card, CardHeader, CardTitle } from "@/registry/aurora/ui/card";
import { Spinner } from "@/registry/aurora/ui/spinner";
import { withBase } from "@/lib/paths";

export function LogoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    sessionApi
      .logout()
      .catch(() => undefined)
      .finally(() => {
        queryClient.removeQueries({ queryKey: ["session"] });
        router.replace(withBase("/"));
      });
  }, [router, queryClient]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <Card>
        <CardHeader className="items-center text-center">
          <Spinner />
          <CardTitle as="h1">Signing out</CardTitle>
        </CardHeader>
      </Card>
    </main>
  );
}
