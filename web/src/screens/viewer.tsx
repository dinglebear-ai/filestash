"use client";

// File viewer — faithful port of the viewer page. Resolves the opener from the
// file extension via config.mime (same logic as the legacy mimetype.js), then
// renders the matching viewer. Core viewers are implemented; heavier/niche ones
// (3d, map, ebook, table, form, office) currently fall back to download and are
// being ported iteratively.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { ArrowLeft, Download } from "lucide-react";
import { filesApi, pluginApi } from "@/lib/api/endpoints";
import { useConfig } from "@/lib/config/config-context";
import { Button } from "@/registry/aurora/ui/button";
import { EmptyState } from "@/registry/aurora/ui/empty-state";
import { Spinner } from "@/registry/aurora/ui/spinner";
import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/registry/aurora/ui/toolbar";

// Heavy/niche viewers are lazy-loaded (client-only) so the base bundle stays small.
const loading = () => (
  <div className="flex items-center gap-2 aurora-text-meta">
    <Spinner size="sm" />
    Loading
  </div>
);
const TableViewer = dynamic(() => import("@/screens/viewers/table"), { ssr: false, loading });
const FormViewer = dynamic(() => import("@/screens/viewers/form"), { ssr: false, loading });
const ThreeViewer = dynamic(() => import("@/screens/viewers/three"), { ssr: false, loading });
const EbookViewer = dynamic(() => import("@/screens/viewers/ebook"), { ssr: false, loading });
const MapViewer = dynamic(() => import("@/screens/viewers/map"), { ssr: false, loading });
const EditorViewer = dynamic(() => import("@/screens/viewers/editor"), { ssr: false, loading });
const PluginViewer = dynamic(() => import("@/screens/viewers/plugin").then((module) => module.PluginViewer), { ssr: false, loading });

type Mimes = Record<string, string>;
const THREE_D_EXT = new Set(["stl", "obj", "ply", "gltf", "glb"]);
const TABLE_EXT = new Set(["csv", "tsv"]);

export const extOf = (file: string) => file.split(".").slice(-1)[0]?.toLowerCase() ?? "";

export function getMimeType(file: string, mimes: Mimes): string {
  return mimes[extOf(file)] ?? "text/plain";
}

/** Built-in opener used when no versioned runtime plugin claims the MIME type. */
export function opener(file: string, mimes: Mimes): string {
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
  const mime = getMimeType(name, mimes);
  const plugins = useQuery({ queryKey: ["viewer-plugins"], queryFn: ({ signal }) => pluginApi.list(signal), staleTime: Infinity });
  const plugin = plugins.data?.[mime];

  return (
    <div className="flex min-h-dvh flex-col">
      <Toolbar>
        <ToolbarGroup>
          <Button size="sm" variant="ghost" onClick={() => router.back()}>
            <ArrowLeft size={15} /> Back
          </Button>
        </ToolbarGroup>
        <ToolbarSeparator />
        <span className="min-w-0 flex-1 truncate aurora-text-ui">{name}</span>
        <ToolbarGroup>
          <a href={src} download>
            <Button size="sm" variant="neutral">
              <Download size={15} /> Download
            </Button>
          </a>
        </ToolbarGroup>
      </Toolbar>

      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        <ViewerBody kind={plugin ? "plugin" : kind} src={src} name={name} ext={extOf(name)} path={filePath} mime={mime} plugin={plugin} />
      </div>
    </div>
  );
}

function ViewerBody({
  kind,
  src,
  name,
  ext,
  path,
  mime,
  plugin,
}: {
  kind: string;
  src: string;
  name: string;
  ext: string;
  path: string;
  mime: string;
  plugin?: readonly [string, string];
}) {
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
      return <EditorViewer src={src} path={path} />;
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
    case "plugin":
      return plugin ? <PluginViewer application={plugin[0]} entrypoint={plugin[1]} name={name} mime={mime} path={path} src={src} /> : null;
    default:
      return <DownloadFallback src={src} name={name} kind={kind} />;
  }
}

function UrlViewer({ src }: { src: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch(src, { credentials: "include" })
      .then((r) => r.text())
      .then(setUrl)
      .catch(() => setUrl(null));
  }, [src]);
  if (!url) {
    return (
      <div className="flex items-center gap-2 aurora-text-meta">
        <Spinner size="sm" />
        Loading
      </div>
    );
  }
  return (
    <a className="aurora-text-body text-[var(--aurora-accent-primary)]" href={url.trim()} target="_blank" rel="noreferrer">
      {url.trim()}
    </a>
  );
}

function DownloadFallback({ src, name, kind }: { src: string; name: string; kind: string }) {
  return (
    <EmptyState
      icon={<Download size={22} />}
      title={name}
      description={`In-app preview for ${kind} files is being ported. You can download it for now.`}
    >
      <a href={src} download>
        <Button variant="aurora">
          <Download size={15} /> Download
        </Button>
      </a>
    </EmptyState>
  );
}
