"use client";

import type { MessagingThreadState } from "@/ee/messaging/messaging.schema";

import { MessagingThreadStateSchema } from "@/ee/messaging/messaging.schema";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Action, Resource } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { badgeVariants } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/lib/utils";

import { THREAD_STATE_CHIP_COLOR, ThreadStateDot } from "./thread-state-visuals";

type Props = {
  state: MessagingThreadState;
};

const STATES = MessagingThreadStateSchema.options;

export const ThreadStatePicker = observer(({ state }: Props) => {
  const t = useTranslations();
  const { userStore, messagingThreadDetailStore } = useRootStore();

  if (!userStore.can(Resource.inboxMessages, Action.update)) {
    return (
      <AppChip startContent={<ThreadStateDot state={state} />} variant={THREAD_STATE_CHIP_COLOR[state]}>
        <span className="hidden sm:inline">{t(`Inbox.threadStates.${state}`)}</span>
      </AppChip>
    );
  }

  return (
    <Select
      value={state}
      onValueChange={(next) => void messagingThreadDetailStore.setState(next as MessagingThreadState)}
    >
      <SelectTrigger
        aria-label={t(`Inbox.threadStates.${state}`)}
        className={cn(
          badgeVariants({ variant: THREAD_STATE_CHIP_COLOR[state], interactive: true }),
          "h-8! w-auto gap-1.5 rounded-md border-transparent px-2 text-xs shadow-none",
        )}
      >
        <ThreadStateDot state={state} />

        <span className="hidden truncate sm:inline">{t(`Inbox.threadStates.${state}`)}</span>
      </SelectTrigger>

      <SelectContent>
        {STATES.map((s) => (
          <SelectItem key={s} textValue={t(`Inbox.threadStates.${s}`)} value={s}>
            <span className={cn(badgeVariants({ variant: THREAD_STATE_CHIP_COLOR[s] }), "h-6 px-2 text-xs")}>
              <ThreadStateDot state={s} />

              {t(`Inbox.threadStates.${s}`)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});
