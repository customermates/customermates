"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { OperatorUserRowDto } from "@/ee/operator/operator-lists.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

import { OperatorDataViewPage } from "../operator-data-view-page";
import { useOperatorUserColumns } from "./use-operator-user-columns";

type Props = { initialUsers: GetResult<OperatorUserRowDto> };

export const OperatorUsersPageView = observer(function OperatorUsersPageView({ initialUsers }: Props) {
  const { operatorUserModalStore, operatorUsersStore } = useRootStore();
  const columns = useOperatorUserColumns();
  const t = useTranslations();

  return (
    <OperatorDataViewPage
      anchorScope="operator-users"
      columns={columns}
      emptyBody={t("OperatorUsers.emptyBody")}
      emptyTitle={t("OperatorUsers.emptyTitle")}
      initialData={initialUsers}
      searchPlaceholder={t("OperatorUsers.searchPlaceholder")}
      store={operatorUsersStore}
      onRowClick={(item) => runUserAction(() => operatorUserModalStore.openForUser(item.id))}
    />
  );
});
