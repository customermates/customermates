"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppModal } from "@/components/modal/app-modal";
import { PageState } from "@/components/page-state/page-state";
import { Spinner } from "@/components/ui/spinner";
import { useRootStore } from "@/core/stores/root-store.provider";

import { OperatorUserDetailPanel } from "./operator-user-detail";

export const OperatorUserModal = observer(function OperatorUserModal() {
  const t = useTranslations();
  const { operatorUserModalStore: store, operatorUsersStore } = useRootStore();
  const user = store.form.user;

  return (
    <AppModal size="3xl" store={store} title={t("OperatorUsers.detail.panelLabel")}>
      {store.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner aria-label={t("PageState.loading")} />
        </div>
      ) : null}

      {!store.isLoading && store.loadFailed ? (
        <PageState
          description={t("OperatorUsers.detail.errorDescription")}
          state="error"
          title={t("OperatorUsers.detail.errorTitle")}
        />
      ) : null}

      {!store.isLoading && !store.loadFailed && user ? (
        <OperatorUserDetailPanel
          user={user}
          onUpdated={(next) => {
            store.applyUser(next);
            operatorUsersStore.setQueryOptions({ forceRefresh: true });
          }}
        />
      ) : null}
    </AppModal>
  );
});
