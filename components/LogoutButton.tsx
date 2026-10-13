"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/admin/logout", { method: "POST", cache: "no-store" });
    } catch {
      // Even if the request fails, move to the login page; the server-side
      // session also expires on its own.
    }
    router.replace("/admin/login?loggedOut=1");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className="min-h-10 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60"
    >
      {loading ? "Logging out…" : "Log out"}
    </button>
  );
}
