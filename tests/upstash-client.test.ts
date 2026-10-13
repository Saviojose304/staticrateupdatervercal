/**
 * Exercises the real Upstash REST client against a local fake server that
 * speaks the same protocol (POST JSON command array → { result } / { error }).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { getStore, setStoreForTesting, StorageError } from "../lib/kv";
import { getCurrentRate, publishRate } from "../lib/rate-store";

const TOKEN = "test-token";
const data = new Map<string, string>();
let mode: "normal" | "down" | "unauthorized" = "normal";
const seenCommands: string[] = [];
let server: Server;

before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      if (mode === "down") return send(500, { error: "ERR internal" });
      if (req.headers.authorization !== `Bearer ${TOKEN}` || mode === "unauthorized") {
        return send(401, { error: "WRONGPASS invalid token" });
      }
      const [cmd, ...args] = JSON.parse(body) as string[];
      seenCommands.push(String(cmd));
      switch (cmd) {
        case "GET":
          return send(200, { result: data.get(args[0]) ?? null });
        case "SET":
          data.set(args[0], String(args[1]));
          return send(200, { result: "OK" });
        case "DEL":
          return send(200, { result: data.delete(args[0]) ? 1 : 0 });
        case "EVAL": {
          const key = String(args[2]);
          const next = Number(data.get(key) ?? 0) + 1;
          data.set(key, String(next));
          return send(200, { result: next });
        }
        case "TTL":
          return send(200, { result: data.has(args[0]) ? 900 : -2 });
        default:
          return send(400, { error: `ERR unknown command ${cmd}` });
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.KV_REST_API_URL = `http://127.0.0.1:${port}/`;
  process.env.KV_REST_API_TOKEN = TOKEN;
  setStoreForTesting(null);
});

after(() => {
  server.close();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

test("publishes and reads a rate through the REST protocol", async () => {
  mode = "normal";
  assert.equal(await getCurrentRate(), null);
  await publishRate({ rate: 15550, marketDate: "2026-10-13" });
  const rec = await getCurrentRate();
  assert.equal(rec?.rate, 15550);
  assert.ok(seenCommands.includes("SET") && seenCommands.includes("GET"));
});

test("counter and TTL commands work", async () => {
  mode = "normal";
  assert.equal(await getStore().incrementWithWindow("c", 60), 1);
  assert.equal(await getStore().incrementWithWindow("c", 60), 2);
  assert.equal(await getStore().ttl("c"), 900);
});

test("storage outage surfaces as StorageError and leaves the stored rate unchanged", async () => {
  mode = "down";
  await assert.rejects(publishRate({ rate: 99999, marketDate: "2026-10-13" }), StorageError);
  await assert.rejects(getCurrentRate(), StorageError);
  mode = "normal";
  assert.equal((await getCurrentRate())?.rate, 15550);
});

test("a bad token is reported as StorageError without leaking the token", async () => {
  mode = "unauthorized";
  await assert.rejects(getCurrentRate(), (err: unknown) => {
    assert.ok(err instanceof StorageError);
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });
  mode = "normal";
});

test("an unreachable host is reported as StorageError", async () => {
  const saved = process.env.KV_REST_API_URL;
  process.env.KV_REST_API_URL = "http://127.0.0.1:1";
  await assert.rejects(getCurrentRate(), StorageError);
  process.env.KV_REST_API_URL = saved;
});
