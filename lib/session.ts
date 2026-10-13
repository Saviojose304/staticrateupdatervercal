/**
 * Admin sessions.
 *
 * Cookie value:  <sessionId>.<expiresAtSeconds>.<signature>
 *   - sessionId: 32 random bytes (base64url) from a CSPRNG
 *   - signature: HMAC-SHA256 over "<sessionId>.<expiresAtSeconds>" with SESSION_SECRET
 *
 * The session is ALSO recorded server-side in Redis ("admin-session:<id>")
 * with a matching TTL. A request is authenticated only if the signature is
 * valid, the expiry is in the future, AND the server-side record exists.
 * Logging out deletes the record, so a copied cookie stops working
 * immediately, even before it expires. Nothing is kept in serverless memory.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getStore } from "./kv";

export const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours
const SESSION_KEY_PREFIX = "admin-session:";

/**
 * In production the "__Host-" prefix makes the browser enforce Secure,
 * Path=/ and no Domain attribute (so subdomains cannot set or read it).
 * Plain http://localhost cannot store __Host- cookies, so development uses a plain name.
 */
export function getSessionCookieName(): string {
  return process.env.NODE_ENV === "production" ? "__Host-rate_admin" : "rate_admin";
}

export function getSessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export interface AdminSession {
  sessionId: string;
  username: string;
  expiresAt: number; // unix seconds
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Creates a session record in storage and returns the signed cookie value. */
export async function createSession(
  username: string,
  secret: string,
  nowMs: number = Date.now()
): Promise<{ token: string; maxAge: number; session: AdminSession }> {
  const sessionId = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  const payload = `${sessionId}.${expiresAt}`;
  const token = `${payload}.${sign(payload, secret)}`;

  const session: AdminSession = { sessionId, username, expiresAt };
  await getStore().set(SESSION_KEY_PREFIX + sessionId, JSON.stringify({ username, expiresAt }), SESSION_TTL_SECONDS);
  return { token, maxAge: SESSION_TTL_SECONDS, session };
}

/** Checks format, signature and expiry without touching storage. */
export function parseSignedToken(
  token: string | undefined | null,
  secret: string,
  nowMs: number = Date.now()
): { sessionId: string; expiresAt: number } | null {
  if (!token || token.length > 300) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [sessionId, expiresRaw, signature] = parts;
  if (!/^[A-Za-z0-9_-]{43}$/.test(sessionId) || !/^\d{1,12}$/.test(expiresRaw)) return null;

  if (!safeEqual(signature, sign(`${sessionId}.${expiresRaw}`, secret))) return null;

  const expiresAt = Number(expiresRaw);
  if (expiresAt <= Math.floor(nowMs / 1000)) return null;
  return { sessionId, expiresAt };
}

/**
 * Full verification: signature, expiry and server-side record.
 * Returns null for any invalid/expired/revoked session.
 * Throws StorageError if storage is unreachable (callers decide how to respond).
 */
export async function verifySession(
  token: string | undefined | null,
  secret: string,
  nowMs: number = Date.now()
): Promise<AdminSession | null> {
  const parsed = parseSignedToken(token, secret, nowMs);
  if (!parsed) return null;

  const raw = await getStore().get(SESSION_KEY_PREFIX + parsed.sessionId);
  if (!raw) return null; // logged out or expired server-side

  try {
    const data = (typeof raw === "string" ? JSON.parse(raw) : raw) as { username?: unknown; expiresAt?: unknown };
    if (typeof data.username !== "string" || data.expiresAt !== parsed.expiresAt) return null;
    return { sessionId: parsed.sessionId, username: data.username, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

/** Revokes the session server-side. Safe to call with an invalid token. */
export async function destroySession(token: string | undefined | null, secret: string): Promise<void> {
  // Only the signature matters here: an expired-but-genuine session is still deleted.
  const parsed = parseSignedToken(token, secret, 0);
  if (!parsed) return;
  await getStore().del(SESSION_KEY_PREFIX + parsed.sessionId);
}
