"use client";

import type { MessagingThreadState } from "@/ee/messaging/messaging.schema";

import { useEffect, useRef } from "react";
import { Action, Resource } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  threadId: string;
  state: MessagingThreadState;
};

export function ThreadAutoMarkRead({ threadId, state }: Props) {
  const { messagingThreadDetailStore, userStore } = useRootStore();
  const previous = useRef<{
    threadId: string;
    state: MessagingThreadState;
  } | null>(null);

  useEffect(() => {
    if (!userStore.can(Resource.inboxMessages, Action.update)) return;

    const prev = previous.current;
    previous.current = { threadId, state };

    if (state !== "unread") return;
    if (prev && prev.threadId === threadId && prev.state !== "unread") return;

    void messagingThreadDetailStore.markRead();
  }, [threadId, state, messagingThreadDetailStore, userStore]);

  return null;
}
