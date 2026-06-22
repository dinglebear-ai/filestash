"use client";

// Client-side router for the single-shell SPA. The Go server serves one shell
// (index.frontoffice.html / index.backoffice.html) for every front/back-office
// route, so routing happens here based on the live URL. Route prefixes mirror the
// existing Filestash routes (server/ctrl/static.go allowlist).
import { usePathname } from "next/navigation";
import { Placeholder } from "@/screens/placeholder";

export function AppRouter() {
  const pathname = usePathname() || "/";

  // Back office.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <Placeholder name="Admin" />;
  }

  // Front office (mirrors ServeFrontofficeHandler's allowlist).
  if (pathname === "/") return <Placeholder name="Home" />;
  if (pathname === "/login") return <Placeholder name="Connect / Login" />;
  if (pathname === "/logout") return <Placeholder name="Logout" />;
  if (pathname.startsWith("/files")) return <Placeholder name="Files" />;
  if (pathname.startsWith("/view")) return <Placeholder name="Viewer" />;
  if (pathname.startsWith("/s/")) return <Placeholder name="Shared link" />;
  if (pathname.startsWith("/tags")) return <Placeholder name="Tags" />;

  return <Placeholder name="Not found" />;
}
