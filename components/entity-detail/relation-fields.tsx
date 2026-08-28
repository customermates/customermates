"use client";

import type { ReactNode } from "react";
import type { EntityDetailPreviewItem } from "@/components/entity-detail/entity-detail-personalization";

import type { RelationEntityType } from "@/components/entity-detail/entity-relations";

import { RELATION_FILTER_FIELD } from "@/components/entity-detail/entity-relations";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { EntityType, Resource } from "@/generated/prisma";

import { getContactsAction, createContactByNameAction } from "@/app/[locale]/(protected)/contacts/actions";
import {
  getOrganizationsAction,
  createOrganizationByNameAction,
} from "@/app/[locale]/(protected)/organizations/actions";
import { getDealsAction, createDealByNameAction } from "@/app/[locale]/(protected)/deals/actions";
import { getServicesAction, createServiceByNameAction } from "@/app/[locale]/(protected)/services/actions";
import { getTasksAction, createTaskByNameAction } from "@/app/[locale]/(protected)/tasks/actions";
import { getUsersAction } from "@/app/[locale]/(protected)/company/actions";
import { getSystemTaskNameTranslationKey } from "@/app/[locale]/(protected)/tasks/components/system-task.config";

import {
  EntityRelationActions,
  type EntityDetailFieldPersonalization,
} from "@/components/entity-detail/entity-relation-actions";
import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { AppChip } from "@/components/chip/app-chip";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useEntityDetailPersonalization } from "@/components/entity-detail/entity-detail-personalization";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

type RelationConfig = {
  resource: Resource;
  entityType: EntityType;
  field: string;
  variant: "avatar" | "chip";
  getItems: (params: { searchTerm?: string }) => Promise<any>;
  onCreate: (name: string, userId: string | null | undefined) => Promise<any>;
  getLabel?: (data: any, t: (key: string) => string) => ReactNode;
};

const RELATION: Record<RelationEntityType, RelationConfig> = {
  contact: {
    resource: Resource.contacts,
    entityType: EntityType.contact,
    field: RELATION_FILTER_FIELD.contact,
    variant: "avatar",
    getItems: getContactsAction,
    onCreate: createContactByNameAction,
  },
  organization: {
    resource: Resource.organizations,
    entityType: EntityType.organization,
    field: RELATION_FILTER_FIELD.organization,
    variant: "chip",
    getItems: getOrganizationsAction,
    onCreate: createOrganizationByNameAction,
  },
  deal: {
    resource: Resource.deals,
    entityType: EntityType.deal,
    field: RELATION_FILTER_FIELD.deal,
    variant: "chip",
    getItems: getDealsAction,
    onCreate: createDealByNameAction,
  },
  service: {
    resource: Resource.services,
    entityType: EntityType.service,
    field: RELATION_FILTER_FIELD.service,
    variant: "chip",
    getItems: getServicesAction,
    onCreate: createServiceByNameAction,
  },
  task: {
    resource: Resource.tasks,
    entityType: EntityType.task,
    field: RELATION_FILTER_FIELD.task,
    variant: "chip",
    getItems: getTasksAction,
    onCreate: createTaskByNameAction,
    getLabel: (data, t) => {
      const nameKey = getSystemTaskNameTranslationKey(data?.type);
      return nameKey ? t(nameKey) : data?.name;
    },
  },
};

type RelationFieldProps = {
  target: RelationEntityType;
  currentEntityType: RelationEntityType;
  currentEntityId: string | undefined;
  items: readonly any[] | undefined;
  labelEndAddon?: ReactNode;
  previewFieldId?: string;
  personalization?: EntityDetailFieldPersonalization;
  visibilityFieldId?: string;
};

export const EntityRelationField = observer(
  ({
    target,
    currentEntityType,
    currentEntityId,
    items,
    labelEndAddon,
    previewFieldId,
    personalization,
    visibilityFieldId,
  }: RelationFieldProps) => {
    const { userStore } = useRootStore();
    const entityHref = useEntityHref();
    const { setPreviewFieldValue } = useEntityDetailPersonalization();
    const t = useTranslations();
    const config = RELATION[target];
    const effectivePreviewFieldId = personalization?.fieldId ?? previewFieldId;
    const publishSelection = useCallback(
      (selection: EntityDetailPreviewItem[]) => {
        if (effectivePreviewFieldId) setPreviewFieldValue(effectivePreviewFieldId, selection);
      },
      [effectivePreviewFieldId, setPreviewFieldValue],
    );

    if (!userStore.canAccess(config.resource)) return null;

    const resolveLabel = (data: any): ReactNode => {
      if (!data) return "";
      return config.getLabel ? config.getLabel(data, t) : data.name;
    };

    const common = {
      chipHref: (id: string) => entityHref(config.entityType, id),
      getItems: config.getItems,
      id: config.field,
      items: items ?? [],
      labelEndAddon: (
        <EntityRelationActions
          currentEntityId={currentEntityId}
          currentEntityType={currentEntityType}
          personalization={personalization}
          targetEntityType={target}
        >
          {labelEndAddon}
        </EntityRelationActions>
      ),
      onSelectionDataChange: effectivePreviewFieldId ? publishSelection : undefined,
      selectionMode: "multiple" as const,
      onCreate: (name: string) => config.onCreate(name, userStore.user?.id),
    };

    const fieldId = personalization?.fieldId ?? visibilityFieldId;

    if (config.variant === "avatar") {
      return (
        <EntityDetailField fieldId={fieldId}>
          <FormAutocompleteAvatar {...common} />
        </EntityDetailField>
      );
    }

    return (
      <EntityDetailField fieldId={fieldId}>
        <FormAutocomplete
          {...common}
          renderValue={(values) => values.map((v) => <AppChip key={v.key}>{resolveLabel(v.data)}</AppChip>)}
        >
          {(item) => {
            const label = resolveLabel(item);
            return FormAutocompleteItem({
              children: label,
              textValue: typeof label === "string" ? label : item.name,
            });
          }}
        </FormAutocomplete>
      </EntityDetailField>
    );
  },
);

export const AssignedUsersField = observer(
  ({
    items,
    labelEndAddon,
    previewFieldId,
    personalization,
    visibilityFieldId,
  }: {
    items: readonly any[] | undefined;
    labelEndAddon?: ReactNode;
    previewFieldId?: string;
    personalization?: EntityDetailFieldPersonalization;
    visibilityFieldId?: string;
  }) => {
    const { userModalStore, userStore } = useRootStore();
    const { setPreviewFieldValue } = useEntityDetailPersonalization();
    const t = useTranslations();
    const effectivePreviewFieldId = personalization?.fieldId ?? previewFieldId;
    const fieldLabel = personalization?.label ?? t("Common.inputs.userIds");
    const publishSelection = useCallback(
      (selection: EntityDetailPreviewItem[]) => {
        if (effectivePreviewFieldId) setPreviewFieldValue(effectivePreviewFieldId, selection);
      },
      [effectivePreviewFieldId, setPreviewFieldValue],
    );

    if (!userStore.canAccess(Resource.users)) return null;

    return (
      <EntityDetailField fieldId={personalization?.fieldId ?? visibilityFieldId}>
        <FormAutocompleteAvatar
          getItems={getUsersAction}
          id="userIds"
          items={items ?? []}
          labelEndAddon={
            personalization || labelEndAddon ? (
              <span className="flex items-center gap-1">
                {personalization && <EntityDetailFieldActions fieldId={personalization.fieldId} label={fieldLabel} />}

                {labelEndAddon}
              </span>
            ) : undefined
          }
          selectionMode="multiple"
          onChipClick={(id) => runUserAction(() => userModalStore.loadById(id))}
          onSelectionDataChange={effectivePreviewFieldId ? publishSelection : undefined}
        />
      </EntityDetailField>
    );
  },
);
