"use client";

import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { AppChip } from "@/components/chip/app-chip";
import { agentContextAttachmentKey } from "@/ee/agent-chat/agent-context";

import { focusAgentComposer } from "./chat-ui";
import { useAgentChatUiTargets } from "./agent-chat-store-context";

export function AgentComposerContexts({
  contexts,
  onRemove,
}: {
  contexts: readonly AgentContextAttachment[];
  onRemove?: (key: string) => void;
}) {
  const t = useTranslations();
  const uiTargets = useAgentChatUiTargets();
  const groupRef = useRef<HTMLSpanElement | null>(null);
  if (contexts.length === 0) return null;

  return (
    <span ref={groupRef} className="contents" data-testid="agent-composer-contexts">
      {contexts.map((context, index) => {
        const key = agentContextAttachmentKey(context);
        const removeContext = (focusDirection: "next" | "previous") => {
          onRemove?.(key);
          requestAnimationFrame(() => {
            const remaining = groupRef.current?.querySelectorAll<HTMLButtonElement>(
              '[data-agent-context-remove="true"]',
            );
            const focusIndex =
              focusDirection === "previous"
                ? Math.max(0, index - 1)
                : Math.min(index, Math.max((remaining?.length ?? 0) - 1, 0));
            const next = remaining?.item(focusIndex);
            if (next) next.focus();
            else focusAgentComposer(uiTargets);
          });
        };
        return (
          <AppChip
            key={key}
            className="me-1.5 my-px h-5 max-w-full px-[5px] py-0 align-middle text-sm leading-5 font-normal"
            endContent={
              onRemove ? (
                <button
                  aria-label={t("AgentChat.context.remove", {
                    label: context.label,
                  })}
                  className="-mr-0.5 grid size-3.5 shrink-0 place-items-center rounded-sm text-current/60 outline-hidden transition-colors hover:bg-foreground/10 hover:text-current focus-visible:ring-2 focus-visible:ring-ring"
                  data-agent-context-remove="true"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeContext("next");
                  }}
                  onKeyDown={(event) => {
                    if (
                      (event.key !== "Backspace" && event.key !== "Delete") ||
                      event.nativeEvent.isComposing ||
                      event.altKey ||
                      event.ctrlKey ||
                      event.metaKey ||
                      event.shiftKey
                    )
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    removeContext(event.key === "Backspace" ? "previous" : "next");
                  }}
                >
                  <X aria-hidden className="size-2.5" />
                </button>
              ) : undefined
            }
            size="sm"
            tooltip={context.label}
            variant="default"
          >
            {context.label}
          </AppChip>
        );
      })}
    </span>
  );
}
