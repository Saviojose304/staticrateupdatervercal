import type { NextRequest } from "next/server";
import { credentialsMatch } from "@/lib/credentials";
import { ConfigError, getAdminConfig } from "@/lib/env";
import { getClientIp, isInsecureProductionRequest, isSameOriginRequest, json, readJsonBody } from "@/lib/http";
import { StorageError } from "@/lib/kv";
import { clearFailedLogins, getLoginBlock, recordFailedLogin } from "@/lib/rate-limit";
import { createSession, getSessionCookieName, getSessionCookieOptions } from "@/lib/session";
import { parseLoginInput } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FAILURE_DELAY_MS = 600;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST /api/admin/login — Body: { username, password }
 * Returns only { ok: true } or { ok: false, message }. Never echoes credentials.
 */
export async function POST(request: NextRequest) {
  if (isInsecureProductionRequest(request)) {
    return json({ ok: false, message: "Please use the secure (https) address." }, 400);
  }
  if (!isSameOriginRequest(request)) {
    return json({ ok: false, message: "Request blocked." }, 403);
  }

  let config;
  try {
    config = getAdminConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error("[api/admin/login] Admin login is not configured:", error.missing.join(", "));
      return json({ ok: false, message: "Login is not available yet. The site administrator must finish setup." }, 500);
    }
    throw error;
  }

  const ip = getClientIp(request);

  try {
    const block = await getLoginBlock(ip);
    if (block.blocked) {
      const minutes = Math.ceil(block.retryAfterSeconds / 60);
      return json(
        { ok: false, message: `Too many failed attempts. Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.` },
        429,
        { "Retry-After": String(block.retryAfterSeconds) }
      );
    }

    const input = parseLoginInput(await readJsonBody(request));
    if (!input.ok) return json({ ok: false, message: input.error }, 400);

    if (!credentialsMatch(input.value, config)) {
      const remaining = await recordFailedLogin(ip);
      console.warn(`[api/admin/login] Failed login attempt (remaining in window: ${remaining})`);
      await sleep(FAILURE_DELAY_MS);
      return json({ ok: false, message: "Invalid username or password." }, 401);
    }

    const { token, maxAge } = await createSession(config.username, config.sessionSecret);
    await clearFailedLogins(ip);

    const response = json({ ok: true });
    response.cookies.set(getSessionCookieName(), token, getSessionCookieOptions(maxAge));
    return response;
  } catch (error) {
    if (error instanceof StorageError) {
      console.error("[api/admin/login] Storage unavailable:", error.message);
      return json({ ok: false, message: "The server is not available right now. Please try again in a moment." }, 503);
    }
    console.error("[api/admin/login] Unexpected error:", error instanceof Error ? error.message : error);
    return json({ ok: false, message: "Something went wrong. Please try again." }, 500);
  }
}
