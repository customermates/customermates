"use client";

import type { AgentActivityResource } from "@/ee/agent-chat/agent-activity";
import type { RoutineTranscriptMessage } from "@/ee/routines/get-routine-run-transcript.interactor";

import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { agentActivityCopy } from "@/ee/agent-chat/agent-activity";
import { MessageResponse } from "@/components/ai-elements/message";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";

type Props = { messages: RoutineTranscriptMessage[] };

function useActivityTerminology(): Partial<Record<AgentActivityResource, string>> {
  const { plural } = useEntityTerminology();

  return {
    contacts: plural(EntityType.contact),
    organizations: plural(EntityType.organization),
    deals: plural(EntityType.deal),
    services: plural(EntityType.service),
    tasks: plural(EntityType.task),
  };
}

export function RoutineRunTranscript({ messages }: Props) {
  const t = useTranslations();
  const terminology = useActivityTerminology();

  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => (
        <div key={message.id} className="flex flex-col gap-2">
          {message.parts.map((part, index) => {
            if (part.type === "text" && message.role === "user") {
              return (
                <article key={`${message.id}-${index}`} aria-label={t("Inbox.senderYou")} className="flex justify-end">
                  <div className="w-fit min-w-16 max-w-[85%] rounded-xl rounded-br-md bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap shadow-xs dark:bg-accent/60">
                    {part.text}
                  </div>
                </article>
              );
            }

            if (part.type === "text") {
              return (
                <article
                  key={`${message.id}-${index}`}
                  aria-label={t("AgentChat.title")}
                  className="w-full text-sm leading-relaxed [&_pre]:overflow-x-auto"
                >
                  <MessageResponse mode="static">{part.text}</MessageResponse>
                </article>
              );
            }

            const copy = agentActivityCopy(part.activity, t, terminology);

            return (
              <div
                key={`${message.id}-${index}`}
                data-routine-activity
                className="text-subdued flex items-center gap-2 text-xs"
              >
                <span aria-hidden="true" className="bg-border size-1.5 rounded-full" />

                <span>{part.status === "error" ? copy.error : copy.done}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
