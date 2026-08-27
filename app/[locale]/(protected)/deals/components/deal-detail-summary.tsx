"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType, TaskType } from "@/generated/prisma";

import {
  EntityDetailAvatarSummaryValue,
  EntityDetailChipSummaryValue,
  EntityDetailSummary,
  previewItems,
  type EntityDetailSummaryField,
} from "@/components/entity-detail/entity-detail-summary";
import { useEntityDetailPersonalization } from "@/components/entity-detail/entity-detail-personalization";
import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { runUserAction } from "@/core/errors/report-application-error";

import { DEAL_DETAIL_FIELD } from "./deal-detail-personalization";

export const DealDetailSummary = observer(function DealDetailSummary() {
  const t = useTranslations();
  const { plural } = useEntityTerminology();
  const columnLabel = useColumnLabel();
  const intlStore = useHydratedIntlStore();
  const { previewFieldValues } = useEntityDetailPersonalization();
  const { dealDetailStore, userModalStore } = useRootStore();
  const { fetchedEntity, form, customColumns, selectedServices, totalQuantity, totalValue, weightedValueBreakdown } =
    dealDetailStore;
  if (!fetchedEntity) return null;

  const contacts = previewItems(previewFieldValues[DEAL_DETAIL_FIELD.contactIds], fetchedEntity.contacts);
  const organizations = previewItems(
    previewFieldValues[DEAL_DETAIL_FIELD.organizationIds],
    fetchedEntity.organizations,
  );
  const tasks = previewItems(previewFieldValues[DEAL_DETAIL_FIELD.taskIds], fetchedEntity.tasks);
  const users = previewItems(previewFieldValues[DEAL_DETAIL_FIELD.userIds], fetchedEntity.users);
  const fields: EntityDetailSummaryField[] = [
    {
      id: DEAL_DETAIL_FIELD.name,
      label: t("Common.inputs.name"),
      value: form.name,
    },
    {
      id: DEAL_DETAIL_FIELD.totalValue,
      label: columnLabel("totalValue"),
      value: intlStore.formatCurrency(totalValue),
    },
    {
      id: DEAL_DETAIL_FIELD.totalQuantity,
      label: columnLabel("totalQuantity"),
      value: intlStore.formatNumber(totalQuantity),
    },
    {
      id: DEAL_DETAIL_FIELD.weightedValue,
      label: columnLabel("weightedValue"),
      value: weightedValueBreakdown ? intlStore.formatCurrency(weightedValueBreakdown.weightedValue) : undefined,
    },
    {
      id: DEAL_DETAIL_FIELD.contactIds,
      label: plural(EntityType.contact),
      value: <EntityDetailAvatarSummaryValue entityType={EntityType.contact} items={contacts} />,
    },
    {
      id: DEAL_DETAIL_FIELD.organizationIds,
      label: plural(EntityType.organization),
      value: (
        <EntityDetailChipSummaryValue
          entityType={EntityType.organization}
          items={organizations.map((item) => ({
            id: item.id,
            label: item.name,
          }))}
        />
      ),
    },
    {
      id: DEAL_DETAIL_FIELD.taskIds,
      label: plural(EntityType.task),
      value: (
        <EntityDetailChipSummaryValue
          entityType={EntityType.task}
          items={tasks.map((task) => ({
            id: task.id,
            label:
              task.type === TaskType.userPendingAuthorization
                ? t("Common.systemTasks.userPendingAuthorization.title")
                : task.name,
          }))}
        />
      ),
    },
    {
      id: DEAL_DETAIL_FIELD.serviceIds,
      label: plural(EntityType.service),
      value: (
        <EntityDetailChipSummaryValue
          entityType={EntityType.service}
          items={selectedServices.map((service) => ({
            id: service.id,
            label: service.name,
          }))}
        />
      ),
    },
    {
      id: DEAL_DETAIL_FIELD.userIds,
      label: t("Common.inputs.userIds"),
      value: (
        <EntityDetailAvatarSummaryValue
          items={users}
          onItemClick={(item) => runUserAction(() => userModalStore.loadById(item.id))}
        />
      ),
    },
    {
      id: DEAL_DETAIL_FIELD.createdAt,
      label: t("EntityDetail.fields.createdAt"),
      value: intlStore.formatRelativeTime(fetchedEntity.createdAt),
    },
    {
      id: DEAL_DETAIL_FIELD.updatedAt,
      label: t("EntityDetail.fields.updatedAt"),
      value: intlStore.formatRelativeTime(fetchedEntity.updatedAt),
    },
  ];

  return (
    <EntityDetailSummary
      customColumns={customColumns}
      customFieldValues={form.customFieldValues ?? []}
      entityId={fetchedEntity.id}
      fields={fields}
    />
  );
});
