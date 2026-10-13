/**
 * Input validation shared by the admin form (for instant feedback) and the
 * API routes (the authoritative check). The server never trusts the client.
 */
import { todayInIST } from "./format";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_RATE = 999_999_999.99;
const MAX_DECIMALS = 2;

// Accepted digit groupings when the admin types commas:
//   Indian:        1,25,000   12,50,000   15,550
//   International: 1,250,000
const INDIAN_GROUPING = /^\d{1,2}(,\d{2})*,\d{3}$/;
const INTERNATIONAL_GROUPING = /^\d{1,3}(,\d{3})+$/;
const PLAIN_DIGITS = /^\d+$/;

/**
 * Parses a rate typed by the admin or received by the API.
 *
 * - Numbers must be finite, positive, at most 2 decimal places.
 * - Strings may contain commas only if they form a valid Indian or
 *   international grouping, so "15,550" → 15550 but "15,55" is rejected
 *   instead of being silently turned into 1555.
 */
export function parseRate(input: unknown): Result<number> {
  if (typeof input === "number") return checkRateNumber(input, String(input));

  if (typeof input !== "string") return { ok: false, error: "Please enter the rate." };

  const raw = input.trim().replace(/^₹\s*/, "");
  if (raw === "") return { ok: false, error: "Please enter the rate." };
  if (raw.startsWith("-")) return { ok: false, error: "The rate cannot be negative." };

  const [whole, fraction, ...extra] = raw.split(".");
  if (extra.length > 0 || whole === "") {
    return { ok: false, error: "Enter a valid number, for example 15550 or 15550.50." };
  }

  let digits: string;
  if (whole.includes(",")) {
    if (!INDIAN_GROUPING.test(whole) && !INTERNATIONAL_GROUPING.test(whole)) {
      return {
        ok: false,
        error: "The commas in this number look wrong. Type digits only, for example 15550.",
      };
    }
    digits = whole.replace(/,/g, "");
  } else {
    digits = whole;
  }

  if (!PLAIN_DIGITS.test(digits)) {
    return { ok: false, error: "Enter a valid number, for example 15550 or 15550.50." };
  }
  if (fraction !== undefined) {
    if (!PLAIN_DIGITS.test(fraction)) {
      return { ok: false, error: "Enter a valid number, for example 15550 or 15550.50." };
    }
    if (fraction.length > MAX_DECIMALS) {
      return { ok: false, error: "Use at most 2 decimal places." };
    }
  }

  const normalized = fraction !== undefined ? `${digits}.${fraction}` : digits;
  return checkRateNumber(Number(normalized), normalized);
}

function checkRateNumber(value: number, source: string): Result<number> {
  if (!Number.isFinite(value)) return { ok: false, error: "Enter a valid number." };
  if (value < 0) return { ok: false, error: "The rate cannot be negative." };
  if (value === 0) return { ok: false, error: "The rate must be greater than zero." };
  if (value > MAX_RATE) return { ok: false, error: "This rate is too large. Please check the number." };

  const decimals = source.includes(".") ? source.split(".")[1].replace(/0+$/, "").length : 0;
  if (source.includes("e") || source.includes("E")) {
    return { ok: false, error: "Enter a valid number." };
  }
  if (decimals > MAX_DECIMALS) return { ok: false, error: "Use at most 2 decimal places." };

  // Round to paise to avoid floating-point noise in storage (e.g. 0.1 + 0.2).
  return { ok: true, value: Math.round(value * 100) / 100 };
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const MARKET_DATE_PAST_DAYS = 31;
export const MARKET_DATE_FUTURE_DAYS = 7;

/** Validates a market date "YYYY-MM-DD": a real calendar date close to today (IST). */
export function parseMarketDate(input: unknown, now: Date = new Date()): Result<string> {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, error: "Please choose the market date." };
  }
  const value = input.trim();
  const match = ISO_DATE.exec(value);
  if (!match) return { ok: false, error: "The market date must look like 2026-10-13." };

  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false, error: "That market date does not exist." };
  }

  const today = todayInIST(now);
  const [ty, tm, td] = today.split("-").map(Number);
  const diffDays = Math.round((date.getTime() - Date.UTC(ty, tm - 1, td)) / 86_400_000);
  if (diffDays > MARKET_DATE_FUTURE_DAYS) {
    return { ok: false, error: `The market date cannot be more than ${MARKET_DATE_FUTURE_DAYS} days ahead.` };
  }
  if (diffDays < -MARKET_DATE_PAST_DAYS) {
    return { ok: false, error: `The market date cannot be more than ${MARKET_DATE_PAST_DAYS} days in the past.` };
  }
  return { ok: true, value };
}

export interface LoginInput {
  username: string;
  password: string;
}

/** Shape check only. Whether the credentials are correct is decided in lib/auth.ts. */
export function parseLoginInput(input: unknown): Result<LoginInput> {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid request." };
  const { username, password } = input as Record<string, unknown>;
  if (typeof username !== "string" || username.trim() === "") {
    return { ok: false, error: "Please enter your username." };
  }
  if (typeof password !== "string" || password === "") {
    return { ok: false, error: "Please enter your password." };
  }
  if (username.length > 200 || password.length > 500) {
    return { ok: false, error: "Invalid username or password." };
  }
  return { ok: true, value: { username: username.trim(), password } };
}
