"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal } from "@/components/modal/app-modal";
import { PageState } from "@/components/page-state/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useRootStore } from "@/core/stores/root-store.provider";

import { OperatorUserDetailPanel } from "./operator-user-detail";

function OperatorUserModalSkeleton() {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-4" role="status">
      <span className="sr-only">{t("Loading.text")}</span>

      <Skeleton className="h-9 w-full" />

      <Skeleton className="h-24 w-full" />

      <Skeleton className="h-24 w-full" />

      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export const OperatorUserModal = observer(function OperatorUserModal() {
  const t = useTranslations();
  const { operatorUserModalStore: store } = useRootStore();
  const user = store.form.user;

  return (
    <AppModal size="3xl" store={store} title={t("OperatorUsers.detail.panelLabel")}>
      <AppCard>
        <AppCardHeader>
          <div className="min-w-0 grow space-y-1">
            {user ? (
              <>
                <h2 className="text-x-lg truncate">{user.displayName || user.email}</h2>

                <p className="text-x-sm truncate text-muted-foreground">{user.email}</p>
              </>
            ) : (
              <h2 className="text-x-lg truncate">{t("OperatorUsers.detail.panelLabel")}</h2>
            )}
          </div>
        </AppCardHeader>

        <AppCardBody>
          {store.isLoading && !user ? <OperatorUserModalSkeleton /> : null}

          {!store.isLoading && store.loadFailed ? (
            <PageState
              description={t("OperatorUsers.detail.errorDescription")}
              state="error"
              title={t("OperatorUsers.detail.errorTitle")}
            />
          ) : null}

          {user && !store.loadFailed ? <OperatorUserDetailPanel user={user} /> : null}
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
