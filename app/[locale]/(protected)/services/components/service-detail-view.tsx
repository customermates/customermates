"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { EntityDetailBody } from "@/components/entity-detail/entity-detail-body";
import { EntityDetailCustomFieldsSection } from "@/components/entity-detail/entity-detail-custom-fields-section";
import { EntityDetailSection, EntityDetailSectionGroup } from "@/components/entity-detail/entity-detail-section";
import { EntityDetailPinButton } from "@/components/entity-detail/entity-detail-pin-button";
import { EntityDetailStaticField } from "@/components/entity-detail/entity-detail-static-field";
import { EntityRelationField, AssignedUsersField } from "@/components/entity-detail/relation-fields";
import { FormInput } from "@/components/forms/form-input";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { SERVICE_DETAIL_FIELD, SERVICE_DETAIL_SECTION } from "./service-detail-personalization";

type Props = {
  layout?: "drawer" | "page";
};

export const ServiceDetailView = observer(({ layout = "drawer" }: Props) => {
  const t = useTranslations();
  const { plural } = useEntityTerminology();
  const { serviceDetailStore } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const { canManage, isEditingCustomField, customColumns, fetchedEntity } = serviceDetailStore;

  const amountEndContent = intlStore.companyCurrency ? (
    <span className="mr-1.5">{intlStore.formatCurrency(0).replace(/[\d\s,.-]/g, "")}</span>
  ) : undefined;

  const content =
    layout === "drawer" ? (
      <>
        <FormInput autoFocus required id="name" />

        <FormNumberInput required endContent={amountEndContent} id="amount" />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="service"
          items={fetchedEntity?.deals}
          target="deal"
        />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="service"
          items={fetchedEntity?.tasks}
          target="task"
        />

        <CustomFieldInputs columns={customColumns} isEditing={isEditingCustomField} />

        <AssignedUsersField items={fetchedEntity?.users} />
      </>
    ) : (
      <EntityDetailSectionGroup>
        <EntityDetailSection label={t("EntityDetail.sections.base")} sectionId={SERVICE_DETAIL_SECTION.base}>
          <FormInput
            autoFocus
            required
            id="name"
            labelEndAddon={
              <EntityDetailPinButton fieldId={SERVICE_DETAIL_FIELD.name} label={t("Common.inputs.name")} />
            }
          />

          <FormNumberInput
            required
            endContent={amountEndContent}
            id="amount"
            labelEndAddon={
              <EntityDetailPinButton fieldId={SERVICE_DETAIL_FIELD.amount} label={t("Common.inputs.amount")} />
            }
          />

          <AssignedUsersField
            items={fetchedEntity?.users}
            personalization={{
              fieldId: SERVICE_DETAIL_FIELD.userIds,
              label: t("Common.inputs.userIds"),
            }}
          />

          <EntityDetailStaticField
            fieldId={SERVICE_DETAIL_FIELD.createdAt}
            label={t("EntityDetail.fields.createdAt")}
            value={intlStore.formatNumericalShortDateTime(fetchedEntity?.createdAt)}
          />

          <EntityDetailStaticField
            fieldId={SERVICE_DETAIL_FIELD.updatedAt}
            label={t("EntityDetail.fields.updatedAt")}
            value={intlStore.formatNumericalShortDateTime(fetchedEntity?.updatedAt)}
          />
        </EntityDetailSection>

        <EntityDetailSection label={t("EntityDetail.sections.relations")} sectionId={SERVICE_DETAIL_SECTION.relations}>
          <EntityRelationField
            currentEntityId={fetchedEntity?.id}
            currentEntityType="service"
            items={fetchedEntity?.deals}
            personalization={{
              fieldId: SERVICE_DETAIL_FIELD.dealIds,
              label: plural(EntityType.deal),
            }}
            target="deal"
          />

          <EntityRelationField
            currentEntityId={fetchedEntity?.id}
            currentEntityType="service"
            items={fetchedEntity?.tasks}
            personalization={{
              fieldId: SERVICE_DETAIL_FIELD.taskIds,
              label: plural(EntityType.task),
            }}
            target="task"
          />
        </EntityDetailSection>

        <EntityDetailCustomFieldsSection
          canManage={canManage}
          columns={customColumns}
          entityType={EntityType.service}
          isEditing={isEditingCustomField}
          sectionId={SERVICE_DETAIL_SECTION.customFields}
        />
      </EntityDetailSectionGroup>
    );

  return (
    <EntityDetailBody
      entityType={EntityType.service}
      layout={layout}
      store={serviceDetailStore}
      titleKey="ServiceModal.title"
    >
      {content}
    </EntityDetailBody>
  );
});
