"use client";

import { RefreshIcon, Spinner } from "./icons";

interface Props {
  onRefresh: () => void;
  loading: boolean;
}

export default function RefreshRateButton({ onRefresh, loading }: Props) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={loading}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 active:scale-[0.99] disabled:cursor-wait disabled:opacity-80"
    >
      {loading ? <Spinner /> : <RefreshIcon />}
      <span>{loading ? "Checking for latest rate…" : "Refresh Rate"}</span>
    </button>
  );
}
