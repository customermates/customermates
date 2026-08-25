"use client";

import { observer } from "mobx-react-lite";
import { useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Pencil, X } from "lucide-react";

import { useRootStore } from "@/core/stores/root-store.provider";
import { Button } from "@/components/ui/button";
import { ActionTooltip, chatUiCopy, focusAgentComposer } from "./chat-ui";

export const QueuedPrompt = observer(function QueuedPrompt() {
  const { agentChatStore: store } = useRootStore();
  const copy = chatUiCopy(useTranslations());
  const rowRef = useRef<HTMLDivElement>(null);
  const prompt = store.queuedPrompt;

  useLayoutEffect(
    () => () => {
      if (rowRef.current?.contains(document.activeElement)) focusAgentComposer();
    },
    [],
  );

  if (!prompt) return null;

  return (
    <div ref={rowRef} className="mb-2 flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1.5 text-xs" role="status">
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{copy.queued}:</span>

        <span>{` ${prompt}`}</span>
      </span>

      <ActionTooltip label={copy.editQueued}>
        <Button
          aria-label={copy.editQueued}
          className="size-7 shrink-0"
          disabled={Boolean(store.usage?.blockedReason)}
          size="icon"
          variant="ghost"
          onClick={store.editQueuedPrompt}
        >
          <Pencil className="size-3.5" />
        </Button>
      </ActionTooltip>

      <ActionTooltip label={copy.removeQueued}>
        <Button
          aria-label={copy.removeQueued}
          className="size-7 shrink-0"
          size="icon"
          variant="ghost"
          onClick={store.removeQueuedPrompt}
        >
          <X className="size-3.5" />
        </Button>
      </ActionTooltip>
    </div>
  );
});
