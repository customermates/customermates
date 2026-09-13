"use client";

import type { AgentChatStore } from "./agent-chat.store";
import type { ReactNode } from "react";

import { createContext, useContext } from "react";

import { useRootStore } from "@/core/stores/root-store.provider";

const AgentChatStoreContext = createContext<AgentChatStore | null>(null);

export type AgentChatUiTargets = {
  composerId: string;
  fallbackFocusId: string;
  usageId: string;
};

const DEFAULT_AGENT_CHAT_UI_TARGETS: AgentChatUiTargets = {
  composerId: "agent-composer",
  fallbackFocusId: "agent-panel-dialog",
  usageId: "agent-usage",
};
const AgentChatUiTargetsContext = createContext<AgentChatUiTargets>(DEFAULT_AGENT_CHAT_UI_TARGETS);

export function AgentChatStoreProvider({
  children,
  store,
  uiTargets = DEFAULT_AGENT_CHAT_UI_TARGETS,
}: {
  children: ReactNode;
  store: AgentChatStore;
  uiTargets?: AgentChatUiTargets;
}) {
  return (
    <AgentChatStoreContext.Provider value={store}>
      <AgentChatUiTargetsContext.Provider value={uiTargets}>{children}</AgentChatUiTargetsContext.Provider>
    </AgentChatStoreContext.Provider>
  );
}

export function useAgentChatStore(): AgentChatStore {
  const scoped = useContext(AgentChatStoreContext);
  const { agentChatStore } = useRootStore();

  return scoped ?? agentChatStore;
}

export function useAgentChatUiTargets(): AgentChatUiTargets {
  return useContext(AgentChatUiTargetsContext);
}
