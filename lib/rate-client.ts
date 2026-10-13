/**
 * Browser-side helper to fetch the current rate from GET /api/rate.
 * Adds a cache-busting query parameter in addition to no-store, because some
 * in-app browsers (including WhatsApp's) are aggressive about caching.
 */
import type { RateRecord } from "./rate-store";

export type FetchRateResult =
  | { kind: "ok"; record: RateRecord }
  | { kind: "not_published" }
  | { kind: "error"; message: string };

const GENERIC_ERROR = "Please check your internet connection and tap Refresh to try again.";

export async function fetchCurrentRate(): Promise<FetchRateResult> {
  try {
    const response = await fetch(`/api/rate?t=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = (await response.json().catch(() => null)) as
      | { status?: string; record?: RateRecord | null; message?: string }
      | null;

    if (response.ok && data?.status === "ok" && data.record) return { kind: "ok", record: data.record };
    if (response.ok && data?.status === "not_published") return { kind: "not_published" };
    return { kind: "error", message: data?.message ?? GENERIC_ERROR };
  } catch {
    return { kind: "error", message: GENERIC_ERROR };
  }
}
