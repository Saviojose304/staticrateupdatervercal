/**
 * Challenge-response login (server side).
 *
 * The browser never sends the username or password. Instead:
 *   1. GET /api/admin/login       → server issues a random one-time `nonce` (valid 2 minutes)
 *   2. browser computes
 *        usernameHash = SHA-256(username)                       (hex)
 *        proof        = HMAC-SHA256(key = SHA-256(password),
 *                                   message = nonce + ":" + usernameHash)   (hex)
 *   3. POST /api/admin/login { nonce, usernameHash, proof }
 *   4. server deletes the nonce (single use), computes the same values from
 *      ADMIN_USERNAME / ADMIN_PASSWORD and compares in constant time.
 *
 * A captured request cannot be replayed (the nonce is already used) and does
 * not contain the password. HTTPS still protects everything in transit.
 * The browser-side half lives in lib/login-proof.ts and must stay in sync.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getStore } from "./kv";

export const CHALLENGE_TTL_SECONDS = 120;
const CHALLENGE_PREFIX = "login-challenge:";
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HEX64 = /^[0-9a-f]{64}$/;

export function isValidNonce(value: unknown): value is string {
  return typeof value === "string" && NONCE_PATTERN.test(value);
}
export function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX64.test(value);
}

/** Creates and stores a one-time login challenge. */
export async function issueChallenge(): Promise<string> {
  const nonce = randomBytes(32).toString("base64url");
  await getStore().set(CHALLENGE_PREFIX + nonce, "1", CHALLENGE_TTL_SECONDS);
  return nonce;
}

/** Atomically removes the challenge. Returns false if it was unknown, expired or already used. */
export async function consumeChallenge(nonce: string): Promise<boolean> {
  if (!isValidNonce(nonce)) return false;
  return (await getStore().take(CHALLENGE_PREFIX + nonce)) !== null;
}

export function hashUsername(username: string): string {
  return createHash("sha256").update(username.trim(), "utf8").digest("hex");
}

export function computeLoginProof(nonce: string, usernameHash: string, password: string): string {
  const key = createHash("sha256").update(password, "utf8").digest();
  return createHmac("sha256", key).update(`${nonce}:${usernameHash}`, "utf8").digest("hex");
}

function equalHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Checks the submitted proof against the configured credentials.
 * Both comparisons always run (no early exit).
 */
export function verifyLoginProof(
  submitted: { nonce: string; usernameHash: string; proof: string },
  expected: { username: string; password: string }
): boolean {
  const expectedUserHash = hashUsername(expected.username);
  const expectedProof = computeLoginProof(submitted.nonce, expectedUserHash, expected.password);
  const userOk = equalHex(submitted.usernameHash, expectedUserHash);
  const proofOk = equalHex(submitted.proof, expectedProof);
  return userOk && proofOk;
}
