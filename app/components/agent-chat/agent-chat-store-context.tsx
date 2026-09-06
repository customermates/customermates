"use client";

import type { AgentChatStore } from "./agent-chat.store";
import type { ReactNode } from "react";

import { createContext, useContext } from "react";

import { useRootStore } from "@/core/stores/root-store.provider";

const AgentChatStoreContext = createContext<AgentChatStore | null>(null);

export function AgentChatStoreProvider({ children, store }: { children: ReactNode; store: AgentChatStore }) {
  return <AgentChatStoreContext.Provider value={store}>{children}</AgentChatStoreContext.Provider>;
}

export function useAgentChatStore(): AgentChatStore {
  const scoped = useContext(AgentChatStoreContext);
  const { agentChatStore } = useRootStore();

  return scoped ?? agentChatStore;
}
