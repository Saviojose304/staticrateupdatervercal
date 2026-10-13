import type { NextRequest } from "next/server";
import { checkAdminSession } from "@/lib/auth";
import { json, isSameOriginRequest, readJsonBody } from "@/lib/http";
import { StorageError } from "@/lib/kv";
import { getCurrentRate, publishRate, toPublicRecord } from "@/lib/rate-store";
import { parseMarketDate, parseRate } from "@/lib/validation";

// Always run on request; never serve a cached rate.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * GET /api/rate — public. Returns only the public rate record.
 *   200 { status: "ok", record }
 *   200 { status: "not_published", record: null }
 *   503 { status: "error", message }
 */
export async function GET() {
  try {
    const record = await getCurrentRate();
    if (!record) return json({ status: "not_published", record: null });
    return json({ status: "ok", record: toPublicRecord(record) });
  } catch (error) {
    console.error("[api/rate GET] Failed to read rate:", error instanceof Error ? error.message : error);
    return json({ status: "error", message: "The rate could not be loaded right now. Please try again shortly." }, 503);
  }
}

/**
 * POST /api/rate — admin only. Body: { rate: string | number, marketDate: "YYYY-MM-DD" }
 * The timestamp and status are set by the server; any other fields are ignored.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return json({ status: "error", message: "Request blocked." }, 403);
  }

  const auth = await checkAdminSession();
  if (auth.state === "error") {
    return json({ status: "error", message: "The server is not available right now. Please try again." }, 503);
  }
  if (auth.state !== "authenticated") {
    return json({ status: "error", code: "UNAUTHENTICATED", message: "Your session has expired. Please log in again." }, 401);
  }

  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") {
    return json({ status: "error", message: "Invalid request." }, 400);
  }
  const { rate: rawRate, marketDate: rawDate } = body as Record<string, unknown>;

  const rate = parseRate(rawRate);
  const marketDate = parseMarketDate(rawDate);
  if (!rate.ok || !marketDate.ok) {
    return json(
      {
        status: "error",
        message: "Please correct the highlighted fields.",
        fieldErrors: {
          ...(rate.ok ? {} : { rate: rate.error }),
          ...(marketDate.ok ? {} : { marketDate: marketDate.error }),
        },
      },
      400
    );
  }

  try {
    const record = await publishRate({ rate: rate.value, marketDate: marketDate.value });
    console.info(`[api/rate POST] Rate published by ${auth.session.username}: ${record.rate} for ${record.marketDate}`);
    return json({ status: "ok", record: toPublicRecord(record) });
  } catch (error) {
    const message = error instanceof StorageError ? error.message : String(error);
    console.error("[api/rate POST] Publish failed; previous rate unchanged:", message);
    return json(
      { status: "error", message: "The rate could not be published. The previously published rate is unchanged. Please try again." },
      503
    );
  }
}
