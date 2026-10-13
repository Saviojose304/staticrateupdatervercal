/**
 * Server-only configuration helpers.
 *
 * Never import this file from a Client Component: it reads private
 * environment variables. None of these variables use the NEXT_PUBLIC_
 * prefix, so Next.js will not inline them into browser bundles.
 */

export class ConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Missing or invalid environment variables: ${missing.join(", ")}`);
    this.name = "ConfigError";
  }
}

export interface AdminConfig {
  username: string;
  password: string;
  sessionSecret: string;
}

export const MIN_SESSION_SECRET_LENGTH = 32;

/** Reads and validates the admin credentials and session secret. Throws ConfigError. */
export function getAdminConfig(): AdminConfig {
  const username = process.env.ADMIN_USERNAME?.trim() ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "";
  const sessionSecret = process.env.SESSION_SECRET ?? "";

  const problems: string[] = [];
  if (!username) problems.push("ADMIN_USERNAME");
  if (!password) problems.push("ADMIN_PASSWORD");
  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    problems.push(`SESSION_SECRET (must be at least ${MIN_SESSION_SECRET_LENGTH} characters)`);
  }
  if (problems.length > 0) throw new ConfigError(problems);

  return { username, password, sessionSecret };
}

export interface StorageConfig {
  url: string;
  token: string;
}

/**
 * Upstash Redis REST credentials.
 *
 * The Vercel Marketplace integration injects KV_REST_API_URL / KV_REST_API_TOKEN.
 * A database created directly in the Upstash console uses the
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN names. Both are accepted.
 */
export function getStorageConfig(): StorageConfig | null {
  return findStorageConfig(process.env).config;
}

/**
 * Finds Upstash REST credentials in the environment. Tries, in order:
 *  1. KV_REST_API_URL / KV_REST_API_TOKEN (Vercel Marketplace default)
 *  2. UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (Upstash console)
 *  3. Any custom prefix chosen when connecting the store in Vercel,
 *     e.g. STORAGE_KV_REST_API_URL / STORAGE_KV_REST_API_TOKEN
 *  4. A Redis connection URL (KV_URL, REDIS_URL or <PREFIX>_KV_URL / <PREFIX>_REDIS_URL)
 *     pointing at Upstash: rediss://default:<token>@<host>:6379 → https://<host> + <token>
 *
 * `source` names the variable that was used (never its value) for diagnostics.
 */
export function findStorageConfig(env: Record<string, string | undefined>): { config: StorageConfig | null; source: string | null } {
  const val = (name: string) => (env[name] ?? "").trim();
  const make = (url: string, token: string, source: string) => ({
    config: { url: url.replace(/\/+$/, ""), token },
    source,
  });

  const urlSuffixes: [string, string][] = [
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ];

  for (const [u, t] of urlSuffixes) {
    if (val(u) && val(t)) return make(val(u), val(t), u);
  }
  for (const [u, t] of urlSuffixes) {
    for (const name of Object.keys(env)) {
      if (name.endsWith(`_${u}`)) {
        const prefix = name.slice(0, -u.length);
        if (val(name) && val(prefix + t)) return make(val(name), val(prefix + t), name);
      }
    }
  }

  const redisUrlNames = Object.keys(env).filter(
    (n) => n === "KV_URL" || n === "REDIS_URL" || n.endsWith("_KV_URL") || n.endsWith("_REDIS_URL")
  );
  for (const name of redisUrlNames) {
    try {
      const parsed = new URL(val(name));
      if ((parsed.protocol === "rediss:" || parsed.protocol === "redis:") && parsed.hostname.endsWith(".upstash.io") && parsed.password) {
        return make(`https://${parsed.hostname}`, decodeURIComponent(parsed.password), name);
      }
    } catch {
      // not a URL; ignore
    }
  }

  return { config: null, source: null };
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Business name shown on the public page. Not secret. */
export function getBusinessName(): string {
  const name = process.env.BUSINESS_NAME?.trim();
  return name && name.length <= 80 ? name : "Market Rates";
}

/**
 * The permanent public base URL used in the WhatsApp share message.
 * Priority: PUBLIC_SITE_URL → Vercel's production domain → the current request host.
 */
export function getPublicBaseUrl(requestHost?: string | null, requestProto?: string | null): string {
  const explicit = process.env.PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) return `https://${vercelProd.replace(/\/+$/, "")}`;

  if (requestHost) {
    const proto = requestProto === "http" ? "http" : "https";
    return `${proto}://${requestHost}`;
  }
  return "http://localhost:3000";
}
