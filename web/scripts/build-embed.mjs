#!/usr/bin/env node
// Builds the Next static export and stages it into ../public for `//go:embed public`.
//
// Path mapping (matches next.config assetPrefix "/assets" + the Go ServeFile route):
//   out/_next/**        -> public/assets/_next/**     (served at /assets/_next/* by Go)
//   out/index.html      -> public/index.frontoffice.html  (SPA shell, front office)
//   out/index.html      -> public/index.backoffice.html   (SPA shell, back office)
//
// This is the CUTOVER step — it overwrites the legacy frontend shells. It is
// destructive to the legacy vanilla-JS entry points (recoverable via git). Guarded
// behind --apply so a bare run only reports what it would do.
import { execSync } from "node:child_process";
import { cpSync, rmSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

const APP_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const OUT = join(APP_ROOT, "out");
const PUBLIC = resolve(APP_ROOT, "..", "public");
const APPLY = process.argv.includes("--apply");
const SKIP_BUILD = process.argv.includes("--skip-build");

function prepareShell(source) {
  const html = readFileSync(source, "utf8");
  const boot = '<base href="{{.base}}"><script>window.__FILESTASH_BOOT__={base:"{{.base}}",version:"{{.version}}"}</script>';
  return html.replace("<head>", `<head>${boot}`);
}

function compressTree(root) {
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) { compressTree(path); continue; }
    if (!/\.(?:css|html|js|json|svg|txt|wasm)$/.test(path) || statSync(path).size < 1024) continue;
    const data = readFileSync(path);
    writeFileSync(`${path}.gz`, gzipSync(data, { level: 9 }));
    writeFileSync(`${path}.br`, brotliCompressSync(data, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }));
  }
}

if (!SKIP_BUILD) {
  console.log("> next build");
  execSync("next build", { cwd: APP_ROOT, stdio: "inherit" });
}
if (!existsSync(join(OUT, "index.html"))) {
  console.error(`No export found at ${OUT}/index.html — run the build first.`);
  process.exit(1);
}

const steps = [
  { from: join(OUT, "_next"), to: join(PUBLIC, "assets", "_next"), dir: true },
  { from: join(OUT, "index.html"), to: join(PUBLIC, "index.frontoffice.html") },
  { from: join(OUT, "index.html"), to: join(PUBLIC, "index.backoffice.html") },
];

for (const s of steps) {
  console.log(`${APPLY ? "copy" : "would copy"}: ${s.from} -> ${s.to}`);
  if (!APPLY) continue;
  if (s.dir) {
    rmSync(s.to, { recursive: true, force: true });
    mkdirSync(dirname(s.to), { recursive: true });
    cpSync(s.from, s.to, { recursive: true });
  } else {
    mkdirSync(dirname(s.to), { recursive: true });
      if (s.from.endsWith("index.html")) writeFileSync(s.to, prepareShell(s.from));
      else copyFileSync(s.from, s.to);
  }
}

if (APPLY) compressTree(join(PUBLIC, "assets", "_next"));

console.log(APPLY ? "Staged export into public/." : "Dry run — pass --apply to write into public/.");
