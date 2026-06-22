import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Filestash",
  description: "Filestash — a web file manager for any storage backend.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Dark-first per Aurora. Fonts resolve via aurora-fonts.css @font-face.
  return (
    <html lang="en" className="dark h-full">
      <body className="aurora-page-shell min-h-full antialiased">{children}</body>
    </html>
  );
}
