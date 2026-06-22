"use client";

// File viewer — faithful port of the viewer page. Resolves the opener from the
// file extension via config.mime (same logic as the legacy mimetype.js), then
// renders the matching viewer. Core viewers are implemented; heavier/niche ones
// (3d, map, ebook, table, form, office) currently fall back to download and are
// being ported iteratively.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Download } from "lucide-react";
import { filesApi } from "@/lib/api/endpoints";
import { useConfig } from "@/lib/config/config-context";
import { Button } from "@/registry/aurora/ui/button";

// Heavy/niche viewers are lazy-loaded (client-only) so the base bundle stays small.
const loading = () => <p className="aurora-text-meta">Loading…</p>;
const TableViewer = dynamic(() => import("@/screens/viewers/table"), { ssr: false, loading });
const FormViewer = dynamic(() => import("@/screens/viewers/form"), { ssr: false, loading });
const ThreeViewer = dynamic(() => import("@/screens/viewers/three"), { ssr: false, loading });
const EbookViewer = dynamic(() => import("@/screens/viewers/ebook"), { ssr: false, loading });
const MapViewer = dynamic(() => import("@/screens/viewers/map"), { ssr: false, loading });

type Mimes = Record<string, string>;
const THREE_D_EXT = new Set(["stl", "obj", "ply", "gltf", "glb"]);
const TABLE_EXT = new Set(["csv", "tsv"]);

const extOf = (file: string) => file.split(".").slice(-1)[0]?.toLowerCase() ?? "";

function getMimeType(file: string, mimes: Mimes): string {
  return mimes[extOf(file)] ?? "text/plain";
}

/** Faithful to legacy mimetype.js opener() (minus dropped frontend plugins), with
 *  extension overrides for the formerly plugin-driven 3d/table viewers. */
function opener(file: string, mimes: Mimes): string {
  const ext = extOf(file);
  if (THREE_D_EXT.has(ext)) return "3d";
  if (TABLE_EXT.has(ext)) return "table";
  const mime = getMimeType(file, mimes);
  const type = mime.split("/")[0];
  if (type === "text") return "editor";
  if (mime === "application/pdf") return "pdf";
  if (type === "image") return "image";
  if (["application/javascript", "application/xml", "application/json", "application/x-perl"].includes(mime))
    return "editor";
  if (["audio/wave", "audio/mp3", "audio/flac", "audio/ogg", "audio/mpeg"].includes(mime)) return "audio";
  if (mime === "application/x-form") return "form";
  if (["application/geo+json", "application/vnd.ogc.wms_xml", "application/vnd.shp"].includes(mime)) return "map";
  if (type === "video" || mime === "application/ogg") return "video";
  if (mime === "application/epub+zip") return "ebook";
  if (mime === "application/x-url") return "url";
  if (type === "application" && mime !== "application/text") return "download";
  return "editor";
}

export function ViewerScreen({ pathname }: { pathname: string }) {
  const router = useRouter();
  const { config } = useConfig();
  const filePath = pathname.replace(/^\/view/, "") || "/";
  const name = filePath.split("/").filter(Boolean).pop() ?? filePath;
  const src = filesApi.catUrl(filePath);
  const mimes = (config.mime as Mimes) ?? {};
  const kind = opener(name, mimes);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Menubar */}
      <header
        className="flex items-center gap-3 px-4 py-2.5"
        style={{
          background: "var(--aurora-panel-medium)",
          borderBottom: "1px solid var(--aurora-border-default)",
          boxShadow: "var(--aurora-shadow-medium)",
        }}
      >
        <Button size="sm" variant="ghost" onClick={() => router.back()}>
          <ArrowLeft size={15} /> Back
        </Button>
        <span className="truncate aurora-text-ui">{name}</span>
        <a className="ml-auto" href={src} download>
          <Button size="sm" variant="neutral">
            <Download size={15} /> Download
          </Button>
        </a>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        <ViewerBody kind={kind} src={src} name={name} ext={extOf(name)} />
      </div>
    </div>
  );
}

function ViewerBody({ kind, src, name, ext }: { kind: string; src: string; name: string; ext: string }) {
  switch (kind) {
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={name} className="max-h-full max-w-full object-contain" />;
    case "video":
      return <video src={src} controls className="max-h-full max-w-full" />;
    case "audio":
      return <audio src={src} controls className="w-full max-w-xl" />;
    case "pdf":
      return <iframe src={src} title={name} className="h-full w-full" style={{ border: 0 }} />;
    case "editor":
      return <TextViewer src={src} />;
    case "url":
      return <UrlViewer src={src} />;
    case "table":
      return <TableViewer src={src} />;
    case "form":
      return <FormViewer src={src} />;
    case "3d":
      return <ThreeViewer src={src} ext={ext} />;
    case "ebook":
      return <EbookViewer src={src} />;
    case "map":
      return <MapViewer src={src} />;
    default:
      return <DownloadFallback src={src} name={name} kind={kind} />;
  }
}

function TextViewer({ src }: { src: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch(src, { credentials: "include" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`failed (${r.status})`))))
      .then((t) => active && setText(t))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [src]);
  if (error) return <p className="aurora-text-body text-[var(--aurora-error)]">{error}</p>;
  if (text === null) return <p className="aurora-text-meta">Loading…</p>;
  return (
    <pre
      className="h-full w-full overflow-auto rounded-[8px] p-4 aurora-text-code"
      style={{ background: "var(--aurora-panel-strong)", border: "1px solid var(--aurora-border-default)" }}
    >
      {text}
    </pre>
  );
}

function UrlViewer({ src }: { src: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch(src, { credentials: "include" })
      .then((r) => r.text())
      .then(setUrl)
      .catch(() => setUrl(null));
  }, [src]);
  if (!url) return <p className="aurora-text-meta">Loading…</p>;
  return (
    <a className="aurora-text-body text-[var(--aurora-accent-primary)]" href={url.trim()} target="_blank" rel="noreferrer">
      {url.trim()}
    </a>
  );
}

function DownloadFallback({ src, name, kind }: { src: string; name: string; kind: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="aurora-text-section">{name}</p>
      <p className="aurora-text-body text-[var(--aurora-text-muted)]">
        In-app preview for “{kind}” files is being ported. You can download it for now.
      </p>
      <a href={src} download>
        <Button variant="aurora">
          <Download size={15} /> Download
        </Button>
      </a>
    </div>
  );
}
