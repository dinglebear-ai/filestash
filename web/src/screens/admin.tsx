"use client";

// Admin backoffice — faithful port of the back office. Password gate
// (/admin/api/session), then sections: Settings (the config tree editor),
// Logs, and Audit. Config nodes share the FormElement shape used elsewhere.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import bcrypt from "bcryptjs";
import { KeyRound, Settings2 } from "lucide-react";
import { adminApi, configApi } from "@/lib/api/endpoints";
import type { FormElement } from "@/lib/api/types";
import { withBase } from "@/lib/paths";
import { Terminal, type TerminalLine } from "@/registry/aurora/blocks/navigation/terminal/terminal";
import { Button } from "@/registry/aurora/ui/button";
import { Badge } from "@/registry/aurora/ui/badge";
import { Callout } from "@/registry/aurora/ui/callout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/registry/aurora/ui/card";
import { Field } from "@/registry/aurora/ui/field";
import { Input } from "@/registry/aurora/ui/input";
import { SkeletonRow } from "@/registry/aurora/ui/skeleton";
import { Spinner } from "@/registry/aurora/ui/spinner";
import { Switch } from "@/registry/aurora/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/registry/aurora/ui/tabs";
import { AccessHeader } from "@/components/access-header";

type ConfigTree = Record<string, unknown>;
const isField = (n: unknown): n is FormElement =>
  typeof n === "object" && n !== null && typeof (n as { type?: unknown }).type === "string";

// The admin config API returns nested FormElements ({label,type,value,...}); the
// save endpoint expects flat values. Collapse each field node to its value before
// POSTing (mirrors the legacy reshapeConfigBeforeSave / formObjToJSON$).
export function serializeConfig(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(serializeConfig);
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.type === "string" && "value" in o) {
      if (o.type === "number") {
        if (o.value === "" || o.value == null) {
          if (o.default == null) return undefined;
          const number = typeof o.default === "number" ? o.default : Number(o.default);
          if (!Number.isFinite(number)) throw new Error(`${String(o.label ?? "Number")} must be a valid number`);
          return number;
        }
        const number = typeof o.value === "number" ? o.value : Number(o.value);
        if (!Number.isFinite(number)) throw new Error(`${String(o.label ?? "Number")} must be a valid number`);
        return number;
      }
      const effectiveValue = o.value ?? o.default;
      if (effectiveValue == null) return undefined;
      return effectiveValue;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      const serialized = serializeConfig(v);
      if (serialized === undefined) continue;
      out[k] = serialized;
    }
    return out;
  }
  return node;
}

export function AdminScreen({ pathname }: { pathname: string }) {
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ["admin-session"], queryFn: ({ signal }) => adminApi.session(signal) });

  // First-run: the Go backoffice handler redirects here when no admin is set.
  if (pathname.replace(/\/$/, "").endsWith("/setup")) {
    return <AdminSetup onDone={() => queryClient.invalidateQueries({ queryKey: ["admin-session"] })} />;
  }
  if (session.isLoading) return <Centered label="Loading admin session" />;
  if (session.isError) {
    return <Centered><Callout title="Could not check the admin session" variant="error"><div className="grid gap-3"><span>{session.error instanceof Error ? session.error.message : "The admin session endpoint returned an error."}</span><Button size="sm" variant="neutral" onClick={() => void session.refetch()}>Retry</Button></div></Callout></Centered>;
  }
  if (!session.data) {
    return <AdminLogin onSuccess={() => queryClient.invalidateQueries({ queryKey: ["admin-session"] })} />;
  }
  return <AdminShell />;
}

function AdminSetup({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const setup = useMutation({
    mutationFn: async () => {
      // Faithful to the legacy flow: client bcrypt-hashes the password, writes it
      // into the config (allowed pre-admin), then authenticates. AdminOnly skips
      // auth while auth.admin is unset.
      const [cfg, publicConfig] = await Promise.all([adminApi.getConfig(undefined, setupToken), configApi.get()]) as [Record<string, Record<string, Record<string, unknown>>>, { connections?: unknown[] }];
      if (cfg.auth?.admin) cfg.auth.admin.value = bcrypt.hashSync(password, 10);
      await adminApi.saveConfig({ ...(serializeConfig(cfg) as Record<string, unknown>), connections: publicConfig.connections ?? [] }, setupToken);
      await adminApi.login(password);
    },
    onSuccess: () => {
      onDone();
      router.replace(withBase("/admin/"));
    },
  });

  const canSubmit = setupToken.length >= 32 && password.length > 0 && password === confirm;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-5 py-10 sm:px-6">
      <AccessHeader
        icon={Settings2}
        eyebrow="Filestash Admin"
        title="Secure the Console"
        description="Create the administrator password used to manage this Filestash instance."
        badge="First-Run Setup"
        badgeTone="warn"
      />
      <Card elevated accent="cyan" className="overflow-hidden">
        <CardContent className="p-6 sm:p-7">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) setup.mutate();
            }}
          >
            <Field label="Setup token" htmlFor="admin-setup-token" description="Enter the FILESTASH_SETUP_TOKEN configured by the operator.">
              <Input id="admin-setup-token" type="password" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} autoComplete="off" autoFocus />
            </Field>
            <Field label="Admin password" htmlFor="admin-setup-password">
              <Input id="admin-setup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Confirm password" htmlFor="admin-setup-confirm" error={confirm && confirm !== password ? "Passwords don't match" : undefined}>
              <Input id="admin-setup-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            {setup.isError ? <Callout title="Setup failed" variant="error">{setup.error instanceof Error ? setup.error.message : "The admin setup request failed."}</Callout> : null}
            <Button type="submit" variant="aurora" disabled={!canSubmit || setup.isPending} loading={setup.isPending}>
              {setup.isPending ? "Setting up…" : "Create admin"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const login = useMutation({ mutationFn: () => adminApi.login(password), onSuccess });
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-5 py-10 sm:px-6">
      <AccessHeader
        icon={KeyRound}
        eyebrow="Filestash Admin"
        title="Admin Console"
        description="Sign in to manage storage connections, security, and service settings."
        badge="Restricted"
        badgeTone="neutral"
      />
      <Card elevated accent="cyan" className="overflow-hidden">
        <CardContent className="p-6 sm:p-7">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate();
            }}
          >
            <Field label="Password" htmlFor="admin-login-password">
              <Input id="admin-login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </Field>
            {login.isError ? <Callout title="Invalid password" variant="error">Check the admin password and try again.</Callout> : null}
            <Button type="submit" variant="aurora" disabled={login.isPending} loading={login.isPending}>
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

const SECTIONS = ["Settings", "Logs", "Audit"] as const;
type Section = (typeof SECTIONS)[number];

function AdminShell() {
  const [section, setSection] = useState<Section>("Settings");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6">
      <header
        className="flex flex-wrap items-center gap-3 rounded-[var(--aurora-radius-2)] border px-4 py-3"
        style={{
          background: "var(--aurora-panel-medium)",
          borderColor: "var(--aurora-border-default)",
          boxShadow: "var(--aurora-shadow-medium), var(--aurora-highlight-medium)",
        }}
      >
        <div className="grid gap-0.5">
          <p className="aurora-text-eyebrow text-[var(--aurora-text-muted)]">Filestash</p>
          <h1 className="aurora-text-section">Admin Console</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge tone="success" shape="tag" dot>Authenticated</Badge>
          <Badge tone="neutral" shape="tag">{section}</Badge>
        </div>
      </header>
      <Tabs value={section} onValueChange={(value) => setSection(value as Section)}>
        <TabsList aria-label="Admin sections">
          {SECTIONS.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="Settings">
          <SettingsPanel />
        </TabsContent>
        <TabsContent value="Logs">
          <LogsPanel />
        </TabsContent>
        <TabsContent value="Audit">
          <AuditPanel />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function SettingsPanel() {
  const cfg = useQuery({ queryKey: ["admin-config"], queryFn: ({ signal }) => adminApi.getConfig(signal) });
  const runtime = useQuery({ queryKey: ["config"], queryFn: ({ signal }) => configApi.get(signal), staleTime: Infinity });
  const [draft, setDraft] = useState<ConfigTree | null>(null);
  const tree = draft ?? cfg.data ?? null;
  const save = useMutation({
    mutationFn: () => {
      const flat = serializeConfig(tree) as Record<string, unknown>;
      return adminApi.saveConfig({ ...flat, connections: flat.connections ?? runtime.data?.connections ?? [] });
    },
    onSuccess: async () => {
      setDraft(null);
      await Promise.all([cfg.refetch(), runtime.refetch()]);
    },
  });

  const setValue = (path: string[], value: unknown) => {
    setDraft((prev) => {
      const base = structuredClone(prev ?? cfg.data ?? {});
      let node: Record<string, unknown> = base;
      for (let i = 0; i < path.length - 1; i++) node = node[path[i]] as Record<string, unknown>;
      const leaf = node[path[path.length - 1]] as FormElement;
      node[path[path.length - 1]] = { ...leaf, value };
      return base;
    });
  };

  if (cfg.isLoading) return <LoadingPanel label="Loading config" />;
  if (cfg.isError || !tree) {
    return (
          <Callout title="Could not load config" variant="error"><div className="grid gap-3"><span>{cfg.error instanceof Error ? cfg.error.message : "The admin API did not return a usable configuration tree."}</span><Button size="sm" variant="neutral" onClick={() => void cfg.refetch()}>Retry</Button></div></Callout>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="sticky top-3 z-10 flex items-center justify-between rounded-[var(--aurora-radius-2)] border border-[var(--aurora-border-subtle)] bg-[var(--aurora-panel-medium)] px-4 py-3 shadow-[var(--aurora-shadow-medium)] backdrop-blur-xl">
        <div>
          <h2 className="aurora-text-section">Settings</h2>
          <p className="aurora-text-body-sm text-[var(--aurora-text-muted)]">
            Edit the live Filestash configuration tree.
          </p>
        </div>
        <Button variant="aurora" size="sm" loading={save.isPending} onClick={() => save.mutate()}>
          {save.isSuccess ? "Saved" : "Save"}
        </Button>
      </div>
      {save.isError ? <Callout title="Settings were not saved" variant="error"><div className="grid gap-3"><span>{save.error instanceof Error ? save.error.message : "The admin save endpoint returned an error."}</span><Button size="sm" variant="neutral" onClick={() => save.mutate()}>Retry</Button></div></Callout> : null}
      {save.isSuccess ? <Callout title="Settings saved" variant="success">The current configuration was reloaded from the server.</Callout> : null}
      {Object.entries(tree).map(([category, node]) => (
        <Card key={category} elevated className="overflow-hidden">
          <CardHeader>
            <CardTitle as="h3">{category}</CardTitle>
            <CardDescription>Configuration namespace</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfigGroup node={node} path={[category]} onChange={setValue} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ConfigGroup({
  node,
  path,
  onChange,
}: {
  node: unknown;
  path: string[];
  onChange: (path: string[], value: unknown) => void;
}) {
  if (!node || typeof node !== "object") return null;
  return (
    <div className="flex flex-col gap-3">
      {Object.entries(node as Record<string, unknown>).map(([key, child]) => {
        const childPath = [...path, key];
        if (isField(child)) return <ConfigFieldRow key={key} field={child} path={childPath} onChange={onChange} />;
        if (child && typeof child === "object") {
          return (
            <div key={key} className="flex flex-col gap-2">
              <span className="aurora-text-label text-[var(--aurora-text-muted)]">{key}</span>
              <ConfigGroup node={child} path={childPath} onChange={onChange} />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function ConfigFieldRow({
  field,
  path,
  onChange,
}: {
  field: FormElement;
  path: string[];
  onChange: (path: string[], value: unknown) => void;
}) {
  const label = field.label || path[path.length - 1];
  const value = field.value;
  const inputId = `config-${path.join("-").replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  if (field.type === "boolean" || field.type === "enable") {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="aurora-text-ui">{label}</span>
        <Switch aria-label={label} checked={value === true} onCheckedChange={(on: boolean) => onChange(path, on)} />
      </div>
    );
  }
  return (
    <Field label={label} htmlFor={inputId} description={field.description}>
      <Input
        id={inputId}
        type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
        value={value == null ? "" : String(value)}
        placeholder={field.placeholder}
        readOnly={field.readonly}
        onChange={(e) => onChange(path, field.type === "number" ? (e.target.value === "" ? null : e.target.valueAsNumber) : e.target.value)}
      />
    </Field>
  );
}

function LogsPanel() {
  const logs = useQuery({ queryKey: ["admin-logs"], queryFn: ({ signal }) => adminApi.logs(signal) });
  const lines = textToTerminalLines(logs.data || "", logs.isLoading ? "Loading logs..." : logs.isError ? "Couldn't load logs." : "(empty)");

  return (
    <div className="flex flex-col gap-3">
      <h2 className="aurora-text-section">Logs</h2>
      {logs.isError ? (
        <Callout title="Could not load logs" variant="error">
          The admin log endpoint returned an error.
        </Callout>
      ) : null}
      <Terminal title="filestash logs" status={logs.isError ? "error" : logs.isLoading ? "idle" : "connected"} lines={lines} />
    </div>
  );
}

function AuditPanel() {
  const audit = useQuery({ queryKey: ["admin-audit"], queryFn: ({ signal }) => adminApi.audit(signal) });
  const content = audit.isLoading
    ? "Loading audit log..."
    : audit.isError
      ? "Couldn't load audit log."
      : JSON.stringify(audit.data, null, 2);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="aurora-text-section">Audit</h2>
      {audit.isError ? (
        <Callout title="Could not load audit log" variant="error">
          The admin audit endpoint returned an error.
        </Callout>
      ) : null}
      <Terminal title="audit stream" status={audit.isError ? "error" : audit.isLoading ? "idle" : "connected"} lines={textToTerminalLines(content)} />
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{label}</CardTitle>
        <CardDescription>Waiting for the admin API.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </CardContent>
    </Card>
  );
}

function textToTerminalLines(text: string, fallback?: string): TerminalLine[] {
  const source = text.trim() || fallback || "";
  return source.split("\n").filter(Boolean).map((line) => ({
    text: line,
    type: /error|fail|denied/i.test(line) ? "error" : /warn/i.test(line) ? "warn" : "output",
  }));
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
