"use client";

// Connect / login — faithful port of the legacy connect page. The connect-page
// list comes from config.connections (label + backend type + optional prefilled
// overrides); the field definitions for each type come from /api/backend. Submits
// to POST /api/session, then goes to the file browser.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi, sessionApi } from "@/lib/api/endpoints";
import { useConfig } from "@/lib/config/config-context";
import type { Connection, FormFields, Session } from "@/lib/api/types";
import { Button } from "@/registry/aurora/ui/button";
import { DynamicForm } from "@/components/dynamic-form";

/** Merge a connection's prefilled overrides onto a backend's field definitions. */
function applyOverrides(fields: FormFields, conn: Connection): FormFields {
  const merged: FormFields = {};
  for (const [name, el] of Object.entries(fields)) {
    const override = conn[name];
    merged[name] = override !== undefined ? { ...el, value: override } : el;
  }
  return merged;
}

export function ConnectScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { config } = useConfig();

  const session = useQuery({ queryKey: ["session"], queryFn: ({ signal }) => sessionApi.get(signal) });
  const backends = useQuery({ queryKey: ["backends"], queryFn: ({ signal }) => backendApi.list(signal) });

  // Connect-page list: prefer config.connections; fall back to all backends.
  const connections = useMemo<Connection[]>(() => {
    if (config.connections?.length) return config.connections;
    return backends.data
      ? Object.keys(backends.data).map((type) => ({ label: type, type }))
      : [];
  }, [config.connections, backends.data]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected = connections[selectedIdx];

  useEffect(() => {
    if (session.data?.is_authenticated) router.replace("/files/");
  }, [session.data, router]);

  const login = useMutation({
    mutationFn: (values: Record<string, string>) => sessionApi.login(values),
    onSuccess: (data: Session) => {
      queryClient.setQueryData(["session"], data);
      router.replace("/files/");
    },
  });

  if (session.isLoading || backends.isLoading) return <Centered>Loading…</Centered>;
  if (backends.isError || !backends.data) return <Centered>Couldn&apos;t load storage backends.</Centered>;

  const baseFields = selected ? backends.data[selected.type] : undefined;
  const fields = baseFields && selected ? applyOverrides(baseFields, selected) : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="flex flex-col gap-1 text-center">
        <p className="aurora-text-eyebrow text-[var(--aurora-text-muted)]">{config.name ?? "filestash"}</p>
        <h1 className="aurora-text-section">Connect to a storage backend</h1>
      </header>

      {connections.length > 1 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {connections.map((c, i) => (
            <Button
              key={`${c.label}-${i}`}
              size="sm"
              variant={i === selectedIdx ? "aurora" : "neutral"}
              onClick={() => setSelectedIdx(i)}
            >
              {c.label}
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
        {fields ? (
          <DynamicForm
            fields={fields}
            submitting={login.isPending}
            error={login.isError ? (login.error as Error).message : null}
            onSubmit={(values) => login.mutate(values)}
          />
        ) : (
          <p className="aurora-text-body text-[var(--aurora-text-muted)]">
            No form available for this backend.
          </p>
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
