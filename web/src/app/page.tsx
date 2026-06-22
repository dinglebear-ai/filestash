import { Button } from "@/registry/aurora/ui/button";
import { Badge } from "@/registry/aurora/ui/badge";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6">
      <div className="flex flex-col gap-2">
        <h1 className="aurora-text-display-2">Filestash</h1>
        <p className="aurora-text-body text-[var(--aurora-text-muted)]">
          Next.js + Aurora frontend — foundation scaffold.
        </p>
      </div>

      <div
        className="flex flex-col gap-5 rounded-[var(--aurora-radius-3)] p-6"
        style={{
          background: "var(--aurora-panel-strong)",
          borderColor: "var(--aurora-border-strong)",
          borderWidth: 1,
          boxShadow: "var(--aurora-shadow-strong), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="aurora">Connect storage</Button>
          <Button variant="rose">New share</Button>
          <Button variant="neutral">Settings</Button>
          <Button variant="ghost">Cancel</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">Connected</Badge>
          <Badge tone="info">Syncing</Badge>
          <Badge tone="warn">Read-only</Badge>
          <Badge tone="violet">AI</Badge>
        </div>
      </div>
    </main>
  );
}
