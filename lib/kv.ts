/**
 * Minimal key-value layer on top of the Upstash Redis REST API.
 *
 * Production: always talks to Upstash over HTTPS (works from Vercel serverless
 * functions, no persistent connections needed).
 *
 * Local development only: if no Upstash credentials are configured, an
 * in-memory store is used so you can try the UI without an account. It is
 * NEVER used when NODE_ENV=production; a missing configuration there is an error.
 */
import { getStorageConfig, isProduction, type StorageConfig } from "./env";

export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageError";
  }
}

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomically increments a counter, starting its expiry window on the first increment. */
  incrementWithWindow(key: string, windowSeconds: number): Promise<number>;
  /** Remaining seconds before the key expires; -2 if missing, -1 if no expiry. */
  ttl(key: string): Promise<number>;
}

const REQUEST_TIMEOUT_MS = 5000;

// Lua script: INCR and set the expiry only when the counter is new. Runs atomically.
const INCR_WINDOW_SCRIPT =
  "local c = redis.call('INCR', KEYS[1]) " +
  "if c == 1 or redis.call('TTL', KEYS[1]) == -1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end " +
  "return c";

class UpstashRestStore implements KeyValueStore {
  constructor(private readonly config: StorageConfig) {}

  private async command<T>(args: (string | number)[]): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.config.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new StorageError(`Storage request failed (${String(args[0])})`, { cause: error });
    }

    let payload: { result?: T; error?: string };
    try {
      payload = (await response.json()) as { result?: T; error?: string };
    } catch (error) {
      throw new StorageError(`Storage returned an unreadable response (HTTP ${response.status})`, {
        cause: error,
      });
    }

    if (!response.ok || payload.error) {
      // payload.error comes from Upstash and never contains our token.
      throw new StorageError(`Storage error (HTTP ${response.status}): ${payload.error ?? "unknown"}`);
    }
    return payload.result as T;
  }

  async get(key: string) {
    const result = await this.command<string | null>(["GET", key]);
    return result ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    const args: (string | number)[] = ["SET", key, value];
    if (ttlSeconds && ttlSeconds > 0) args.push("EX", Math.ceil(ttlSeconds));
    const result = await this.command<string>(args);
    if (result !== "OK") throw new StorageError("Storage did not confirm the write");
  }

  async del(key: string) {
    await this.command<number>(["DEL", key]);
  }

  async incrementWithWindow(key: string, windowSeconds: number) {
    const result = await this.command<number>(["EVAL", INCR_WINDOW_SCRIPT, 1, key, windowSeconds]);
    return Number(result);
  }

  async ttl(key: string) {
    return Number(await this.command<number>(["TTL", key]));
  }
}

/** Development-only store. Data disappears when the dev server restarts. */
export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, { value: string; expiresAt: number | null }>();

  private live(key: string) {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return null;
    }
    return entry;
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    this.data.set(key, {
      value,
      expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string) {
    this.data.delete(key);
  }

  async incrementWithWindow(key: string, windowSeconds: number) {
    const entry = this.live(key);
    if (!entry) {
      this.data.set(key, { value: "1", expiresAt: Date.now() + windowSeconds * 1000 });
      return 1;
    }
    const next = Number(entry.value) + 1;
    entry.value = String(next);
    return next;
  }

  async ttl(key: string) {
    const entry = this.live(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }
}

type GlobalWithStore = typeof globalThis & { __rateDevMemoryStore?: MemoryStore; __rateDevWarned?: boolean };

let testStore: KeyValueStore | null = null;

/** Used by the unit tests only. */
export function setStoreForTesting(store: KeyValueStore | null) {
  testStore = store;
}

export function getStore(): KeyValueStore {
  if (testStore) return testStore;

  const config = getStorageConfig();
  if (config) return new UpstashRestStore(config);

  if (isProduction()) {
    throw new StorageError(
      "Storage is not configured: set KV_REST_API_URL and KV_REST_API_TOKEN (or the UPSTASH_REDIS_REST_* equivalents)."
    );
  }

  const g = globalThis as GlobalWithStore;
  if (!g.__rateDevWarned) {
    console.warn(
      "[kv] No Upstash credentials found. Using a temporary IN-MEMORY store for local development only."
    );
    g.__rateDevWarned = true;
  }
  g.__rateDevMemoryStore ??= new MemoryStore();
  return g.__rateDevMemoryStore;
}
