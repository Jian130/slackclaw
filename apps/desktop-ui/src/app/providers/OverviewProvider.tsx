import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { ProductOverview, ChillClawEvent } from "@chillclaw/contracts";

import { fetchOverview } from "../../shared/api/client.js";
import { subscribeToDaemonEvents } from "../../shared/api/events.js";

interface OverviewContextValue {
  loading: boolean;
  error?: string;
  overview?: ProductOverview;
  refresh: (options?: { fresh?: boolean }) => Promise<ProductOverview | undefined>;
  setOverview: (next: ProductOverview) => void;
}

const OverviewContext = createContext<OverviewContextValue | null>(null);

export function shouldRefreshOverviewForEvent(event: ChillClawEvent): boolean {
  if (
    event.type === "overview.updated" ||
    event.type === "ai-team.updated" ||
    event.type === "model-config.updated" ||
    event.type === "channel-config.updated" ||
    event.type === "skill-catalog.updated" ||
    event.type === "preset-skill-sync.updated"
  ) {
    return false;
  }

  if (event.type === "task.progress") {
    return event.status !== "running";
  }

  return event.type === "deploy.completed" || event.type === "gateway.status";
}

export function OverviewProvider(props: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [overview, setOverviewState] = useState<ProductOverview>();

  const refresh = useCallback(async (options?: { fresh?: boolean }) => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await fetchOverview(options);
      setOverviewState(next);
      return next;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load ChillClaw.");
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribeToDaemonEvents((event) => {
      if (event.type === "overview.updated") {
        setOverviewState(event.snapshot.data);
        setLoading(false);
        setError(undefined);
        return;
      }

      if (!shouldRefreshOverviewForEvent(event)) {
        return;
      }

      void refresh();
    });
  }, [refresh]);

  const value = useMemo(
    () => ({
      loading,
      error,
      overview,
      refresh,
      setOverview(next: ProductOverview) {
        setOverviewState(next);
      }
    }),
    [error, loading, overview, refresh]
  );

  return <OverviewContext.Provider value={value}>{props.children}</OverviewContext.Provider>;
}

export function useOverview() {
  const value = useContext(OverviewContext);

  if (!value) {
    throw new Error("useOverview must be used within OverviewProvider");
  }

  return value;
}
