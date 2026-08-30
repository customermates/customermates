"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { OperatorAuditRowDto } from "@/ee/operator/operator-lists.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";

import { OperatorDataViewPage } from "../operator-data-view-page";
import { useOperatorAuditColumns } from "./use-operator-audit-columns";

type Props = { initialEvents: GetResult<OperatorAuditRowDto> };

export const OperatorAuditPageView = observer(function OperatorAuditPageView({ initialEvents }: Props) {
  const { operatorAuditStore } = useRootStore();
  const columns = useOperatorAuditColumns();
  const t = useTranslations();

  return (
    <OperatorDataViewPage
      anchorScope="operator-audit"
      columns={columns}
      emptyBody={t("OperatorAudit.emptyBody")}
      emptyTitle={t("OperatorAudit.emptyTitle")}
      initialData={initialEvents}
      searchPlaceholder={t("OperatorAudit.searchPlaceholder")}
      store={operatorAuditStore}
    />
  );
});
