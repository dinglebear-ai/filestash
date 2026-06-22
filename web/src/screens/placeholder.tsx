// Temporary placeholder for screens not yet ported. Each is replaced by a faithful
// Aurora port (connect → files → viewers → share → admin).
export function Placeholder({ name }: { name: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="aurora-text-eyebrow text-[var(--aurora-text-muted)]">filestash</p>
      <h1 className="aurora-text-section">{name}</h1>
      <p className="aurora-text-body text-[var(--aurora-text-muted)]">
        Not ported yet — coming as part of the Aurora migration.
      </p>
    </main>
  );
}
