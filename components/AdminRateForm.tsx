"use client";

import { useState, type FormEvent } from "react";
import { formatINR, formatISTDateTime } from "@/lib/format";
import type { RateRecord } from "@/lib/rate-store";
import { parseMarketDate, parseRate } from "@/lib/validation";
import ConfirmPublishDialog from "./ConfirmPublishDialog";
import { AlertIcon, CheckCircleIcon } from "./icons";

interface Props {
  currentRate: number | null;
  todayIST: string;
  /** Called after the server confirms the publish. */
  onPublished: (record: RateRecord) => void | Promise<void>;
  onSessionExpired: () => void;
}

type Outcome = { kind: "success"; record: RateRecord } | { kind: "error"; message: string } | null;

export default function AdminRateForm({ currentRate, todayIST, onPublished, onSessionExpired }: Props) {
  const [rateInput, setRateInput] = useState("");
  const [marketDate, setMarketDate] = useState(todayIST);
  const [fieldErrors, setFieldErrors] = useState<{ rate?: string; marketDate?: string }>({});
  const [pending, setPending] = useState<{ rate: number; marketDate: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const preview = rateInput.trim() ? parseRate(rateInput) : null;
  const difference = preview?.ok && currentRate !== null ? Math.round((preview.value - currentRate) * 100) / 100 : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOutcome(null);
    const rate = parseRate(rateInput);
    const date = parseMarketDate(marketDate);
    const errors = {
      ...(rate.ok ? {} : { rate: rate.error }),
      ...(date.ok ? {} : { marketDate: date.error }),
    };
    setFieldErrors(errors);
    if (rate.ok && date.ok) setPending({ rate: rate.value, marketDate: date.value });
  }

  async function confirmPublish() {
    if (!pending || publishing) return;
    setPublishing(true);
    try {
      const response = await fetch("/api/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send the exact number the admin just confirmed. The server validates it again.
        body: JSON.stringify({ rate: pending.rate, marketDate: pending.marketDate }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as
        | { status?: string; record?: RateRecord; message?: string; fieldErrors?: { rate?: string; marketDate?: string } }
        | null;

      if (response.status === 401) {
        setPending(null);
        onSessionExpired();
        return;
      }
      if (response.ok && data?.status === "ok" && data.record) {
        setPending(null);
        setRateInput("");
        setFieldErrors({});
        setOutcome({ kind: "success", record: data.record });
        await onPublished(data.record);
      } else {
        setPending(null);
        if (data?.fieldErrors) setFieldErrors(data.fieldErrors);
        setOutcome({
          kind: "error",
          message: data?.message ?? "The rate could not be published. The previously published rate is unchanged.",
        });
      }
    } catch {
      setPending(null);
      setOutcome({
        kind: "error",
        message: "Could not reach the server. Check your internet connection. The previously published rate is unchanged.",
      });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor="rate" className="mb-1.5 block text-sm font-medium text-slate-800">
            New rate (₹)
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-lg font-semibold text-slate-500">₹</span>
            <input
              id="rate"
              name="rate"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 15550"
              value={rateInput}
              onChange={(e) => {
                setRateInput(e.target.value);
                setOutcome(null);
                if (fieldErrors.rate) setFieldErrors((f) => ({ ...f, rate: undefined }));
              }}
              aria-invalid={Boolean(fieldErrors.rate)}
              aria-describedby="rate-help rate-preview"
              className={`block w-full rounded-xl border-0 bg-white py-3.5 pl-10 pr-4 text-2xl font-bold tabular-nums text-slate-900 shadow-sm ring-1 placeholder:text-base placeholder:font-normal placeholder:text-slate-400 focus:ring-2 focus:outline-none ${
                fieldErrors.rate ? "ring-red-400 focus:ring-red-500" : "ring-slate-300 focus:ring-emerald-600"
              }`}
            />
          </div>
          <p id="rate-help" className="mt-1.5 text-xs text-slate-500">
            Digits only, e.g. 15550 or 15550.50. Commas are fine if placed correctly (15,550).
          </p>
          {fieldErrors.rate && (
            <p className="mt-1.5 text-sm font-medium text-red-700" role="alert">
              {fieldErrors.rate}
            </p>
          )}
        </div>

        <div id="rate-preview" className="rounded-2xl bg-emerald-50/60 px-4 py-3 ring-1 ring-emerald-100" aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Preview</p>
          <p className="mt-0.5 text-3xl font-extrabold tabular-nums text-slate-900">
            {preview?.ok ? formatINR(preview.value) : <span className="text-slate-400">—</span>}
          </p>
          {difference !== null && difference !== 0 && (
            <p className={`mt-0.5 text-sm font-medium ${difference > 0 ? "text-emerald-800" : "text-red-700"}`}>
              {difference > 0 ? "+" : "−"}
              {formatINR(Math.abs(difference))} from current rate
            </p>
          )}
          {difference === 0 && <p className="mt-0.5 text-sm text-slate-600">Same as the current rate</p>}
        </div>

        <div>
          <label htmlFor="marketDate" className="mb-1.5 block text-sm font-medium text-slate-800">
            Market date
          </label>
          <input
            id="marketDate"
            name="marketDate"
            type="date"
            value={marketDate}
            onChange={(e) => {
              setMarketDate(e.target.value);
              if (fieldErrors.marketDate) setFieldErrors((f) => ({ ...f, marketDate: undefined }));
            }}
            aria-invalid={Boolean(fieldErrors.marketDate)}
            className={`block w-full rounded-xl border-0 bg-white px-4 py-3 text-base text-slate-900 shadow-sm ring-1 focus:ring-2 focus:outline-none ${
              fieldErrors.marketDate ? "ring-red-400 focus:ring-red-500" : "ring-slate-300 focus:ring-emerald-600"
            }`}
          />
          {fieldErrors.marketDate && (
            <p className="mt-1.5 text-sm font-medium text-red-700" role="alert">
              {fieldErrors.marketDate}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={publishing}
          className="inline-flex min-h-13 w-full items-center justify-center rounded-2xl bg-emerald-700 px-5 py-3.5 text-lg font-bold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 active:scale-[0.99] disabled:opacity-70"
        >
          Publish Rate
        </button>
      </form>

      {outcome?.kind === "success" && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200" role="status">
          <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Rate published successfully.</p>
            <p className="mt-0.5">
              Customers now see <strong className="tabular-nums">{formatINR(outcome.record.rate)}</strong>. Updated{" "}
              {formatISTDateTime(outcome.record.updatedAt)}.
            </p>
          </div>
        </div>
      )}

      {outcome?.kind === "error" && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200" role="alert">
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{outcome.message}</p>
        </div>
      )}

      {pending && (
        <ConfirmPublishDialog
          open
          currentRate={currentRate}
          newRate={pending.rate}
          marketDate={pending.marketDate}
          publishing={publishing}
          onConfirm={confirmPublish}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
