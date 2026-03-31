import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type {
  AITeamOverview,
  DeleteAIMemberRequest,
  SaveAIMemberRequest,
  SaveTeamRequest
} from "@chillclaw/contracts";

import {
  bindAIMemberChannel,
  createAIMember,
  createTeam,
  deleteAIMember,
  deleteTeam,
  fetchAITeamOverview,
  unbindAIMemberChannel,
  updateAIMember,
  updateTeam
} from "../../shared/api/client.js";
import { subscribeToDaemonEvents } from "../../shared/api/events.js";

interface AITeamContextValue {
  loading: boolean;
  error?: string;
  overview?: AITeamOverview;
  refresh: (options?: { fresh?: boolean }) => Promise<AITeamOverview | undefined>;
  saveMember: (memberId: string | undefined, request: SaveAIMemberRequest) => Promise<AITeamOverview | undefined>;
  removeMember: (memberId: string, request: DeleteAIMemberRequest) => Promise<AITeamOverview | undefined>;
  bindChannel: (memberId: string, binding: string) => Promise<AITeamOverview | undefined>;
  unbindChannel: (memberId: string, binding: string) => Promise<AITeamOverview | undefined>;
  saveTeam: (teamId: string | undefined, request: SaveTeamRequest) => Promise<AITeamOverview | undefined>;
  removeTeam: (teamId: string) => Promise<AITeamOverview | undefined>;
}

const AITeamContext = createContext<AITeamContextValue | null>(null);

export function shouldRefreshAITeamForEvent(): boolean {
  return false;
}

export function AITeamProvider(props: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [overview, setOverview] = useState<AITeamOverview>();

  const refresh = useCallback(async (options?: { fresh?: boolean }) => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await fetchAITeamOverview(options);
      setOverview(next);
      return next;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load AI members.");
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
      if (event.type === "ai-team.updated") {
        setOverview(event.snapshot.data);
        setLoading(false);
        setError(undefined);
        return;
      }

      if (shouldRefreshAITeamForEvent()) {
        void refresh();
      }
    });
  }, [refresh]);

  const value = useMemo<AITeamContextValue>(
    () => ({
      loading,
      error,
      overview,
      refresh,
      async saveMember(memberId, request) {
        const response = await (memberId ? updateAIMember(memberId, request) : createAIMember(request));
        setOverview(response.overview);
        return response.overview;
      },
      async removeMember(memberId, request) {
        const response = await deleteAIMember(memberId, request);
        setOverview(response.overview);
        return response.overview;
      },
      async bindChannel(memberId, binding) {
        const response = await bindAIMemberChannel(memberId, { binding });
        setOverview(response.overview);
        return response.overview;
      },
      async unbindChannel(memberId, binding) {
        const response = await unbindAIMemberChannel(memberId, { binding });
        setOverview(response.overview);
        return response.overview;
      },
      async saveTeam(teamId, request) {
        const response = await (teamId ? updateTeam(teamId, request) : createTeam(request));
        setOverview(response.overview);
        return response.overview;
      },
      async removeTeam(teamId) {
        const response = await deleteTeam(teamId);
        setOverview(response.overview);
        return response.overview;
      }
    }),
    [error, loading, overview, refresh]
  );

  return <AITeamContext.Provider value={value}>{props.children}</AITeamContext.Provider>;
}

export function useAITeam() {
  const value = useContext(AITeamContext);

  if (!value) {
    throw new Error("useAITeam must be used within AITeamProvider");
  }

  return value;
}
