"use client";

import { useEffect, useRef } from "react";
import { formatINR, formatMarketDate } from "@/lib/format";
import { Spinner } from "./icons";

interface Props {
  open: boolean;
  currentRate: number | null;
  newRate: number;
  marketDate: string;
  publishing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation step before publishing. Uses the native <dialog> element,
 * which provides focus trapping and Escape-to-close on Android Chrome.
 */
export default function ConfirmPublishDialog({ open, currentRate, newRate, marketDate, publishing, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl bg-white p-0 text-slate-900 shadow-2xl"
      onCancel={(event) => {
        event.preventDefault(); // we control closing through React state
        if (!publishing) onCancel();
      }}
    >
      <div className="p-6">
        <h2 id="confirm-title" className="text-lg font-bold">
          Publish this rate?
        </h2>
        <p className="mt-1 text-sm text-slate-600">Customers will see it as soon as they open or refresh the link.</p>

        <dl className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm ring-1 ring-slate-100">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600">Current rate</dt>
            <dd className="font-semibold tabular-nums">{currentRate !== null ? formatINR(currentRate) : "Not published"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-slate-600">New rate</dt>
            <dd className="text-2xl font-extrabold text-emerald-800 tabular-nums">{formatINR(newRate)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600">Market date</dt>
            <dd className="font-semibold">{formatMarketDate(marketDate)}</dd>
          </div>
        </dl>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={publishing}
            className="min-h-12 rounded-2xl bg-white px-4 py-3 text-base font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={publishing}
            autoFocus
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-80"
          >
            {publishing && <Spinner className="h-4 w-4" />}
            {publishing ? "Publishing…" : "Confirm"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
