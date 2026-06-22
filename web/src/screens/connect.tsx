"use client";

// Connect / login — faithful port of the legacy connect page: pick a storage
// backend, fill its login form (from /api/backend), POST /api/session, then go to
// the file browser. Already-authenticated sessions skip straight to /files.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi, sessionApi } from "@/lib/api/endpoints";
import type { Session } from "@/lib/api/types";
import { Button } from "@/registry/aurora/ui/button";
import { DynamicForm } from "@/components/dynamic-form";

const labelFor = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

export function ConnectScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const session = useQuery({ queryKey: ["session"], queryFn: ({ signal }) => sessionApi.get(signal) });
  const backends = useQuery({ queryKey: ["backends"], queryFn: ({ signal }) => backendApi.list(signal) });

  const [selected, setSelected] = useState<string | null>(null);
  const keys = backends.data ? Object.keys(backends.data) : [];

  // Default the selection to the first available backend once loaded.
  useEffect(() => {
    if (!selected && keys.length) setSelected(keys[0]);
  }, [keys, selected]);

  // Already signed in → go to the file browser.
  useEffect(() => {
    if (session.data?.is_authenticated) router.replace("/files");
  }, [session.data, router]);

  const login = useMutation({
    mutationFn: (values: Record<string, string>) => sessionApi.login(values),
    onSuccess: (data: Session) => {
      queryClient.setQueryData(["session"], data);
      router.replace("/files");
    },
  });

  if (session.isLoading || backends.isLoading) {
    return <Centered>Loading…</Centered>;
  }
  if (backends.isError || !backends.data) {
    return <Centered>Couldn&apos;t load storage backends.</Centered>;
  }

  const form = selected ? backends.data[selected] : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="flex flex-col gap-1 text-center">
        <p className="aurora-text-eyebrow text-[var(--aurora-text-muted)]">filestash</p>
        <h1 className="aurora-text-section">Connect to a storage backend</h1>
      </header>

      {keys.length > 1 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {keys.map((k) => (
            <Button
              key={k}
              size="sm"
              variant={k === selected ? "aurora" : "neutral"}
              onClick={() => setSelected(k)}
            >
              {labelFor(k)}
            </Button>
          ))}
        </div>
      ) : null}

      <div
        className="rounded-[var(--aurora-radius-3)] p-6"
        style={{
          background: "var(--aurora-panel-strong)",
          borderColor: "var(--aurora-border-strong)",
          borderWidth: 1,
          boxShadow: "var(--aurora-shadow-strong), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        {form ? (
          <DynamicForm
            form={form}
            submitting={login.isPending}
            error={login.isError ? (login.error as Error).message : null}
            onSubmit={(values) => login.mutate(values)}
          />
        ) : (
          <p className="aurora-text-body text-[var(--aurora-text-muted)]">Select a backend to continue.</p>
        )}
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <p className="aurora-text-body text-[var(--aurora-text-muted)]">{children}</p>
    </main>
  );
}
