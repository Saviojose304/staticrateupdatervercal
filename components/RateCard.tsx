import { formatINR, formatISTDateTime, formatMarketDate } from "@/lib/format";
import type { RateRecord } from "@/lib/rate-store";
import { AlertIcon, CheckCircleIcon, ClockIcon } from "./icons";

export type RateState =
  | { kind: "ok"; record: RateRecord }
  | { kind: "not_published" }
  | { kind: "error"; message: string };

interface RateCardProps {
  businessName: string;
  state: RateState;
  loading?: boolean;
  /** Shown when a refresh failed but an earlier rate is still on screen. */
  refreshError?: string | null;
  children?: React.ReactNode; // footer actions (refresh button)
}

/** The public, read-only rate card. Never renders a number unless a real record exists. */
export default function RateCard({ businessName, state, loading = false, refreshError, children }: RateCardProps) {
  return (
    <article
      className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_8px_30px_rgb(15_23_42/0.08)] ring-1 ring-slate-200"
      aria-busy={loading}
    >
      <div className="h-1.5 bg-gradient-to-r from-emerald-600 to-emerald-400" />

      <div className="px-6 pb-7 pt-6 text-center sm:px-8">
        <p className="text-base font-semibold text-slate-800">{businessName}</p>
        <h1 className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Today&apos;s Market Rate</h1>

        <div className="mt-6" aria-live="polite">
          {state.kind === "ok" && (
            <>
              <p
                className={`text-[length:clamp(2.75rem,14vw,4rem)] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums transition-opacity ${loading ? "opacity-50" : ""}`}
              >
                {formatINR(state.record.rate)}
              </p>
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
                <CheckCircleIcon />
                <span>
                  <span className="sr-only">Status: </span>Confirmed Rate
                </span>
              </p>
            </>
          )}

          {state.kind === "not_published" && (
            <div className="flex flex-col items-center gap-3 py-2 text-slate-600">
              <ClockIcon className="h-10 w-10 text-emerald-700" />
              <p className="text-lg font-semibold text-slate-800">Today&apos;s rate has not been published yet.</p>
              <p className="text-sm">Please check again a little later.</p>
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex flex-col items-center gap-3 py-2" role="alert">
              <AlertIcon className="h-9 w-9 text-amber-600" />
              <p className="text-lg font-semibold text-slate-800">We couldn&apos;t load the rate right now.</p>
              <p className="text-sm text-slate-600">{state.message}</p>
            </div>
          )}
        </div>

        {state.kind === "ok" && (
          <dl className="mt-6 divide-y divide-slate-100 rounded-2xl bg-slate-50 text-left text-sm ring-1 ring-slate-100">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-slate-600">Market Date</dt>
              <dd className="font-semibold text-slate-900">{formatMarketDate(state.record.marketDate)}</dd>
            </div>
          </dl>
        )}

        {refreshError && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 ring-1 ring-amber-200" role="alert">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{refreshError}</span>
          </p>
        )}

        <p className="mt-6 text-sm leading-relaxed text-slate-600">
          Please check this page for the latest published market rate.
        </p>

        {children && <div className="mt-5">{children}</div>}
      </div>
    </article>
  );
}
