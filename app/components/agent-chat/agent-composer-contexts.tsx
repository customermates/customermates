"use client";

import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";

import { useTranslations } from "next-intl";
import { useRef } from "react";

import { AppChip } from "@/components/chip/app-chip";
import { agentContextAttachmentKey, isAgentFileContext } from "@/ee/agent-chat/agent-context";

import { focusAgentComposer } from "./chat-ui";
import { useAgentChatUiTargets } from "./agent-chat-store-context";
import { AGENT_COMPOSER_CHIP_CLASS, AgentComposerChipRemove } from "./agent-composer-chip";
import { AgentComposerFileChip } from "./agent-composer-file-chip";

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
        const removeButton = onRemove ? (
          <AgentComposerChipRemove
            data-agent-context-remove="true"
            label={t("AgentChat.context.remove", { label: context.label })}
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
            onRemove={() => removeContext("next")}
          />
        ) : undefined;
        if (isAgentFileContext(context))
          return <AgentComposerFileChip key={key} context={context} removeButton={removeButton} />;
        return (
          <AppChip
            key={key}
            className={AGENT_COMPOSER_CHIP_CLASS}
            endContent={removeButton}
            size="sm"
            variant="default"
          >
            {context.label}
          </AppChip>
        );
      })}
    </span>
  );
}
