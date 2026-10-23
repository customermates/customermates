"use client";

import type { ThreadComposeStore } from "./thread-compose.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";

type Props = {
  store: Pick<ThreadComposeStore, "draftConflict" | "isLoading" | "resolveDraftConflict">;
  senderUnavailable: boolean;
};

export const DraftConflictBar = observer(({ store, senderUnavailable }: Props) => {
  const t = useTranslations();

  if (!store.draftConflict) return null;

  return (
    <Alert className="rounded-none border-x-0 border-t-0 px-3 py-2" color="warning" role="status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>{t("Inbox.compose.draftChangedNotice")}</p>

        <div className="flex items-center gap-2">
          <Button
            disabled={store.isLoading}
            size="xs"
            type="button"
            variant="secondary"
            onClick={() => runUserAction(() => store.resolveDraftConflict("latest"))}
          >
            {t("Inbox.compose.loadLatestDraft")}
          </Button>

          <Button
            disabled={store.isLoading || senderUnavailable}
            size="xs"
            type="button"
            onClick={() => runUserAction(() => store.resolveDraftConflict("mine"))}
          >
            {t("Inbox.compose.sendMyDraft")}
          </Button>
        </div>
      </div>
    </Alert>
  );
});
