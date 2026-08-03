import type { LucideIcon } from "lucide-react";
import { Badge, type BadgeTone } from "@/registry/aurora/ui/badge";

export function AccessHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  badge,
  badgeTone = "info",
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description?: string;
  badge?: string;
  badgeTone?: BadgeTone;
}) {
  return (
    <header className="grid justify-items-center gap-3 text-center">
      <div
        className="flex size-12 items-center justify-center rounded-[var(--aurora-radius-1)] border"
        style={{
          color: "var(--aurora-accent-primary)",
          background: "var(--aurora-accent-primary-surface)",
          borderColor: "var(--aurora-accent-primary-border)",
          boxShadow: "var(--aurora-active-glow), var(--aurora-highlight-medium)",
        }}
        aria-hidden="true"
      >
        <Icon size={22} strokeWidth={1.6} />
      </div>
      <div className="grid justify-items-center gap-1.5">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <p className="aurora-text-eyebrow text-[var(--aurora-text-muted)]">{eyebrow}</p>
          {badge ? <Badge tone={badgeTone} shape="tag" size="sm">{badge}</Badge> : null}
        </div>
        <h1 className="aurora-text-display-2">{title}</h1>
        {description ? (
          <p className="max-w-sm aurora-text-body-sm text-[var(--aurora-text-muted)]">{description}</p>
        ) : null}
      </div>
    </header>
  );
}
