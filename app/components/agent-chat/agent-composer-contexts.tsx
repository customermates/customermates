"use client";

import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";

import { LayoutPanelTop, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { ENTITY_ICON } from "@/components/entity-detail/entity-relations";
import { agentContextAttachmentKey } from "@/ee/agent-chat/agent-context";

function ContextIcon({ context }: { context: AgentContextAttachment }) {
  if (context.reference.kind === "dataView") return <LayoutPanelTop aria-hidden />;
  const Icon = ENTITY_ICON[context.reference.entityType];
  return <Icon aria-hidden />;
}

export function AgentComposerContexts({
  contexts,
  onRemove,
}: {
  contexts: readonly AgentContextAttachment[];
  onRemove?: (key: string) => void;
}) {
  const t = useTranslations();
  if (contexts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-1 pb-1.5" data-testid="agent-composer-contexts">
      {contexts.map((context) => {
        const key = agentContextAttachmentKey(context);
        return (
          <AppChip
            key={key}
            className="max-w-full pr-1"
            endContent={
              onRemove ? (
                <button
                  aria-label={t("AgentChat.context.remove", {
                    label: context.label,
                  })}
                  className="-mr-0.5 grid size-4 shrink-0 place-items-center rounded-sm text-current/60 outline-hidden transition-colors hover:bg-foreground/10 hover:text-current focus-visible:ring-2 focus-visible:ring-ring"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(key);
                  }}
                >
                  <X aria-hidden className="size-3" />
                </button>
              ) : undefined
            }
            size="md"
            startContent={<ContextIcon context={context} />}
            tooltip={context.label}
            variant="default"
          >
            {context.label}
          </AppChip>
        );
      })}
    </div>
  );
}
