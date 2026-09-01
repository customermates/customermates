"use client";

import { Fragment } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Loader2, SendHorizonal } from "lucide-react";

import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { ROUTINE_RUN_STATUS_CHIP_COLOR } from "@/ee/routines/routine-run-chip-colors";
import {
  AgentActivity,
  AgentChatItemView,
  consecutiveActivityItems,
} from "@/app/components/agent-chat/agent-chat-items";
import { AgentChatStoreProvider } from "@/app/components/agent-chat/agent-chat-store-context";

export const RoutineRunModal = observer(() => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { routineRunModalStore: store, routineRunChatStore: chat } = useRootStore();
  const run = store.run;

  return (
    <AppModal store={store} title={t("RoutineDetail.runTitle")}>
      <AppCard>
        <AppCardHeader>
          <h2 className="truncate text-x-lg">
            {run ? intlStore.formatNumericalShortDateTime(run.createdAt) : t("RoutineDetail.runTitle")}
          </h2>

          {run && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="text-subdued text-xs">{`${t("RoutineDetail.credits")}: ${run.chargedCredits}`}</span>

              <AppChip size="sm" variant={ROUTINE_RUN_STATUS_CHIP_COLOR[run.status]}>
                {t(`RoutineRunStatus.${run.status}`)}
              </AppChip>
            </div>
          )}
        </AppCardHeader>

        <AppCardBody className="min-h-64">
          {store.isConversationLoading ? (
            <Spinner aria-label={t("PageState.loading")} />
          ) : (
            <AgentChatStoreProvider store={chat}>
              <div className="space-y-3" role="log">
                {chat.items.map((item, index) => {
                  const previous = chat.items[index - 1];

                  return (
                    <Fragment key={item.id}>
                      {item.kind === "activity" ? (
                        previous?.kind === "activity" ? null : (
                          <AgentActivity
                            isTrailing={
                              index + consecutiveActivityItems(chat.items, index).length === chat.items.length
                            }
                            isWorking={chat.isWorking}
                            items={consecutiveActivityItems(chat.items, index)}
                          />
                        )
                      ) : (
                        <AgentChatItemView item={item} />
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </AgentChatStoreProvider>
          )}
        </AppCardBody>

        {store.canFollowUp && (
          <div className="flex items-end gap-2 border-t p-4">
            <Textarea
              className="min-h-10 flex-1 resize-none"
              placeholder={t("RoutineDetail.followUpPlaceholder")}
              rows={1}
              value={chat.composerDraft}
              onChange={(event) => chat.setComposerDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                runUserAction(() => Promise.resolve(store.sendFollowUp()));
              }}
            />

            <Button
              aria-label={t("RoutineDetail.followUpPlaceholder")}
              disabled={chat.isWorking || !chat.composerDraft.trim()}
              size="icon"
              onClick={() => runUserAction(() => Promise.resolve(store.sendFollowUp()))}
            >
              {chat.isWorking ? <Loader2 className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
            </Button>
          </div>
        )}
      </AppCard>
    </AppModal>
  );
});
