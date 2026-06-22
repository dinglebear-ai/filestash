"use client";

// Runtime config boot. The static shell has no Go-templated values, so the SPA
// fetches GET /api/config once on mount and exposes it (plus the mount base path)
// to the tree. Replaces the old index.*.html template injection.
import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { configApi } from "@/lib/api/endpoints";
import type { PublicConfig } from "@/lib/api/types";

interface ConfigContextValue {
  config: PublicConfig;
  /** Normalized mount base path, always with a trailing slash (e.g. "/"). */
  base: string;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["config"],
    queryFn: ({ signal }) => configApi.get(signal),
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="aurora-text-meta">Loading…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="aurora-text-section">Couldn&apos;t reach the server.</p>
        <p className="aurora-text-body text-[var(--aurora-text-muted)]">
          {error instanceof Error ? error.message : "The configuration endpoint is unavailable."}
        </p>
        <button
          className="aurora-text-control text-[var(--aurora-accent-primary)]"
          onClick={() => refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  const base = normalizeBase(data.base);
  return <ConfigContext.Provider value={{ config: data, base }}>{children}</ConfigContext.Provider>;
}

function normalizeBase(base?: string): string {
  if (!base || base === "") return "/";
  return base.endsWith("/") ? base : `${base}/`;
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be used within <ConfigProvider>");
  return ctx;
}
