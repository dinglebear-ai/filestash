"use client";

// Runtime config boot. The static shell has no Go-templated values, so the SPA
// fetches GET /api/config once on mount and exposes it (plus the mount base path)
// to the tree. Replaces the old index.*.html template injection.
import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { configApi } from "@/lib/api/endpoints";
import type { PublicConfig } from "@/lib/api/types";
import { bootBase, normalizeBase, withBase } from "@/lib/paths";
import { Button } from "@/registry/aurora/ui/button";
import { Callout } from "@/registry/aurora/ui/callout";
import { Spinner } from "@/registry/aurora/ui/spinner";

interface ConfigContextValue {
  config: PublicConfig;
  /** Normalized mount base path, always with a trailing slash (e.g. "/"). */
  base: string;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);
export function ConfigProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["config"],
    queryFn: ({ signal }) => configApi.get(signal),
    staleTime: Infinity,
  });

  if (query.isLoading) return <main className="flex min-h-dvh items-center justify-center"><Spinner /></main>;
  if (query.isError || !query.data) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center px-6">
        <Callout title="Could not load Filestash" variant="error">
          <div className="grid gap-3"><span>{query.error instanceof Error ? query.error.message : "The runtime configuration is unavailable."}</span><Button size="sm" variant="neutral" onClick={() => void query.refetch()}>Retry</Button></div>
        </Callout>
      </main>
    );
  }
  const base = normalizeBase(query.data.base ?? bootBase());
  return <ConfigContext.Provider value={{ config: { ...query.data, base }, base }}><link rel="stylesheet" href={withBase("/custom.css", base)} />{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be used within <ConfigProvider>");
  return ctx;
}
