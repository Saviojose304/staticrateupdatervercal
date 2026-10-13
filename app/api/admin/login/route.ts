import type { NextRequest } from "next/server";
import { consumeChallenge, issueChallenge, verifyLoginProof } from "@/lib/credentials";
import { ConfigError, getAdminConfig } from "@/lib/env";
import { getClientIp, isInsecureProductionRequest, isSameOriginRequest, json, readJsonBody } from "@/lib/http";
import { StorageError } from "@/lib/kv";
import { allowChallengeRequest, clearFailedLogins, getLoginBlock, recordFailedLogin } from "@/lib/rate-limit";
import { createSession, getSessionCookieName, getSessionCookieOptions } from "@/lib/session";
import { parseLoginProofInput } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FAILURE_DELAY_MS = 600;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function storageUnavailable(where: string, error: StorageError) {
  console.error(`[api/admin/login ${where}] Storage unavailable:`, error.message);
  return json({ ok: false, message: "The server is not available right now. Please try again in a moment." }, 503);
}

function blockedResponse(retryAfterSeconds: number) {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return json(
    { ok: false, message: `Too many failed attempts. Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.` },
    429,
    { "Retry-After": String(retryAfterSeconds) }
  );
}

/**
 * GET /api/admin/login — issues a one-time login challenge { nonce }.
 * See lib/credentials.ts for the full challenge-response scheme.
 */
export async function GET(request: NextRequest) {
  if (isInsecureProductionRequest(request)) {
    return json({ ok: false, message: "Please use the secure (https) address." }, 400);
  }
  const ip = getClientIp(request);
  try {
    const block = await getLoginBlock(ip);
    if (block.blocked) return blockedResponse(block.retryAfterSeconds);
    if (!(await allowChallengeRequest(ip))) {
      return json({ ok: false, message: "Too many requests. Please wait a minute and try again." }, 429, { "Retry-After": "60" });
    }
    return json({ ok: true, nonce: await issueChallenge() });
  } catch (error) {
    if (error instanceof StorageError) return storageUnavailable("GET", error);
    console.error("[api/admin/login GET] Unexpected error:", error instanceof Error ? error.message : error);
    return json({ ok: false, message: "Something went wrong. Please try again." }, 500);
  }
}

/**
 * POST /api/admin/login — Body: { nonce, usernameHash, proof }
 * The username and password themselves are never sent.
 * Returns only { ok: true } or { ok: false, message, code? }.
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

  const input = parseLoginProofInput(await readJsonBody(request));
  if (!input.ok) return json({ ok: false, code: "BAD_REQUEST", message: input.error }, 400);

  const ip = getClientIp(request);

  try {
    const block = await getLoginBlock(ip);
    if (block.blocked) return blockedResponse(block.retryAfterSeconds);

    // Single use: a copied request cannot be replayed.
    if (!(await consumeChallenge(input.value.nonce))) {
      return json({ ok: false, code: "CHALLENGE_EXPIRED", message: "The login form has expired. Please try again." }, 400);
    }

    if (!verifyLoginProof(input.value, config)) {
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
    if (error instanceof StorageError) return storageUnavailable("POST", error);
    console.error("[api/admin/login POST] Unexpected error:", error instanceof Error ? error.message : error);
    return json({ ok: false, message: "Something went wrong. Please try again." }, 500);
  }
}
