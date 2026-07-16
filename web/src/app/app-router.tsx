"use client";

// Client-side router for the single-shell SPA. The Go server serves one shell
// (index.frontoffice.html / index.backoffice.html) for every front/back-office
// route, so routing happens here based on the live URL. Route prefixes mirror the
// existing Filestash routes (server/ctrl/static.go allowlist).
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { trimBase } from "@/lib/paths";

const AdminScreen = dynamic(() => import("@/screens/admin").then((mod) => mod.AdminScreen), { loading: RouteLoading });
const ConnectScreen = dynamic(() => import("@/screens/connect").then((mod) => mod.ConnectScreen), { loading: RouteLoading });
const FilesScreen = dynamic(() => import("@/screens/files").then((mod) => mod.FilesScreen), { loading: RouteLoading });
const LogoutScreen = dynamic(() => import("@/screens/logout").then((mod) => mod.LogoutScreen), { loading: RouteLoading });
const Placeholder = dynamic(() => import("@/screens/placeholder").then((mod) => mod.Placeholder), { loading: RouteLoading });
const ShareScreen = dynamic(() => import("@/screens/share").then((mod) => mod.ShareScreen), { loading: RouteLoading });
const ViewerScreen = dynamic(() => import("@/screens/viewer").then((mod) => mod.ViewerScreen), { loading: RouteLoading });

export function AppRouter() {
  const pathname = trimBase(usePathname() || "/");

  // Back office.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <AdminScreen pathname={pathname} />;
  }

  // Front office (mirrors ServeFrontofficeHandler's allowlist).
  if (pathname === "/" || pathname === "/login") return <ConnectScreen />;
  if (pathname === "/logout") return <LogoutScreen />;
  if (pathname.startsWith("/files")) return <FilesScreen pathname={pathname} />;
  if (pathname.startsWith("/view")) return <ViewerScreen key={pathname} pathname={pathname} />;
  if (pathname.startsWith("/s/")) return <ShareScreen key={pathname} pathname={pathname} />;
  // /tags is inactive in the legacy frontend (route commented out) — not ported.

  return <Placeholder name="Not found" />;
}

function RouteLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <p className="aurora-text-meta">Loading</p>
    </main>
  );
}
