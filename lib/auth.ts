/**
 * Server-side authentication helpers that depend on Next.js request APIs.
 * Used by the protected admin page and the API route handlers.
 */
import { cookies } from "next/headers";
import { ConfigError, getAdminConfig } from "./env";
import { StorageError } from "./kv";
import { getSessionCookieName, verifySession, type AdminSession } from "./session";

export type SessionCheck =
  | { state: "authenticated"; session: AdminSession }
  | { state: "unauthenticated"; hadCookie: boolean }
  | { state: "error"; reason: "config" | "storage" };

/**
 * Reads the session cookie and verifies it on the server. The browser's own
 * state (localStorage, React state) is never trusted as proof of login.
 */
export async function checkAdminSession(): Promise<SessionCheck> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;

  let secret: string;
  try {
    secret = getAdminConfig().sessionSecret;
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error("[auth] Admin configuration problem:", error.missing.join(", "));
      return { state: "error", reason: "config" };
    }
    throw error;
  }

  if (!token) return { state: "unauthenticated", hadCookie: false };

  try {
    const session = await verifySession(token, secret);
    return session ? { state: "authenticated", session } : { state: "unauthenticated", hadCookie: true };
  } catch (error) {
    if (error instanceof StorageError) {
      console.error("[auth] Could not verify session:", error.message);
      return { state: "error", reason: "storage" };
    }
    throw error;
  }
}
