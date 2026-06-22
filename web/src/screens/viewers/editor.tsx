"use client";

// Code/text editor (legacy application_editor) via CodeMirror 6: syntax highlight
// by file extension, edit, and save (Ctrl/Cmd-S or the Save button -> POST cat).
import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import { loadLanguage, type LanguageName } from "@uiw/codemirror-extensions-langs";
import { filesApi } from "@/lib/api/endpoints";
import { Button } from "@/registry/aurora/ui/button";

// Map file extensions to CodeMirror language names (@uiw langs uses short names).
const EXT_LANG: Record<string, string> = {
  js: "js", jsx: "jsx", ts: "ts", tsx: "tsx", mjs: "js", cjs: "js",
  json: "json", html: "html", htm: "html", css: "css", scss: "sass", sass: "sass", less: "less",
  md: "markdown", markdown: "markdown", py: "python", rb: "ruby", go: "go", rs: "rust",
  java: "java", c: "c", h: "c", cpp: "cpp", cc: "cpp", cs: "csharp", php: "php", swift: "swift",
  kt: "kotlin", sh: "shell", bash: "shell", zsh: "shell", yaml: "yaml", yml: "yaml", toml: "toml",
  xml: "xml", sql: "sql", lua: "lua", r: "r", dockerfile: "dockerfile",
};

export default function EditorViewer({ src, path }: { src: string; path: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const ext = path.split(".").slice(-1)[0]?.toLowerCase() ?? "";
  const extensions = useMemo(() => {
    const lang = EXT_LANG[ext];
    const l = lang ? loadLanguage(lang as LanguageName) : null;
    return l ? [l] : [];
  }, [ext]);

  useEffect(() => {
    let active = true;
    fetch(src, { credentials: "include" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`failed (${r.status})`))))
      .then((t) => active && setValue(t))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [src]);

  const save = async () => {
    if (value == null) return;
    setSaveState("saving");
    try {
      await filesApi.save(path, value);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("error");
    }
  };

  if (error) return <p className="aurora-text-body text-[var(--aurora-error)]">{error}</p>;
  if (value == null) return <p className="aurora-text-meta">Loading…</p>;

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-[8px]"
      style={{ border: "1px solid var(--aurora-border-default)" }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div
        className="flex items-center justify-end gap-2 px-3 py-1.5"
        style={{ background: "var(--aurora-panel-medium)", borderBottom: "1px solid var(--aurora-border-default)" }}
      >
        <span className="mr-auto aurora-text-meta">{ext || "text"}</span>
        <Button size="sm" variant="aurora" disabled={saveState === "saving"} onClick={() => void save()}>
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Retry" : "Save"}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <CodeMirror
          value={value}
          theme={tokyoNight}
          extensions={extensions}
          onChange={(v) => setValue(v)}
          height="100%"
          style={{ height: "100%", fontSize: 13 }}
        />
      </div>
    </div>
  );
}
