"use client";

// Admin backoffice — faithful port of the back office. Password gate
// (/admin/api/session), then sections: Settings (the config tree editor),
// Logs, and Audit. Config nodes share the FormElement shape used elsewhere.
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import bcrypt from "bcryptjs";
import { adminApi } from "@/lib/api/endpoints";
import type { FormElement } from "@/lib/api/types";
import { Button } from "@/registry/aurora/ui/button";
import { Input } from "@/registry/aurora/ui/input";
import { Field } from "@/registry/aurora/ui/field";
import { Switch } from "@/registry/aurora/ui/switch";

type ConfigTree = Record<string, unknown>;
const isField = (n: unknown): n is FormElement =>
  typeof n === "object" && n !== null && typeof (n as { type?: unknown }).type === "string";

// The admin config API returns nested FormElements ({label,type,value,...}); the
// save endpoint expects flat values. Collapse each field node to its value before
// POSTing (mirrors the legacy reshapeConfigBeforeSave / formObjToJSON$).
function flattenConfig(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(flattenConfig);
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.type === "string" && "value" in o) return o.value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = flattenConfig(v);
    return out;
  }
  return node;
}

export function AdminScreen() {
  const queryClient = useQueryClient();
  const pathname = usePathname() || "";
  const session = useQuery({ queryKey: ["admin-session"], queryFn: ({ signal }) => adminApi.session(signal) });

  // First-run: the Go backoffice handler redirects here when no admin is set.
  if (pathname.replace(/\/$/, "").endsWith("/setup")) {
    return <AdminSetup onDone={() => queryClient.invalidateQueries({ queryKey: ["admin-session"] })} />;
  }
  if (session.isLoading) return <Centered>Loading…</Centered>;
  if (!session.data) {
    return <AdminLogin onSuccess={() => queryClient.invalidateQueries({ queryKey: ["admin-session"] })} />;
  }
  return <AdminShell />;
}

function AdminSetup({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const setup = useMutation({
    mutationFn: async () => {
      // Faithful to the legacy flow: client bcrypt-hashes the password, writes it
      // into the config (allowed pre-admin), then authenticates. AdminOnly skips
      // auth while auth.admin is unset.
      const cfg = (await adminApi.getConfig()) as Record<string, Record<string, Record<string, unknown>>>;
      if (cfg.auth?.admin) cfg.auth.admin.value = bcrypt.hashSync(password, 10);
      await adminApi.saveConfig(flattenConfig(cfg));
      await adminApi.login(password);
    },
    onSuccess: () => {
      onDone();
      router.replace("/admin/");
    },
  });

  const canSubmit = password.length > 0 && password === confirm;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-5 px-6">
      <header className="flex flex-col gap-1 text-center">
        <p className="aurora-text-eyebrow text-[var(--aurora-text-muted)]">filestash</p>
        <h1 className="aurora-text-section">Set up your admin password</h1>
      </header>
      <form
        className="flex flex-col gap-4 rounded-[var(--aurora-radius-3)] p-6"
        style={{ background: "var(--aurora-panel-strong)", border: "1px solid var(--aurora-border-strong)" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) setup.mutate();
        }}
      >
        <Field label="Admin password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        <Field label="Confirm password" error={confirm && confirm !== password ? "Passwords don't match" : undefined}>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {setup.isError ? <p className="aurora-text-body-sm text-[var(--aurora-error)]">Setup failed. Try again.</p> : null}
        <Button type="submit" variant="aurora" disabled={!canSubmit || setup.isPending}>
          {setup.isPending ? "Setting up…" : "Create admin"}
        </Button>
      </form>
    </main>
  );
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const login = useMutation({ mutationFn: () => adminApi.login(password), onSuccess });
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-5 px-6">
      <h1 className="aurora-text-section text-center">Admin console</h1>
      <form
        className="flex flex-col gap-4 rounded-[var(--aurora-radius-3)] p-6"
        style={{ background: "var(--aurora-panel-strong)", border: "1px solid var(--aurora-border-strong)" }}
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        {login.isError ? <p className="aurora-text-body-sm text-[var(--aurora-error)]">Invalid password.</p> : null}
        <Button type="submit" variant="aurora" disabled={login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}

const SECTIONS = ["Settings", "Logs", "Audit"] as const;
type Section = (typeof SECTIONS)[number];

function AdminShell() {
  const [section, setSection] = useState<Section>("Settings");
  return (
    <div className="flex min-h-dvh">
      <nav
        className="aurora-nav-shell flex w-52 shrink-0 flex-col gap-1 p-4"
        style={{ borderRight: "1px solid var(--aurora-border-default)" }}
      >
        <p className="aurora-text-eyebrow mb-2 text-[var(--aurora-text-muted)]">admin</p>
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className="rounded-[var(--aurora-radius-1)] px-3 py-2 text-left aurora-text-ui"
            style={
              s === section
                ? { background: "var(--aurora-hover-bg)", color: "var(--aurora-text-primary)" }
                : { color: "var(--aurora-text-muted)" }
            }
          >
            {s}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto p-6">
        {section === "Settings" ? <SettingsPanel /> : section === "Logs" ? <LogsPanel /> : <AuditPanel />}
      </div>
    </div>
  );
}

function SettingsPanel() {
  const cfg = useQuery({ queryKey: ["admin-config"], queryFn: ({ signal }) => adminApi.getConfig(signal) });
  const [draft, setDraft] = useState<ConfigTree | null>(null);
  const tree = draft ?? cfg.data ?? null;
  const save = useMutation({ mutationFn: () => adminApi.saveConfig(flattenConfig(tree)) });

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

  if (cfg.isLoading) return <Centered>Loading config…</Centered>;
  if (cfg.isError || !tree) return <Centered>Couldn&apos;t load config.</Centered>;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="aurora-text-section">Settings</h2>
        <Button variant="aurora" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : save.isSuccess ? "Saved" : "Save"}
        </Button>
      </div>
      {Object.entries(tree).map(([category, node]) => (
        <section key={category} className="flex flex-col gap-3">
          <h3 className="aurora-text-eyebrow text-[var(--aurora-text-muted)]">{category}</h3>
          <ConfigGroup node={node} path={[category]} onChange={setValue} />
        </section>
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
    <div className="flex flex-col gap-3 rounded-[8px] p-4" style={{ background: "var(--aurora-panel-strong)", border: "1px solid var(--aurora-border-default)" }}>
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

  if (field.type === "boolean" || field.type === "enable") {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="aurora-text-ui">{label}</span>
        <Switch checked={value === true} onCheckedChange={(on: boolean) => onChange(path, on)} />
      </div>
    );
  }
  return (
    <Field label={label} description={field.description}>
      <Input
        type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
        defaultValue={value == null ? "" : String(value)}
        placeholder={field.placeholder}
        onChange={(e) => onChange(path, e.target.value)}
      />
    </Field>
  );
}

function LogsPanel() {
  const logs = useQuery({ queryKey: ["admin-logs"], queryFn: ({ signal }) => adminApi.logs(signal) });
  return (
    <div className="flex flex-col gap-3">
      <h2 className="aurora-text-section">Logs</h2>
      <pre
        className="overflow-auto rounded-[8px] p-4 aurora-text-code"
        style={{ background: "var(--aurora-panel-strong)", border: "1px solid var(--aurora-border-default)", maxHeight: "75vh" }}
      >
        {logs.isLoading ? "Loading…" : logs.isError ? "Couldn't load logs." : (logs.data as string) || "(empty)"}
      </pre>
    </div>
  );
}

function AuditPanel() {
  const audit = useQuery({ queryKey: ["admin-audit"], queryFn: ({ signal }) => adminApi.audit(signal) });
  return (
    <div className="flex flex-col gap-3">
      <h2 className="aurora-text-section">Audit</h2>
      <pre
        className="overflow-auto rounded-[8px] p-4 aurora-text-code"
        style={{ background: "var(--aurora-panel-strong)", border: "1px solid var(--aurora-border-default)", maxHeight: "75vh" }}
      >
        {audit.isLoading ? "Loading…" : audit.isError ? "Couldn't load audit log." : JSON.stringify(audit.data, null, 2)}
      </pre>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <p className="aurora-text-body text-[var(--aurora-text-muted)]">{children}</p>
    </main>
  );
}
