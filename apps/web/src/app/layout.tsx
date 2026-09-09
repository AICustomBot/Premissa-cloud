import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import SessionBar from "../components/SessionBar";
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

/**
 * SessionBar is mounted here rather than inside a page so the signed-in
 * identity and the way out are present on every route, including while
 * ClientPage.tsx still runs on its own prototype state.
 */
const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" suppressHydrationWarning>
    <body suppressHydrationWarning>
      {children}
      <SessionBar />
    </body>
  </html>
);

export default RootLayout;
