"use client";

import { useEffect, useRef, useState } from "react";
import type { PluginApplication } from "@/lib/api/types";
import { filesApi } from "@/lib/api/endpoints";
import { Callout } from "@/registry/aurora/ui/callout";

export interface ReactViewerPluginV1 {
  apiVersion: "filestash-react-viewer-v1";
  mount(root: HTMLElement, context: {
    name: string;
    mime: string;
    path: string;
    readUrl: string;
    read: () => Promise<ArrayBuffer>;
    save: (content: string | Blob) => Promise<void>;
  }): void | (() => void) | Promise<void | (() => void)>;
}

export function PluginViewer({ application, entrypoint, name, mime, path, src }: { application: PluginApplication; entrypoint: string; name: string; mime: string; path: string; src: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (application !== "filestash-react-viewer-v1" || !rootRef.current) return;
    let active = true;
    let cleanup: void | (() => void);
    const root = rootRef.current;
    void import(/* webpackIgnore: true */ entrypoint).then(async (module: { default?: ReactViewerPluginV1; plugin?: ReactViewerPluginV1 }) => {
      const plugin = module.plugin ?? module.default;
      if (!plugin || plugin.apiVersion !== "filestash-react-viewer-v1") throw new Error("The plugin does not implement the Filestash React viewer v1 contract.");
      cleanup = await plugin.mount(root, {
        name, mime, path, readUrl: src,
        read: async () => {
          const response = await fetch(src, { credentials: "include" });
          if (!response.ok) throw new Error(`read failed (${response.status})`);
          return response.arrayBuffer();
        },
        save: (content) => typeof content === "string" ? filesApi.save(path, content) : filesApi.upload(path, content),
      });
      if (!active) cleanup?.();
    }).catch((cause: Error) => active && setFailure(cause.message));
    return () => { active = false; cleanup?.(); root.replaceChildren(); };
  }, [application, entrypoint, mime, name, path, src]);

  if (application === "iframe") {
    const url = new URL(entrypoint, window.location.href);
    url.searchParams.set("src", src);
    url.searchParams.set("name", name);
    url.searchParams.set("mime", mime);
    return <iframe className="h-full w-full border-0" src={url.toString()} title={name} sandbox="allow-scripts allow-forms allow-downloads" />;
  }
  if (application !== "filestash-react-viewer-v1") {
    return <Callout title="Legacy viewer plugin" variant="warn">This plugin targets the legacy {application} host and cannot run inside the React viewer. Download the file or install a filestash-react-viewer-v1 plugin.</Callout>;
  }
  if (failure) return <Callout title="Viewer plugin failed" variant="error">{failure}</Callout>;
  return <div ref={rootRef} className="h-full w-full" />;
}
