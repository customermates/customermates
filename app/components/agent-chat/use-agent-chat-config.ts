"use client";

import { useEffect } from "react";

import type { AgentChatStore } from "./agent-chat.store";

import { reportApplicationError } from "@/core/errors/report-application-error";

export function useAgentChatConfig(store: AgentChatStore, active = true): void {
  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const load = async () => {
      const status = await store.loadConfig();
      if (cancelled || status !== "retry") return;

      const wait = Math.min(30_000, 1_000 * 2 ** attempt++);
      timer = setTimeout(() => void load().catch(reportApplicationError), wait);
    };

    if (store.enabled === null) void load().catch(reportApplicationError);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, store]);
}
