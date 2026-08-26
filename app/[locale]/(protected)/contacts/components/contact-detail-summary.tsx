"use client";

import type { ContactIdentifierDto } from "@/features/contacts/contact.schema";
import type { EntityDetailSummaryField } from "@/components/entity-detail/entity-detail-summary";

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

import { ChannelIconStack } from "./channel-icon-stack";
import { CONTACT_DETAIL_FIELD } from "./contact-detail-personalization";

export const ContactDetailSummary = observer(function ContactDetailSummary() {
  const t = useTranslations();
  const { plural } = useEntityTerminology();
  const intlStore = useHydratedIntlStore();
  const { contactDetailStore } = useRootStore();
  const { previewFieldValues } = useEntityDetailPersonalization();
  const { fetchedEntity, form, customColumns } = contactDetailStore;
  if (!fetchedEntity) return null;

  const channels = contactDetailStore.channels.map<ContactIdentifierDto>((identifier, index) => ({
    id: `${fetchedEntity.id}-${index}`,
    provider: identifier.provider,
    value: identifier.value,
    messagingId: identifier.messagingId ?? null,
    displayName: identifier.displayName ?? null,
    profileUrl: identifier.profileUrl ?? null,
  }));
  const organizations = previewItems(
    previewFieldValues[CONTACT_DETAIL_FIELD.organizationIds],
    fetchedEntity.organizations,
  );
  const deals = previewItems(previewFieldValues[CONTACT_DETAIL_FIELD.dealIds], fetchedEntity.deals);
  const tasks = previewItems(previewFieldValues[CONTACT_DETAIL_FIELD.taskIds], fetchedEntity.tasks);
  const users = previewItems(previewFieldValues[CONTACT_DETAIL_FIELD.userIds], fetchedEntity.users);
  const fields: EntityDetailSummaryField[] = [
    {
      id: CONTACT_DETAIL_FIELD.firstName,
      label: t("Common.inputs.firstName"),
      value: form.firstName,
    },
    {
      id: CONTACT_DETAIL_FIELD.lastName,
      label: t("Common.inputs.lastName"),
      value: form.lastName,
    },
    {
      id: CONTACT_DETAIL_FIELD.identifiers,
      label: t("EntityChannels.heading"),
      value: channels.length > 0 ? <ChannelIconStack identifiers={channels} /> : "—",
    },
    {
      id: CONTACT_DETAIL_FIELD.organizationIds,
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
      id: CONTACT_DETAIL_FIELD.dealIds,
      label: plural(EntityType.deal),
      value: (
        <EntityDetailChipSummaryValue
          entityType={EntityType.deal}
          items={deals.map((item) => ({ id: item.id, label: item.name }))}
        />
      ),
    },
    {
      id: CONTACT_DETAIL_FIELD.taskIds,
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
      id: CONTACT_DETAIL_FIELD.userIds,
      label: t("Common.inputs.userIds"),
      value: <EntityDetailAvatarSummaryValue items={users} />,
    },
    {
      id: CONTACT_DETAIL_FIELD.createdAt,
      label: t("EntityDetail.fields.createdAt"),
      value: intlStore.formatNumericalShortDateTime(fetchedEntity.createdAt),
    },
    {
      id: CONTACT_DETAIL_FIELD.updatedAt,
      label: t("EntityDetail.fields.updatedAt"),
      value: intlStore.formatNumericalShortDateTime(fetchedEntity.updatedAt),
    },
  ];

  return (
    <EntityDetailSummary
      customColumns={customColumns}
      customFieldValues={Array.isArray(form.customFieldValues) ? form.customFieldValues : []}
      entityId={fetchedEntity.id}
      fields={fields}
    />
  );
});
