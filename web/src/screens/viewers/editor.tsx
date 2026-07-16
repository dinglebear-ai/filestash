"use client";

// Code/text editor (legacy application_editor) via CodeMirror 6: syntax highlight
// by file extension, edit, and save (Ctrl/Cmd-S or the Save button -> POST cat).
import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import type { Extension } from "@codemirror/state";
import { filesApi } from "@/lib/api/endpoints";
import { Button } from "@/registry/aurora/ui/button";
import { Callout } from "@/registry/aurora/ui/callout";

async function languageExtension(ext: string): Promise<Extension[]> {
  if (["js", "jsx", "mjs", "cjs", "ts", "tsx"].includes(ext)) {
    const { javascript } = await import("@codemirror/lang-javascript");
    return [javascript({ typescript: ext === "ts" || ext === "tsx", jsx: ext === "jsx" || ext === "tsx" })];
  }
  if (ext === "json") return [(await import("@codemirror/lang-json")).json()];
  if (["html", "htm"].includes(ext)) return [(await import("@codemirror/lang-html")).html()];
  if (["css", "scss", "sass", "less"].includes(ext)) return [(await import("@codemirror/lang-css")).css()];
  if (["md", "markdown"].includes(ext)) return [(await import("@codemirror/lang-markdown")).markdown()];
  if (ext === "py") return [(await import("@codemirror/lang-python")).python()];
  if (ext === "sql") return [(await import("@codemirror/lang-sql")).sql()];
  if (ext === "xml") return [(await import("@codemirror/lang-xml")).xml()];
  return [];
}

export default function EditorViewer({ src, path }: { src: string; path: string }) {
  const [document, setDocument] = useState<{ src: string; value: string } | null>(null);
  const [loadError, setLoadError] = useState<{ src: string; message: string } | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [extensions, setExtensions] = useState<Extension[]>([]);

  const ext = path.split(".").slice(-1)[0]?.toLowerCase() ?? "";
  const value = document?.src === src ? document.value : null;
  const error = loadError?.src === src ? loadError.message : null;

  useEffect(() => {
    let active = true;
    void languageExtension(ext).then((loaded) => active && setExtensions(loaded));
    return () => { active = false; };
  }, [ext]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(src, { credentials: "include", signal: controller.signal })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`failed (${r.status})`))))
      .then((text) => setDocument({ src, value: text }))
      .catch((cause: Error) => { if (cause.name !== "AbortError") setLoadError({ src, message: cause.message }); });
    return () => controller.abort();
  }, [src]);

  const save = async () => {
    if (value == null) return;
    setSaveState("saving");
    try {
      if (document?.src !== src) return;
      await filesApi.save(path, document.value);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("error");
    }
  };

  if (error) return <Callout title="Could not load editor" variant="error">{error}</Callout>;
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
        {saveState === "error" ? <Callout title="Changes were not saved" variant="error">Check the connection and retry.</Callout> : null}
        <CodeMirror
          value={value}
          theme={tokyoNight}
          extensions={extensions}
          onChange={(nextValue) => setDocument({ src, value: nextValue })}
          height="100%"
          style={{ height: "100%", fontSize: 13 }}
        />
      </div>
    </div>
  );
}
