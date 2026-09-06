import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PERMISSA",
  description: "Evidence-gated screenplay clearance research.",
  openGraph: {
    title: "PERMISSA",
    description: "Evidence-gated screenplay clearance research.",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export const dynamic = "force-dynamic";

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" suppressHydrationWarning>
    <body suppressHydrationWarning>{children}</body>
  </html>
);

export default RootLayout;
