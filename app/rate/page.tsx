import type { Metadata } from "next";
import RateView from "@/components/RateView";
import type { RateState } from "@/components/RateCard";
import { getBusinessName } from "@/lib/env";
import { getCurrentRate, toPublicRecord } from "@/lib/rate-store";

// Never statically generate or cache this page: every visit reads the latest record.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function generateMetadata(): Metadata {
  const business = getBusinessName();
  // The rate itself is deliberately NOT put in link-preview tags: WhatsApp caches
  // previews, so an old number could appear in the chat.
  return {
    title: { absolute: `Today's Market Rate | ${business}` },
    description: "Open this page to see the latest published market rate.",
    openGraph: {
      title: `Today's Market Rate | ${business}`,
      description: "Open this page to see the latest published market rate.",
      type: "website",
    },
  };
}

async function loadInitialState(): Promise<RateState> {
  try {
    const record = await getCurrentRate();
    return record ? { kind: "ok", record: toPublicRecord(record) } : { kind: "not_published" };
  } catch (error) {
    console.error("[rate page] Failed to load rate:", error instanceof Error ? error.message : error);
    return { kind: "error", message: "Please tap Refresh to try again in a moment." };
  }
}

export default async function RatePage() {
  const initialState = await loadInitialState();

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 sm:py-14">
      <RateView businessName={getBusinessName()} initialState={initialState} />
    </main>
  );
}
