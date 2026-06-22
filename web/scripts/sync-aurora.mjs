#!/usr/bin/env node
// Vendors the Aurora design system into this app.
//
// Aurora is consumed as vendored copies synced FROM its source of truth (the
// shadcn registry at ~/workspace/aurora-design-system). Components import each
// other via `@/registry/aurora/...` and `@/lib/utils`, so we preserve that exact
// layout under src/ — no path rewriting, no shadcn-add transforms. Re-run this to
// pull upstream Aurora changes. Do NOT hand-edit vendored files (fix Aurora source
// upstream, then re-sync).
//
// Usage: node scripts/sync-aurora.mjs [--src <aurora-repo>]
import { readFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const argSrc = process.argv.indexOf("--src");
const AURORA_SRC = resolve(
  argSrc !== -1 ? process.argv[argSrc + 1] : process.env.AURORA_SRC ?? join(homedir(), "workspace/aurora-design-system"),
);
const APP_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const DEST_ROOT = join(APP_ROOT, "src");

if (!existsSync(join(AURORA_SRC, "registry.json"))) {
  console.error(`Aurora source not found at ${AURORA_SRC} (pass --src or set AURORA_SRC).`);
  process.exit(1);
}

const registry = JSON.parse(readFileSync(join(AURORA_SRC, "registry.json"), "utf8"));
const items = registry.items ?? registry;

const copy = (rel) => {
  const from = join(AURORA_SRC, rel);
  const to = join(DEST_ROOT, rel);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
};

let files = 0;
const npmDeps = new Set();
for (const item of items) {
  for (const f of item.files ?? []) {
    if (!f.path?.startsWith("registry/aurora/")) continue;
    copy(f.path);
    files++;
  }
  for (const d of item.dependencies ?? []) npmDeps.add(d);
}

// The `cn` helper every component imports via `@/lib/utils`.
copy("lib/utils.ts");
npmDeps.add("clsx").add("tailwind-merge");

console.log(`Synced ${files} Aurora files + lib/utils.ts from ${AURORA_SRC}`);
console.log(`npm deps (${npmDeps.size}):`);
console.log([...npmDeps].sort().join(" "));
