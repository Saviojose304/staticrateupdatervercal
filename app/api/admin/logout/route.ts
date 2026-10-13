import type { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { destroySession, getSessionCookieName, getSessionCookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/logout — revokes the session server-side and clears the cookie.
 * Always responds { ok: true } so the browser can move on to the login page.
 */
export async function POST(request: NextRequest) {
  const cookieName = getSessionCookieName();
  const token = request.cookies.get(cookieName)?.value;
  const secret = process.env.SESSION_SECRET;

  if (token && secret) {
    try {
      await destroySession(token, secret);
    } catch (error) {
      // The cookie is still cleared below; the server-side record also expires on its own.
      console.error("[api/admin/logout] Could not revoke session:", error instanceof Error ? error.message : error);
    }
  }

  const response = json({ ok: true });
  response.cookies.set(cookieName, "", getSessionCookieOptions(0));
  return response;
}
