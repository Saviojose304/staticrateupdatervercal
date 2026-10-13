/**
 * Small helpers for the API route handlers.
 */
import { NextResponse, type NextRequest } from "next/server";

/** Headers that stop browsers, WhatsApp's in-app browser and CDNs from reusing an old response. */
export const NO_STORE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
};

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } });
}

/**
 * Cross-site request protection for state-changing requests (on top of the
 * SameSite=Strict cookie): the browser-supplied Origin must match this site.
 */
export function isSameOriginRequest(request: NextRequest): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (!origin) return false;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Client IP as reported by Vercel's edge (it overwrites x-forwarded-for). */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Reads a small JSON body safely. Returns undefined on any problem. */
export async function readJsonBody(request: NextRequest, maxBytes = 2048): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) return undefined;
  const text = await request.text();
  if (text.length > maxBytes) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** In production, refuse plain-HTTP requests (Vercel normally redirects them anyway). */
export function isInsecureProductionRequest(request: NextRequest): boolean {
  return process.env.NODE_ENV === "production" && request.headers.get("x-forwarded-proto") === "http";
}
