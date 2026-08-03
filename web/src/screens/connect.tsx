"use client";

// Connect / login — faithful port of the legacy connect page. The connect-page
// list comes from config.connections (label + backend type + optional prefilled
// overrides); the field definitions for each type come from /api/backend. Submits
// to POST /api/session, then goes to the file browser.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { backendApi, sessionApi } from "@/lib/api/endpoints";
import { useConfig } from "@/lib/config/config-context";
import type { Connection, FormFields, Session } from "@/lib/api/types";
import { Button } from "@/registry/aurora/ui/button";
import { ButtonGroup } from "@/registry/aurora/ui/button-group";
import { Callout } from "@/registry/aurora/ui/callout";
import { Card, CardContent, CardHeader, CardTitle } from "@/registry/aurora/ui/card";
import { Spinner } from "@/registry/aurora/ui/spinner";
import { DynamicForm } from "@/components/dynamic-form";
import { AccessHeader } from "@/components/access-header";
import { trimBase, withBase } from "@/lib/paths";

/** Merge a connection's prefilled overrides onto a backend's field definitions. */
function applyOverrides(fields: FormFields, conn: Connection): FormFields {
  const merged: FormFields = {};
  for (const [name, el] of Object.entries(fields)) {
    const override = conn[name];
    merged[name] = override !== undefined ? { ...el, value: override } : el;
  }
  return merged;
}

/** Resolve a server-provided local continuation without allowing open redirects. */
function authenticatedDestination(next?: string): string {
  const fallback = withBase("/files/");
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\r\n]/.test(next)) return fallback;

  try {
    const localOrigin = "https://filestash.invalid";
    const url = new URL(next, localOrigin);
    if (url.origin !== localOrigin) return fallback;
    return withBase(`${trimBase(url.pathname)}${url.search}${url.hash}`);
  } catch {
    return fallback;
  }
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
    if (session.data?.is_authenticated) router.replace(authenticatedDestination(session.data.next));
  }, [session.data, router]);

  const login = useMutation({
    mutationFn: (values: Record<string, string>) => sessionApi.login(values),
    onSuccess: (data: Session) => {
      queryClient.setQueryData(["session"], data);
      router.replace(authenticatedDestination(data.next));
    },
  });

  if (session.isLoading || backends.isLoading) return <Centered label="Loading storage backends" />;
  if (backends.isError || !backends.data) {
    return (
      <Centered>
        <Callout title="Could not load storage backends" variant="error">
          The backend catalog did not return a usable connection list.
        </Callout>
      </Centered>
    );
  }

  const baseFields = selected ? backends.data[selected.type] : undefined;
  const fields = baseFields && selected ? applyOverrides(baseFields, selected) : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-5 px-5 py-10 sm:px-6 sm:py-12">
      <AccessHeader
        icon={Database}
        eyebrow={config.name ?? "Filestash"}
        title="Connect Your Storage"
        description="Choose a configured storage service, then sign in with its connection details."
        badge={selected?.label ?? "Storage Portal"}
      />

      {connections.length > 1 ? (
        <ButtonGroup className="mx-auto flex-wrap rounded-[var(--aurora-radius-2)] border border-[var(--aurora-border-subtle)] bg-[var(--aurora-panel-soft)] p-1 shadow-[var(--aurora-shadow-soft)]">
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
        </ButtonGroup>
      ) : null}

      <Card elevated accent="cyan" className="overflow-hidden">
        <CardContent className="p-6 sm:p-7">
        {fields ? (
          <DynamicForm
            key={selectedIdx}
            fields={fields}
            submitting={login.isPending}
            error={login.isError ? (login.error as Error).message : null}
            onSubmit={(values) => login.mutate(values)}
          />
        ) : (
          <Callout title="No form available" variant="warn">
            No form available for this backend.
          </Callout>
        )}
        </CardContent>
      </Card>
    </main>
  );
}

function Centered({ children, label }: { children?: React.ReactNode; label?: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      {children ?? (
        <Card>
          <CardHeader className="items-center text-center">
            <Spinner />
            <CardTitle as="h1">{label}</CardTitle>
          </CardHeader>
        </Card>
      )}
    </main>
  );
}
