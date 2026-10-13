import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { checkAdminSession } from "@/lib/auth";
import { getBusinessName } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Admin Login" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; loggedOut?: string }>;
}) {
  const auth = await checkAdminSession();
  if (auth.state === "authenticated") redirect("/admin");

  const params = await searchParams;
  const notice =
    params.expired === "1"
      ? "Your session has expired. Please log in again."
      : params.loggedOut === "1"
        ? "You have been logged out."
        : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold text-slate-700">{getBusinessName()}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Admin Login</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in to update the published market rate.</p>
        </div>

        {auth.state === "error" && (
          <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200" role="alert">
            {auth.reason === "config"
              ? "Login is not available yet. The site administrator must finish setup (environment variables)."
              : "The server is having trouble right now. Please try again in a moment."}
          </p>
        )}

        <LoginForm notice={notice} />
      </div>
    </main>
  );
}
