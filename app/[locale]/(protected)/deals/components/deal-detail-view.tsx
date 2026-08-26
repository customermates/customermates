"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { EntityDetailBody } from "@/components/entity-detail/entity-detail-body";
import { EntityDetailCustomFieldsSection } from "@/components/entity-detail/entity-detail-custom-fields-section";
import { EntityDetailSection, EntityDetailSectionGroup } from "@/components/entity-detail/entity-detail-section";
import { EntityDetailStarButton } from "@/components/entity-detail/entity-detail-star-button";
import { EntityDetailStaticField } from "@/components/entity-detail/entity-detail-static-field";
import { AssignedUsersField, EntityRelationField } from "@/components/entity-detail/relation-fields";
import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { FormInput } from "@/components/forms/form-input";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { DEAL_DETAIL_FIELD, DEAL_DETAIL_SECTION } from "./deal-detail-personalization";
import { DealServicesSelection } from "./deal-services-selection";

type Props = {
  layout?: "drawer" | "page";
};

export const DealDetailView = observer(({ layout = "drawer" }: Props) => {
  const t = useTranslations();
  const { plural } = useEntityTerminology();
  const columnLabel = useColumnLabel();
  const intlStore = useHydratedIntlStore();
  const { dealDetailStore } = useRootStore();
  const {
    canManage,
    isEditingCustomField,
    customColumns,
    fetchedEntity,
    totalQuantity,
    totalValue,
    weightedValueBreakdown,
  } = dealDetailStore;

  const content =
    layout === "drawer" ? (
      <>
        <FormInput autoFocus required id="name" />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="deal"
          items={fetchedEntity?.contacts}
          target="contact"
        />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="deal"
          items={fetchedEntity?.organizations}
          target="organization"
        />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="deal"
          items={fetchedEntity?.tasks}
          target="task"
        />

        <CustomFieldInputs columns={customColumns} isEditing={isEditingCustomField} />

        <AssignedUsersField items={fetchedEntity?.users} />

        <DealServicesSelection />
      </>
    ) : (
      <EntityDetailSectionGroup>
        <EntityDetailSection label={t("EntityDetail.sections.base")} sectionId={DEAL_DETAIL_SECTION.base}>
          <FormInput
            autoFocus
            required
            id="name"
            labelEndAddon={<EntityDetailStarButton fieldId={DEAL_DETAIL_FIELD.name} label={t("Common.inputs.name")} />}
          />

          <AssignedUsersField items={fetchedEntity?.users} personalization={{ fieldId: DEAL_DETAIL_FIELD.userIds }} />

          <EntityDetailStaticField
            fieldId={DEAL_DETAIL_FIELD.totalValue}
            label={columnLabel("totalValue")}
            value={intlStore.formatCurrency(totalValue)}
          />

          <EntityDetailStaticField
            fieldId={DEAL_DETAIL_FIELD.totalQuantity}
            label={columnLabel("totalQuantity")}
            value={intlStore.formatNumber(totalQuantity)}
          />

          <EntityDetailStaticField
            fieldId={DEAL_DETAIL_FIELD.weightedValue}
            label={columnLabel("weightedValue")}
            value={weightedValueBreakdown ? intlStore.formatCurrency(weightedValueBreakdown.weightedValue) : undefined}
          />

          <EntityDetailStaticField
            fieldId={DEAL_DETAIL_FIELD.createdAt}
            label={t("EntityDetail.fields.createdAt")}
            value={intlStore.formatNumericalShortDateTime(fetchedEntity?.createdAt)}
          />

          <EntityDetailStaticField
            fieldId={DEAL_DETAIL_FIELD.updatedAt}
            label={t("EntityDetail.fields.updatedAt")}
            value={intlStore.formatNumericalShortDateTime(fetchedEntity?.updatedAt)}
          />
        </EntityDetailSection>

        <EntityDetailSection label={t("EntityDetail.sections.relations")} sectionId={DEAL_DETAIL_SECTION.relations}>
          <EntityRelationField
            currentEntityId={fetchedEntity?.id}
            currentEntityType="deal"
            items={fetchedEntity?.contacts}
            personalization={{
              fieldId: DEAL_DETAIL_FIELD.contactIds,
              label: plural(EntityType.contact),
            }}
            target="contact"
          />

          <EntityRelationField
            currentEntityId={fetchedEntity?.id}
            currentEntityType="deal"
            items={fetchedEntity?.organizations}
            personalization={{
              fieldId: DEAL_DETAIL_FIELD.organizationIds,
              label: plural(EntityType.organization),
            }}
            target="organization"
          />

          <EntityRelationField
            currentEntityId={fetchedEntity?.id}
            currentEntityType="deal"
            items={fetchedEntity?.tasks}
            personalization={{
              fieldId: DEAL_DETAIL_FIELD.taskIds,
              label: plural(EntityType.task),
            }}
            target="task"
          />

          <DealServicesSelection
            personalization={{
              fieldId: DEAL_DETAIL_FIELD.serviceIds,
              label: plural(EntityType.service),
            }}
            showTotals={false}
          />
        </EntityDetailSection>

        <EntityDetailCustomFieldsSection
          canManage={canManage}
          columns={customColumns}
          entityType={EntityType.deal}
          isEditing={isEditingCustomField}
          sectionId={DEAL_DETAIL_SECTION.customFields}
        />
      </EntityDetailSectionGroup>
    );

  return (
    <EntityDetailBody entityType={EntityType.deal} layout={layout} store={dealDetailStore} titleKey="DealModal.title">
      {content}
    </EntityDetailBody>
  );
});
