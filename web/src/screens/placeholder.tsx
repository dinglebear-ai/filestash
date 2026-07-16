"use client";

import { usePathname } from "next/navigation";
import { ErrorPage } from "@/registry/aurora/blocks/feedback/error-page/error-page";

export function Placeholder({ name }: { name: string }) {
  void name;
  const pathname = usePathname() || "/";

  return (
    <ErrorPage
      code={404}
      path={pathname}
      onRetry={() => {
        window.location.reload();
      }}
    />
  );
}
