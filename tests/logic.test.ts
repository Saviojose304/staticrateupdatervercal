/**
 * Unit tests for the framework-independent logic.
 * Run with: npm test
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { formatINR, formatMarketDate, formatISTTime, formatISTDateTime, todayInIST } from "../lib/format";
import { parseRate, parseMarketDate, parseLoginInput } from "../lib/validation";
import { MemoryStore, setStoreForTesting, StorageError, type KeyValueStore } from "../lib/kv";
import { getCurrentRate, publishRate, RATE_KEY } from "../lib/rate-store";
import { createSession, verifySession, destroySession, parseSignedToken, SESSION_TTL_SECONDS } from "../lib/session";
import { getLoginBlock, recordFailedLogin, clearFailedLogins, MAX_FAILED_ATTEMPTS } from "../lib/rate-limit";
import { credentialsMatch } from "../lib/credentials";

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

test("validates login input shape", () => {
  assert.equal(parseLoginInput({ username: "a", password: "b" }).ok, true);
  assert.equal(parseLoginInput({ username: "", password: "b" }).ok, false);
  assert.equal(parseLoginInput({ username: "a" }).ok, false);
  assert.equal(parseLoginInput("nope").ok, false);
});

test("credential comparison", () => {
  const expected = { username: "admin", password: "S3cret!pass" };
  assert.equal(credentialsMatch({ username: "admin", password: "S3cret!pass" }, expected), true);
  assert.equal(credentialsMatch({ username: "admin", password: "wrong" }, expected), false);
  assert.equal(credentialsMatch({ username: "other", password: "S3cret!pass" }, expected), false);
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
