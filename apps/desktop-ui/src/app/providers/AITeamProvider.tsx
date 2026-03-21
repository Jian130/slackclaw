import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type {
  AITeamOverview,
  DeleteAIMemberRequest,
  SaveAIMemberRequest,
  SaveTeamRequest
} from "@slackclaw/contracts";

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
import { settleAfterMutation } from "../../shared/data/settle.js";

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

  async function settleAITeamOverview<TResponse extends { overview: AITeamOverview }>(options: {
    mutate: () => Promise<TResponse>;
    isSettled: (state: AITeamOverview, mutation: TResponse) => boolean;
  }) {
    return settleAfterMutation<TResponse, AITeamOverview>({
      mutate: options.mutate,
      getProvisionalState: (mutation) => mutation.overview,
      applyState: setOverview,
      readFresh: async () => {
        const next = await fetchAITeamOverview({ fresh: true });
        setOverview(next);
        return next;
      },
      isSettled: options.isSettled,
      attempts: 8,
      delayMs: 700
    });
  }

  const value = useMemo<AITeamContextValue>(
    () => ({
      loading,
      error,
      overview,
      refresh,
      async saveMember(memberId, request) {
        const previousMemberIds = new Set((overview?.members ?? []).map((member) => member.id));
        const response = await settleAITeamOverview({
          mutate: () => (memberId ? updateAIMember(memberId, request) : createAIMember(request)),
          isSettled: (state, mutation) => {
            const expectedMember = memberId
              ? mutation.overview.members.find((member) => member.id === memberId)
              : mutation.overview.members.find((member) => !previousMemberIds.has(member.id));

            if (!expectedMember) {
              return false;
            }

            const actualMember = state.members.find((member) => member.id === expectedMember.id);
            return JSON.stringify(actualMember) === JSON.stringify(expectedMember);
          }
        });
        return response.state;
      },
      async removeMember(memberId, request) {
        const response = await settleAITeamOverview({
          mutate: () => deleteAIMember(memberId, request),
          isSettled: (state) => !state.members.some((member) => member.id === memberId)
        });
        return response.state;
      },
      async bindChannel(memberId, binding) {
        const response = await settleAITeamOverview({
          mutate: () => bindAIMemberChannel(memberId, { binding }),
          isSettled: (state) => Boolean(state.members.find((member) => member.id === memberId)?.bindings.some((item) => item.target === binding))
        });
        return response.state;
      },
      async unbindChannel(memberId, binding) {
        const response = await settleAITeamOverview({
          mutate: () => unbindAIMemberChannel(memberId, { binding }),
          isSettled: (state) => !state.members.find((member) => member.id === memberId)?.bindings.some((item) => item.target === binding)
        });
        return response.state;
      },
      async saveTeam(teamId, request) {
        const previousTeamIds = new Set((overview?.teams ?? []).map((team) => team.id));
        const response = await settleAITeamOverview({
          mutate: () => (teamId ? updateTeam(teamId, request) : createTeam(request)),
          isSettled: (state, mutation) => {
            const expectedTeam = teamId
              ? mutation.overview.teams.find((team) => team.id === teamId)
              : mutation.overview.teams.find((team) => !previousTeamIds.has(team.id));

            if (!expectedTeam) {
              return false;
            }

            const actualTeam = state.teams.find((team) => team.id === expectedTeam.id);
            return JSON.stringify(actualTeam) === JSON.stringify(expectedTeam);
          }
        });
        return response.state;
      },
      async removeTeam(teamId) {
        const response = await settleAITeamOverview({
          mutate: () => deleteTeam(teamId),
          isSettled: (state) => !state.teams.some((team) => team.id === teamId)
        });
        return response.state;
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
