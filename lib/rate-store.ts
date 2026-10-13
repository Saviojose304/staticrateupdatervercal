/**
 * The single published-rate record.
 *
 * The whole record is stored as ONE JSON value under ONE key, and written
 * with a single SET command. Redis applies a SET atomically, so readers see
 * either the complete old record or the complete new one, never a mix. If a
 * write fails, the previous record is left untouched.
 */
import { getStore, StorageError } from "./kv";

export const RATE_KEY = "market-rate:current";

export type RateStatus = "CONFIRMED";

export interface RateRecord {
  /** Numeric rate in INR, up to 2 decimal places. */
  rate: number;
  /** Calendar date the rate applies to, "YYYY-MM-DD". */
  marketDate: string;
  /** ISO-8601 UTC timestamp, set by the server when publishing. */
  updatedAt: string;
  status: RateStatus;
}

function isRateRecord(value: unknown): value is RateRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.rate === "number" &&
    Number.isFinite(r.rate) &&
    r.rate > 0 &&
    typeof r.marketDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.marketDate) &&
    typeof r.updatedAt === "string" &&
    !Number.isNaN(Date.parse(r.updatedAt)) &&
    r.status === "CONFIRMED"
  );
}

/**
 * Returns the published record, or null if nothing has been published yet.
 * Throws StorageError if storage cannot be reached or holds corrupt data —
 * callers must show an error rather than a fallback number.
 */
export async function getCurrentRate(): Promise<RateRecord | null> {
  const raw = await getStore().get(RATE_KEY);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    // Upstash may return already-parsed JSON for some clients; handle both.
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (error) {
    throw new StorageError("Stored rate record is not valid JSON", { cause: error });
  }
  if (!isRateRecord(parsed)) throw new StorageError("Stored rate record has an unexpected shape");

  return { rate: parsed.rate, marketDate: parsed.marketDate, updatedAt: parsed.updatedAt, status: parsed.status };
}

/**
 * Publishes a new rate. `rate` and `marketDate` must already be validated.
 * The timestamp always comes from the server clock.
 */
export async function publishRate(input: { rate: number; marketDate: string }, now: Date = new Date()): Promise<RateRecord> {
  const record: RateRecord = {
    rate: input.rate,
    marketDate: input.marketDate,
    updatedAt: now.toISOString(),
    status: "CONFIRMED",
  };
  await getStore().set(RATE_KEY, JSON.stringify(record));
  return record;
}

/** Only the fields that are safe to send to anyone. */
export function toPublicRecord(record: RateRecord): RateRecord {
  return { rate: record.rate, marketDate: record.marketDate, updatedAt: record.updatedAt, status: record.status };
}
