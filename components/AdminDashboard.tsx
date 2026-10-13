"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { formatINR, formatISTDateTime, formatMarketDate } from "@/lib/format";
import { fetchCurrentRate } from "@/lib/rate-client";
import type { RateRecord } from "@/lib/rate-store";
import AdminRateForm from "./AdminRateForm";
import LogoutButton from "./LogoutButton";
import type { RateState } from "./RateCard";
import ShareLinkPanel from "./ShareLinkPanel";
import { AlertIcon, CheckCircleIcon, RefreshIcon, Spinner } from "./icons";

interface Props {
  businessName: string;
  username: string;
  initialState: RateState;
  publicRateUrl: string;
  todayIST: string;
}

function Section({ title, step, children }: { title: string; step: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-[0_4px_20px_rgb(15_23_42/0.06)] ring-1 ring-slate-200 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">{step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function AdminDashboard({ businessName, username, initialState, publicRateUrl, todayIST }: Props) {
  const router = useRouter();
  const [state, setState] = useState<RateState>(initialState);
  const [reloading, setReloading] = useState(false);

  /** Re-reads the published record from the server (the source of truth). */
  const reload = useCallback(async (fallback?: RateRecord) => {
    setReloading(true);
    const result = await fetchCurrentRate();
    if (result.kind === "error" && fallback) setState({ kind: "ok", record: fallback });
    else setState(result);
    setReloading(false);
  }, []);

  const currentRate = state.kind === "ok" ? state.record.rate : null;

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-12 pt-5">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-emerald-800">{businessName}</p>
          <h1 className="text-xl font-bold text-slate-900">Rate Dashboard</h1>
          <p className="truncate text-xs text-slate-500">Signed in as {username}</p>
        </div>
        <LogoutButton />
      </header>

      <div className="space-y-5">
        <Section step="1" title="Current Published Rate">
          <div aria-live="polite" className={reloading ? "opacity-60" : ""}>
            {state.kind === "ok" && (
              <>
                <p className="text-4xl font-extrabold tabular-nums text-slate-900">{formatINR(state.record.rate)}</p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-600">Status</dt>
                    <dd className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                      <CheckCircleIcon /> Confirmed (live)
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-600">Market date</dt>
                    <dd className="font-semibold text-slate-900">{formatMarketDate(state.record.marketDate)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-600">Last updated</dt>
                    <dd className="text-right font-semibold text-slate-900">{formatISTDateTime(state.record.updatedAt)}</dd>
                  </div>
                </dl>
                {state.record.marketDate !== todayIST && (
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                    <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    The published rate is not for today. Publish today&apos;s rate below.
                  </p>
                )}
              </>
            )}
            {state.kind === "not_published" && (
              <p className="text-sm text-slate-700">
                <span className="font-semibold">No rate published yet.</span> Customers currently see “Today&apos;s rate has not been
                published yet.”
              </p>
            )}
            {state.kind === "error" && (
              <p className="flex items-start gap-2 text-sm text-amber-900" role="alert">
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                {state.message}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => reload()}
            disabled={reloading}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 hover:text-emerald-900 disabled:opacity-60"
          >
            {reloading ? <Spinner className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
            Reload from server
          </button>
        </Section>

        <Section step="2" title="Update Rate">
          <AdminRateForm
            currentRate={currentRate}
            todayIST={todayIST}
            onPublished={(record) => reload(record)}
            onSessionExpired={() => {
              router.replace("/admin/login?expired=1");
              router.refresh();
            }}
          />
        </Section>

        <Section step="3" title="Share with Customers">
          <ShareLinkPanel publicRateUrl={publicRateUrl} />
        </Section>
      </div>
    </div>
  );
}
