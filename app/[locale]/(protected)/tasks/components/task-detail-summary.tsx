"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import {
  EntityDetailAvatarSummaryValue,
  EntityDetailChipSummaryValue,
  EntityDetailSummary,
  previewItems,
} from "@/components/entity-detail/entity-detail-summary";
import { useEntityDetailPersonalization } from "@/components/entity-detail/entity-detail-personalization";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { runUserAction } from "@/core/errors/report-application-error";

import { TASK_DETAIL_FIELD } from "./task-detail-personalization";

export const TaskDetailSummary = observer(function TaskDetailSummary() {
  const t = useTranslations();
  const { plural } = useEntityTerminology();
  const intlStore = useHydratedIntlStore();
  const { taskDetailStore, userModalStore } = useRootStore();
  const { previewFieldValues } = useEntityDetailPersonalization();
  const { fetchedEntity, form, customColumns, isCustomTask, systemTaskDisplayName } = taskDetailStore;

  if (!fetchedEntity) return null;

  const contacts = previewItems(previewFieldValues[TASK_DETAIL_FIELD.contactIds], fetchedEntity.contacts);
  const organizations = previewItems(
    previewFieldValues[TASK_DETAIL_FIELD.organizationIds],
    fetchedEntity.organizations,
  );
  const deals = previewItems(previewFieldValues[TASK_DETAIL_FIELD.dealIds], fetchedEntity.deals);
  const services = previewItems(previewFieldValues[TASK_DETAIL_FIELD.serviceIds], fetchedEntity.services);
  const users = previewItems(previewFieldValues[TASK_DETAIL_FIELD.userIds], fetchedEntity.users);
  const customFieldValues = Array.isArray(form.customFieldValues) ? form.customFieldValues : [];

  return (
    <EntityDetailSummary
      customColumns={customColumns}
      customFieldValues={customFieldValues}
      entityId={fetchedEntity.id}
      fields={[
        {
          id: TASK_DETAIL_FIELD.name,
          label: t("Common.inputs.name"),
          value: isCustomTask ? form.name : systemTaskDisplayName,
        },
        {
          id: TASK_DETAIL_FIELD.contactIds,
          label: plural(EntityType.contact),
          value: <EntityDetailAvatarSummaryValue entityType={EntityType.contact} items={contacts} />,
        },
        {
          id: TASK_DETAIL_FIELD.organizationIds,
          label: plural(EntityType.organization),
          value: (
            <EntityDetailChipSummaryValue
              entityType={EntityType.organization}
              items={organizations.map((organization) => ({
                id: organization.id,
                label: organization.name,
              }))}
            />
          ),
        },
        {
          id: TASK_DETAIL_FIELD.dealIds,
          label: plural(EntityType.deal),
          value: (
            <EntityDetailChipSummaryValue
              entityType={EntityType.deal}
              items={deals.map((deal) => ({ id: deal.id, label: deal.name }))}
            />
          ),
        },
        {
          id: TASK_DETAIL_FIELD.serviceIds,
          label: plural(EntityType.service),
          value: (
            <EntityDetailChipSummaryValue
              entityType={EntityType.service}
              items={services.map((service) => ({
                id: service.id,
                label: service.name,
              }))}
            />
          ),
        },
        {
          id: TASK_DETAIL_FIELD.userIds,
          label: t("Common.inputs.userIds"),
          value: (
            <EntityDetailAvatarSummaryValue
              items={users}
              onItemClick={(item) => runUserAction(() => userModalStore.loadById(item.id))}
            />
          ),
        },
        {
          id: TASK_DETAIL_FIELD.createdAt,
          label: t("EntityDetail.fields.createdAt"),
          value: intlStore.formatRelativeTime(fetchedEntity.createdAt),
        },
        {
          id: TASK_DETAIL_FIELD.updatedAt,
          label: t("EntityDetail.fields.updatedAt"),
          value: intlStore.formatRelativeTime(fetchedEntity.updatedAt),
        },
      ]}
    />
  );
});
