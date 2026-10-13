"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatISTTime } from "@/lib/format";
import { fetchCurrentRate } from "@/lib/rate-client";
import RateCard, { type RateState } from "./RateCard";
import RefreshRateButton from "./RefreshRateButton";

interface Props {
  businessName: string;
  initialState: RateState;
}

const MIN_VISIBILITY_REFRESH_GAP_MS = 15_000;

/**
 * Public rate view. The first render comes from the server (always fresh).
 * "Refresh Rate" fetches again from the API. It also re-checks when the
 * customer switches back to this tab (e.g. returning from WhatsApp).
 */
export default function RateView({ businessName, initialState }: Props) {
  const [state, setState] = useState<RateState>(initialState);
  const [loading, setLoading] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const stateRef = useRef<RateState>(initialState);
  const lastFetchRef = useRef(Date.now());
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    lastFetchRef.current = Date.now();

    const result = await fetchCurrentRate();
    const previous = stateRef.current;

    if (result.kind === "error" && previous.kind === "ok") {
      // Keep the real, previously loaded rate on screen but say clearly that it may be out of date.
      setRefreshError(
        `Couldn't check for a newer rate. Showing the rate last updated at ${formatISTTime(previous.record.updatedAt)}. Please try again.`
      );
    } else {
      setRefreshError(null);
      stateRef.current = result;
      setState(result);
    }

    setLoading(false);
    inFlightRef.current = false;
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetchRef.current > MIN_VISIBILITY_REFRESH_GAP_MS) {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return (
    <RateCard businessName={businessName} state={state} loading={loading} refreshError={refreshError}>
      <RefreshRateButton onRefresh={refresh} loading={loading} />
    </RateCard>
  );
}
