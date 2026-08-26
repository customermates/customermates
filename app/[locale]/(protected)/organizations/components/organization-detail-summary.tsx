"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType, TaskType } from "@/generated/prisma";
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

import { ORGANIZATION_DETAIL_FIELD } from "./organization-detail-personalization";

export const OrganizationDetailSummary = observer(function OrganizationDetailSummary() {
  const t = useTranslations();
  const { plural } = useEntityTerminology();
  const intlStore = useHydratedIntlStore();
  const { organizationDetailStore } = useRootStore();
  const { previewFieldValues } = useEntityDetailPersonalization();
  const { fetchedEntity, form, customColumns } = organizationDetailStore;

  if (!fetchedEntity) return null;

  const contacts = previewItems(previewFieldValues[ORGANIZATION_DETAIL_FIELD.contactIds], fetchedEntity.contacts);
  const deals = previewItems(previewFieldValues[ORGANIZATION_DETAIL_FIELD.dealIds], fetchedEntity.deals);
  const tasks = previewItems(previewFieldValues[ORGANIZATION_DETAIL_FIELD.taskIds], fetchedEntity.tasks);
  const users = previewItems(previewFieldValues[ORGANIZATION_DETAIL_FIELD.userIds], fetchedEntity.users);
  const customFieldValues = Array.isArray(form.customFieldValues) ? form.customFieldValues : [];

  return (
    <EntityDetailSummary
      customColumns={customColumns}
      customFieldValues={customFieldValues}
      entityId={fetchedEntity.id}
      fields={[
        {
          id: ORGANIZATION_DETAIL_FIELD.name,
          label: t("Common.inputs.name"),
          value: form.name,
        },
        {
          id: ORGANIZATION_DETAIL_FIELD.contactIds,
          label: plural(EntityType.contact),
          value: <EntityDetailAvatarSummaryValue entityType={EntityType.contact} items={contacts} />,
        },
        {
          id: ORGANIZATION_DETAIL_FIELD.dealIds,
          label: plural(EntityType.deal),
          value: (
            <EntityDetailChipSummaryValue
              entityType={EntityType.deal}
              items={deals.map((deal) => ({ id: deal.id, label: deal.name }))}
            />
          ),
        },
        {
          id: ORGANIZATION_DETAIL_FIELD.taskIds,
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
          id: ORGANIZATION_DETAIL_FIELD.userIds,
          label: t("Common.inputs.userIds"),
          value: <EntityDetailAvatarSummaryValue items={users} />,
        },
        {
          id: ORGANIZATION_DETAIL_FIELD.createdAt,
          label: t("EntityDetail.fields.createdAt"),
          value: intlStore.formatNumericalShortDateTime(fetchedEntity.createdAt),
        },
        {
          id: ORGANIZATION_DETAIL_FIELD.updatedAt,
          label: t("EntityDetail.fields.updatedAt"),
          value: intlStore.formatNumericalShortDateTime(fetchedEntity.updatedAt),
        },
      ]}
    />
  );
});
