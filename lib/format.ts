/**
 * Display formatting. Safe to use on both server and client.
 * All times are shown in Indian Standard Time regardless of the viewer's device settings.
 */

export const IST_TIME_ZONE = "Asia/Kolkata";

/** 125000 → "₹1,25,000"; 15550.5 → "₹15,550.50" */
export function formatINR(rate: number): string {
  const hasFraction = !Number.isInteger(rate);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rate);
}

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Calendar parts of an instant in IST, using numeric fields only.
 * (Month names are mapped by hand so server and phone render identical text,
 * whatever ICU version each one ships.)
 */
function istParts(isoTimestamp: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(isoTimestamp));
  const num = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: num("year"), month: num("month"), day: num("day"), hour: num("hour") % 24, minute: num("minute") };
}

/** "2026-10-13" → "13 October 2026" (the market date is a calendar date, not an instant). */
export function formatMarketDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** ISO timestamp → "11:35 AM IST" */
export function formatISTTime(isoTimestamp: string): string {
  const { hour, minute } = istParts(isoTimestamp);
  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period} IST`;
}

/** ISO timestamp → "13 Oct 2026" (date part of an instant, in IST) */
export function formatISTDate(isoTimestamp: string): string {
  const { year, month, day } = istParts(isoTimestamp);
  return `${day} ${MONTHS_SHORT[month - 1]} ${year}`;
}

/** ISO timestamp → "13 Oct 2026, 11:35 AM IST" */
export function formatISTDateTime(isoTimestamp: string): string {
  return `${formatISTDate(isoTimestamp)}, ${formatISTTime(isoTimestamp)}`;
}

/** Today's calendar date in IST as "YYYY-MM-DD". */
export function todayInIST(now: Date = new Date()): string {
  const { year, month, day } = istParts(now.toISOString());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
