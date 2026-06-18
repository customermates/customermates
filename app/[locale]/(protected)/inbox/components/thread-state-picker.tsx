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
        {t(`Inbox.threadStates.${state}`)}
      </AppChip>
    );
  }

  return (
    <Select
      value={state}
      onValueChange={(next) => void messagingThreadDetailStore.setState(next as MessagingThreadState)}
    >
      <SelectTrigger
        className={cn(
          badgeVariants({ variant: THREAD_STATE_CHIP_COLOR[state] }),
          "interactive-surface h-[26px]! w-auto gap-1.5 rounded-md border-transparent px-2 text-xs shadow-none",
        )}
      >
        <ThreadStateDot state={state} />

        <span className="truncate">{t(`Inbox.threadStates.${state}`)}</span>
      </SelectTrigger>

      <SelectContent>
        {STATES.map((s) => (
          <SelectItem key={s} textValue={t(`Inbox.threadStates.${s}`)} value={s}>
            <span className="flex items-center gap-2">
              <ThreadStateDot state={s} />

              <span className="text-sm">{t(`Inbox.threadStates.${s}`)}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});
