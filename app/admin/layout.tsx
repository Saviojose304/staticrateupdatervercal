import type { Metadata } from "next";

// Admin pages must never be indexed by search engines.
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[#f4f7f5]">{children}</div>;
}
