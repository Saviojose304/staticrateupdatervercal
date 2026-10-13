/**
 * Login-attempt throttling, stored in Redis so it works across serverless
 * instances. Failed attempts are counted per client IP in a fixed window.
 *
 * Throttling is per IP (not per username) on purpose: a per-username lock
 * would let anyone lock the real admin out at 11:30 AM by typing wrong
 * passwords.
 */
import { createHash } from "node:crypto";
import { getStore } from "./kv";

export const MAX_FAILED_ATTEMPTS = 5;
export const FAILURE_WINDOW_SECONDS = 15 * 60;

function key(ip: string) {
  // Hash so raw IP addresses are not stored.
  return "login-fail:" + createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export async function getLoginBlock(ip: string): Promise<{ blocked: false } | { blocked: true; retryAfterSeconds: number }> {
  const store = getStore();
  const raw = await store.get(key(ip));
  const count = raw ? Number(raw) : 0;
  if (count < MAX_FAILED_ATTEMPTS) return { blocked: false };
  const ttl = await store.ttl(key(ip));
  return { blocked: true, retryAfterSeconds: ttl > 0 ? ttl : FAILURE_WINDOW_SECONDS };
}

/** Records a failed attempt and returns how many attempts are left in the window. */
export async function recordFailedLogin(ip: string): Promise<number> {
  const count = await getStore().incrementWithWindow(key(ip), FAILURE_WINDOW_SECONDS);
  return Math.max(0, MAX_FAILED_ATTEMPTS - count);
}

export async function clearFailedLogins(ip: string): Promise<void> {
  await getStore().del(key(ip));
}
