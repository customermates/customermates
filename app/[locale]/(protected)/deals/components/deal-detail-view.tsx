"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { EntityDetailBody } from "@/components/entity-detail/entity-detail-body";
import { EntityDetailCustomFieldsSection } from "@/components/entity-detail/entity-detail-custom-fields-section";
import { EntityDetailSection, EntityDetailSectionGroup } from "@/components/entity-detail/entity-detail-section";
import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { EntityDetailStaticField } from "@/components/entity-detail/entity-detail-static-field";
import { AssignedUsersField, EntityRelationField } from "@/components/entity-detail/relation-fields";
import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { FormInput } from "@/components/forms/form-input";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { DEAL_DETAIL_FIELD, DEAL_DETAIL_SECTION } from "./deal-detail-personalization";
import { DealServicesSelection } from "./deal-services-selection";
import { useDealComputedFieldHelp } from "./use-deal-computed-field-help";

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
  const computedFieldHelp = useDealComputedFieldHelp(weightedValueBreakdown);

  const content =
    layout === "drawer" ? (
      <>
        <EntityDetailField fieldId={DEAL_DETAIL_FIELD.name}>
          <FormInput autoFocus required id="name" />
        </EntityDetailField>

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="deal"
          items={fetchedEntity?.contacts}
          target="contact"
          visibilityFieldId={DEAL_DETAIL_FIELD.contactIds}
        />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="deal"
          items={fetchedEntity?.organizations}
          target="organization"
          visibilityFieldId={DEAL_DETAIL_FIELD.organizationIds}
        />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="deal"
          items={fetchedEntity?.tasks}
          target="task"
          visibilityFieldId={DEAL_DETAIL_FIELD.taskIds}
        />

        <CustomFieldInputs columns={customColumns} isEditing={isEditingCustomField} />

        <AssignedUsersField items={fetchedEntity?.users} visibilityFieldId={DEAL_DETAIL_FIELD.userIds} />

        <DealServicesSelection />
      </>
    ) : (
      <EntityDetailSectionGroup>
        <EntityDetailSection label={t("EntityDetail.sections.base")} sectionId={DEAL_DETAIL_SECTION.base}>
          <EntityDetailField fieldId={DEAL_DETAIL_FIELD.name}>
            <FormInput
              autoFocus
              required
              id="name"
              labelEndAddon={
                <EntityDetailFieldActions fieldId={DEAL_DETAIL_FIELD.name} label={t("Common.inputs.name")} />
              }
            />
          </EntityDetailField>

          <AssignedUsersField items={fetchedEntity?.users} personalization={{ fieldId: DEAL_DETAIL_FIELD.userIds }} />

          <EntityDetailStaticField
            fieldId={DEAL_DETAIL_FIELD.totalValue}
            help={computedFieldHelp.dealValue}
            label={columnLabel("totalValue")}
            value={intlStore.formatCurrency(totalValue)}
          />

          <EntityDetailStaticField
            fieldId={DEAL_DETAIL_FIELD.totalQuantity}
            help={computedFieldHelp.serviceQuantity}
            label={columnLabel("totalQuantity")}
            value={intlStore.formatNumber(totalQuantity)}
          />

          <EntityDetailStaticField
            fieldId={DEAL_DETAIL_FIELD.weightedValue}
            help={computedFieldHelp.weightedValue}
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
