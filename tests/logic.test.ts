/**
 * Unit tests for the framework-independent logic.
 * Run with: npm test
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { formatINR, formatMarketDate, formatISTTime, formatISTDateTime, todayInIST } from "../lib/format";
import { parseRate, parseMarketDate, parseLoginProofInput } from "../lib/validation";
import { MemoryStore, setStoreForTesting, StorageError, type KeyValueStore } from "../lib/kv";
import { getCurrentRate, publishRate, RATE_KEY } from "../lib/rate-store";
import { createSession, verifySession, destroySession, parseSignedToken, SESSION_TTL_SECONDS } from "../lib/session";
import { getLoginBlock, recordFailedLogin, clearFailedLogins, MAX_FAILED_ATTEMPTS } from "../lib/rate-limit";
import { consumeChallenge, issueChallenge, verifyLoginProof, computeLoginProof, hashUsername } from "../lib/credentials";
import { buildLoginProof } from "../lib/login-proof";

const SECRET = "x".repeat(48);
let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  setStoreForTesting(store);
});

// ---------- formatting ----------

test("formats rates with the Indian number system", () => {
  assert.equal(formatINR(15000), "₹15,000");
  assert.equal(formatINR(15550), "₹15,550");
  assert.equal(formatINR(125000), "₹1,25,000");
  assert.equal(formatINR(1250000), "₹12,50,000");
  assert.equal(formatINR(15550.5), "₹15,550.50");
});

test("formats market date and IST time from real values", () => {
  assert.equal(formatMarketDate("2026-10-13"), "13 October 2026");
  // 06:05 UTC = 11:35 IST
  assert.equal(formatISTTime("2026-10-13T06:05:00.000Z"), "11:35 AM IST");
  assert.equal(formatISTTime("2026-10-13T10:00:00.000Z"), "3:30 PM IST");
  assert.equal(formatISTDateTime("2026-10-13T06:05:00.000Z"), "13 Oct 2026, 11:35 AM IST");
  // 20:00 UTC on the 12th is already the 13th in India
  assert.equal(todayInIST(new Date("2026-10-12T20:00:00Z")), "2026-10-13");
});

// ---------- validation ----------

test("accepts valid rates and normalises commas correctly", () => {
  const ok = (input: unknown, expected: number) => {
    const r = parseRate(input);
    assert.ok(r.ok, `expected ${String(input)} to be valid: ${!r.ok ? r.error : ""}`);
    assert.equal(r.value, expected);
  };
  ok("15550", 15550);
  ok(" 15550 ", 15550);
  ok("15,550", 15550);
  ok("1,25,000", 125000);
  ok("12,50,000", 1250000);
  ok("1,250,000", 1250000);
  ok("15550.5", 15550.5);
  ok("15550.25", 15550.25);
  ok("₹15,550", 15550);
  ok(15550, 15550);
  ok(15550.75, 15550.75);
});

test("rejects invalid, negative, zero, empty and badly-grouped rates", () => {
  for (const bad of ["", "   ", "-100", "0", "0.00", "abc", "15,55", "1,5550", "15.5.5", "15550.123", "1e5", "Infinity", "NaN", ".5,", "12 000", null, undefined, {}, -5, 0, NaN, Infinity, 1e12, 0.001]) {
    const r = parseRate(bad as unknown);
    assert.equal(r.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("validates market dates", () => {
  const now = new Date("2026-10-13T06:00:00Z");
  assert.deepEqual(parseMarketDate("2026-10-13", now), { ok: true, value: "2026-10-13" });
  assert.equal(parseMarketDate("2026-02-30", now).ok, false);
  assert.equal(parseMarketDate("13-10-2026", now).ok, false);
  assert.equal(parseMarketDate("2027-01-01", now).ok, false);
  assert.equal(parseMarketDate("2025-01-01", now).ok, false);
  assert.equal(parseMarketDate(undefined, now).ok, false);
});

test("validates login proof input shape", () => {
  const nonce = "a".repeat(43);
  const hex = "0".repeat(64);
  assert.equal(parseLoginProofInput({ nonce, usernameHash: hex, proof: hex }).ok, true);
  assert.equal(parseLoginProofInput({ nonce: "short", usernameHash: hex, proof: hex }).ok, false);
  assert.equal(parseLoginProofInput({ nonce, usernameHash: "admin", proof: hex }).ok, false);
  assert.equal(parseLoginProofInput({ username: "admin", password: "secret" }).ok, false, "plain credentials are no longer accepted");
  assert.equal(parseLoginProofInput("nope").ok, false);
});

test("browser proof (Web Crypto) matches the server's computation", async () => {
  const expected = { username: "admin", password: "S3cret!pass ₹" };
  const nonce = await issueChallenge();
  const fromBrowser = await buildLoginProof(nonce, " admin ", "S3cret!pass ₹");
  assert.equal(fromBrowser.usernameHash, hashUsername("admin"));
  assert.equal(fromBrowser.proof, computeLoginProof(nonce, hashUsername("admin"), expected.password));
  assert.equal(verifyLoginProof({ nonce, ...fromBrowser }, expected), true);

  // the request body never contains the password or username
  const body = JSON.stringify({ nonce, ...fromBrowser });
  assert.ok(!body.includes("S3cret") && !body.includes("admin"));

  const wrongPass = await buildLoginProof(nonce, "admin", "wrong");
  assert.equal(verifyLoginProof({ nonce, ...wrongPass }, expected), false);
  const wrongUser = await buildLoginProof(nonce, "other", expected.password);
  assert.equal(verifyLoginProof({ nonce, ...wrongUser }, expected), false);
  const otherNonce = await issueChallenge();
  assert.equal(verifyLoginProof({ nonce: otherNonce, ...fromBrowser }, expected), false, "proof is bound to its nonce");
});

test("login challenges are single-use", async () => {
  const nonce = await issueChallenge();
  assert.equal(await consumeChallenge(nonce), true);
  assert.equal(await consumeChallenge(nonce), false, "replay must fail");
  assert.equal(await consumeChallenge("x".repeat(43)), false, "unknown nonce");
  assert.equal(await consumeChallenge("bad"), false, "malformed nonce");
});

// ---------- rate storage ----------

test("returns null before any rate is published (no fabricated rate)", async () => {
  assert.equal(await getCurrentRate(), null);
});

test("publishes and reads back the full record with a server timestamp", async () => {
  const now = new Date("2026-10-13T06:05:00Z");
  await publishRate({ rate: 15000, marketDate: "2026-10-13" }, now);
  assert.equal((await getCurrentRate())?.rate, 15000);

  const later = new Date("2026-10-13T06:10:00Z");
  const rec = await publishRate({ rate: 15550, marketDate: "2026-10-13" }, later);
  assert.deepEqual(await getCurrentRate(), rec);
  assert.equal(rec.updatedAt, "2026-10-13T06:10:00.000Z");
  assert.equal(rec.status, "CONFIRMED");
});

test("a failed write leaves the previous rate in place", async () => {
  await publishRate({ rate: 15000, marketDate: "2026-10-13" });
  const failing: KeyValueStore = {
    ...store,
    get: (k) => store.get(k),
    set: async () => {
      throw new StorageError("simulated outage");
    },
    del: (k) => store.del(k),
    incrementWithWindow: (k, w) => store.incrementWithWindow(k, w),
    ttl: (k) => store.ttl(k),
  };
  setStoreForTesting(failing);
  await assert.rejects(publishRate({ rate: 15550, marketDate: "2026-10-13" }), StorageError);
  assert.equal((await getCurrentRate())?.rate, 15000);
});

test("corrupt stored data raises an error instead of showing a wrong rate", async () => {
  await store.set(RATE_KEY, JSON.stringify({ rate: 0, marketDate: "x" }));
  await assert.rejects(getCurrentRate(), StorageError);
  await store.set(RATE_KEY, "{not json");
  await assert.rejects(getCurrentRate(), StorageError);
});

// ---------- sessions ----------

test("session lifecycle: create, verify, logout invalidates", async () => {
  const { token, maxAge } = await createSession("admin", SECRET);
  assert.equal(maxAge, SESSION_TTL_SECONDS);
  assert.equal((await verifySession(token, SECRET))?.username, "admin");

  await destroySession(token, SECRET);
  assert.equal(await verifySession(token, SECRET), null, "token must stop working after logout");
});

test("rejects tampered, wrongly-signed, malformed and expired tokens", async () => {
  const now = Date.now();
  const { token } = await createSession("admin", SECRET, now);
  const [id, exp, sig] = token.split(".");

  assert.equal(await verifySession(`${id}.${Number(exp) + 9999}.${sig}`, SECRET), null);
  assert.equal(await verifySession(token, "y".repeat(48)), null);
  assert.equal(await verifySession("garbage", SECRET), null);
  assert.equal(await verifySession("", SECRET), null);
  assert.equal(await verifySession(undefined, SECRET), null);
  assert.equal(parseSignedToken(token, SECRET, now + (SESSION_TTL_SECONDS + 1) * 1000), null);
});

// ---------- login throttling ----------

test("blocks an IP after repeated failures and clears on success", async () => {
  const ip = "203.0.113.7";
  for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
    assert.equal((await getLoginBlock(ip)).blocked, false);
    await recordFailedLogin(ip);
  }
  const block = await getLoginBlock(ip);
  assert.equal(block.blocked, true);
  if (block.blocked) assert.ok(block.retryAfterSeconds > 0);

  assert.equal((await getLoginBlock("198.51.100.1")).blocked, false, "other IPs unaffected");

  await clearFailedLogins(ip);
  assert.equal((await getLoginBlock(ip)).blocked, false);
});

test("IST formatting edge cases: midnight, noon, month names", () => {
  assert.equal(formatISTTime("2026-10-12T18:30:00.000Z"), "12:00 AM IST");
  assert.equal(formatISTTime("2026-10-13T06:30:00.000Z"), "12:00 PM IST");
  assert.equal(formatISTDateTime("2026-09-01T03:30:00.000Z"), "1 Sep 2026, 9:00 AM IST");
  assert.equal(formatMarketDate("2026-01-05"), "5 January 2026");
  assert.equal(todayInIST(new Date("2026-12-31T18:29:59Z")), "2026-12-31");
  assert.equal(todayInIST(new Date("2026-12-31T18:30:00Z")), "2027-01-01");
});

test("finds Upstash credentials under default, Upstash, prefixed and Redis-URL names", async () => {
  const { findStorageConfig } = await import("../lib/env");
  assert.equal(findStorageConfig({}).config, null);
  assert.equal(findStorageConfig({ KV_REST_API_URL: "https://a.upstash.io/", KV_REST_API_TOKEN: "t" }).config?.url, "https://a.upstash.io");
  assert.equal(findStorageConfig({ UPSTASH_REDIS_REST_URL: "https://b.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }).source, "UPSTASH_REDIS_REST_URL");
  const prefixed = findStorageConfig({ STORAGE_KV_REST_API_URL: "https://c.upstash.io", STORAGE_KV_REST_API_TOKEN: "tok" });
  assert.deepEqual(prefixed, { config: { url: "https://c.upstash.io", token: "tok" }, source: "STORAGE_KV_REST_API_URL" });
  const fromRedisUrl = findStorageConfig({ REDIS_URL: "rediss://default:secret%3Dx@d-1.upstash.io:6379" });
  assert.deepEqual(fromRedisUrl.config, { url: "https://d-1.upstash.io", token: "secret=x" });
  assert.equal(findStorageConfig({ REDIS_URL: "redis://localhost:6379" }).config, null);
  assert.equal(findStorageConfig({ KV_REST_API_URL: "https://x", KV_REST_API_TOKEN: "" }).config, null);
});
