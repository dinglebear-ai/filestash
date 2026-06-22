import { AppRouter } from "@/app/app-router";

// Single optional catch-all → one exported shell (out/index.html). Static export
// prerenders only the root; the Go server serves this shell for every front/back-
// office route and AppRouter resolves the screen client-side from the URL.
export function generateStaticParams() {
  return [{ path: [] }];
}

export const dynamicParams = false;

export default function CatchAll() {
  return <AppRouter />;
}
