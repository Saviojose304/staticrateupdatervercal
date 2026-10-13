import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import type { RateState } from "@/components/RateCard";
import { checkAdminSession } from "@/lib/auth";
import { getBusinessName, getPublicBaseUrl } from "@/lib/env";
import { todayInIST } from "@/lib/format";
import { getCurrentRate, toPublicRecord } from "@/lib/rate-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "Rate Dashboard" };

export default async function AdminPage() {
  // Server-side protection: the page is never rendered without a valid session.
  const auth = await checkAdminSession();

  if (auth.state === "unauthenticated") {
    redirect(auth.hadCookie ? "/admin/login?expired=1" : "/admin/login");
  }

  if (auth.state === "error") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="max-w-sm rounded-3xl bg-white p-6 text-center shadow ring-1 ring-slate-200" role="alert">
          <h1 className="text-lg font-bold text-slate-900">Dashboard unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">
            {auth.reason === "config"
              ? "The server is missing required settings. Check the environment variables in Vercel."
              : "The rate storage service could not be reached. Please try again in a moment."}
          </p>
          <a href="/admin" className="mt-5 inline-block rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">
            Try again
          </a>
        </div>
      </main>
    );
  }

  let initialState: RateState;
  try {
    const record = await getCurrentRate();
    initialState = record ? { kind: "ok", record: toPublicRecord(record) } : { kind: "not_published" };
  } catch (error) {
    console.error("[admin page] Failed to load rate:", error instanceof Error ? error.message : error);
    initialState = { kind: "error", message: "The current rate could not be loaded. You can still try to publish." };
  }

  const h = await headers();
  const baseUrl = getPublicBaseUrl(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));

  return (
    <AdminDashboard
      businessName={getBusinessName()}
      username={auth.session.username}
      initialState={initialState}
      publicRateUrl={`${baseUrl}/rate`}
      todayIST={todayInIST()}
    />
  );
}
