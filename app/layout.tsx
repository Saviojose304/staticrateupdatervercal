import type { Metadata, Viewport } from "next";
import { getBusinessName } from "@/lib/env";
import "./globals.css";

export function generateMetadata(): Metadata {
  const business = getBusinessName();
  return {
    title: { default: `Today's Market Rate | ${business}`, template: `%s | ${business}` },
    description: `Latest published market rate from ${business}.`,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#047857",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
