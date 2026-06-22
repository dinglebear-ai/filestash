"use client";

// Client-side router for the single-shell SPA. The Go server serves one shell
// (index.frontoffice.html / index.backoffice.html) for every front/back-office
// route, so routing happens here based on the live URL. Route prefixes mirror the
// existing Filestash routes (server/ctrl/static.go allowlist).
import { usePathname } from "next/navigation";
import { Placeholder } from "@/screens/placeholder";
import { ConnectScreen } from "@/screens/connect";
import { FilesScreen } from "@/screens/files";
import { ViewerScreen } from "@/screens/viewer";
import { LogoutScreen } from "@/screens/logout";
import { AdminScreen } from "@/screens/admin";
import { ShareScreen } from "@/screens/share";

export function AppRouter() {
  const pathname = usePathname() || "/";

  // Back office.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <AdminScreen />;
  }

  // Front office (mirrors ServeFrontofficeHandler's allowlist).
  if (pathname === "/" || pathname === "/login") return <ConnectScreen />;
  if (pathname === "/logout") return <LogoutScreen />;
  if (pathname.startsWith("/files")) return <FilesScreen pathname={pathname} />;
  if (pathname.startsWith("/view")) return <ViewerScreen pathname={pathname} />;
  if (pathname.startsWith("/s/")) return <ShareScreen pathname={pathname} />;
  // /tags is inactive in the legacy frontend (route commented out) — not ported.

  return <Placeholder name="Not found" />;
}
