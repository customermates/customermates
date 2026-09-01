import type { ComponentType } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { EntityDetailPersonalizationConfig } from "./entity-detail-personalization";

import { EntityType, Resource } from "@/generated/prisma";

import { ContactDetailView } from "@/app/[locale]/(protected)/contacts/components/contact-detail-view";
import { ContactDetailSummary } from "@/app/[locale]/(protected)/contacts/components/contact-detail-summary";
import {
  CONTACT_DETAIL_FIELD,
  CONTACT_DETAIL_P13N_ID,
  CONTACT_DETAIL_SECTION,
} from "@/app/[locale]/(protected)/contacts/components/contact-detail-personalization";
import { OrganizationDetailView } from "@/app/[locale]/(protected)/organizations/components/organization-detail-view";
import { OrganizationDetailSummary } from "@/app/[locale]/(protected)/organizations/components/organization-detail-summary";
import {
  ORGANIZATION_DETAIL_FIELD,
  ORGANIZATION_DETAIL_P13N_ID,
  ORGANIZATION_DETAIL_SECTION,
} from "@/app/[locale]/(protected)/organizations/components/organization-detail-personalization";
import { DealDetailView } from "@/app/[locale]/(protected)/deals/components/deal-detail-view";
import { DealDetailSummary } from "@/app/[locale]/(protected)/deals/components/deal-detail-summary";
import {
  DEAL_DETAIL_FIELD,
  DEAL_DETAIL_P13N_ID,
  DEAL_DETAIL_SECTION,
} from "@/app/[locale]/(protected)/deals/components/deal-detail-personalization";
import { ServiceDetailView } from "@/app/[locale]/(protected)/services/components/service-detail-view";
import { ServiceDetailSummary } from "@/app/[locale]/(protected)/services/components/service-detail-summary";
import {
  SERVICE_DETAIL_FIELD,
  SERVICE_DETAIL_P13N_ID,
  SERVICE_DETAIL_SECTION,
} from "@/app/[locale]/(protected)/services/components/service-detail-personalization";
import { TaskDetailView } from "@/app/[locale]/(protected)/tasks/components/task-detail-view";
import { TaskDetailSummary } from "@/app/[locale]/(protected)/tasks/components/task-detail-summary";
import {
  TASK_DETAIL_FIELD,
  TASK_DETAIL_P13N_ID,
  TASK_DETAIL_SECTION,
} from "@/app/[locale]/(protected)/tasks/components/task-detail-personalization";
import { getSystemTaskNameTranslationKey } from "@/app/[locale]/(protected)/tasks/components/system-task.config";

type Translate = (key: string) => string;
type AnyDetailStore = BaseCustomColumnEntityModalStore<any, any>;

type EntityIdentity = { name: string; pictureUrl?: string | null };
type CanAccess = (resource: Resource) => boolean;

type EntityDetailConfig = {
  store: (root: RootStore) => AnyDetailStore;
  DetailView: ComponentType<{ layout: "page" | "drawer" }>;
  identity: (entity: any, t: Translate, fallbackName: string) => EntityIdentity;
  canDelete?: (store: AnyDetailStore) => boolean;
  DetailSummary?: ComponentType;
  showNotesPanel?: boolean;
  personalization?: (
    customColumns: CustomColumnDto[] | undefined,
    canAccess?: CanAccess,
  ) => EntityDetailPersonalizationConfig;
};

function detailPersonalization({
  p13nId,
  builtInFieldIds,
  defaultBuiltInFieldIds,
  gatedResources,
  customColumns,
  sectionIds,
  canAccess,
}: {
  p13nId: string;
  builtInFieldIds: string[];
  defaultBuiltInFieldIds: string[];
  gatedResources: Partial<Record<string, Resource>>;
  customColumns: CustomColumnDto[] | undefined;
  sectionIds: string[];
  canAccess?: CanAccess;
}): EntityDetailPersonalizationConfig {
  const availableBuiltInFieldIds = builtInFieldIds.filter((fieldId) => {
    const resource = gatedResources[fieldId];
    return resource === undefined || canAccess === undefined || canAccess(resource);
  });
  const availableBuiltInFields = new Set(availableBuiltInFieldIds);
  const customFieldIds = customColumns?.map((column) => column.id) ?? [];

  return {
    p13nId,
    defaultStarredFieldIds: [
      ...defaultBuiltInFieldIds.filter((fieldId) => availableBuiltInFields.has(fieldId)),
      ...customFieldIds.slice(0, 2),
    ],
    availableFieldIds: customColumns === undefined ? undefined : [...availableBuiltInFieldIds, ...customFieldIds],
    defaultCollapsedSectionIds: sectionIds.slice(1),
    sectionIds,
  };
}

export const ENTITY_DETAIL: Record<EntityType, EntityDetailConfig> = {
  [EntityType.contact]: {
    store: (root) => root.contactDetailStore,
    DetailView: ContactDetailView,
    DetailSummary: ContactDetailSummary,
    personalization: (customColumns, canAccess) =>
      detailPersonalization({
        p13nId: CONTACT_DETAIL_P13N_ID,
        builtInFieldIds: Object.values(CONTACT_DETAIL_FIELD),
        defaultBuiltInFieldIds: [
          CONTACT_DETAIL_FIELD.identifiers,
          CONTACT_DETAIL_FIELD.organizationIds,
          CONTACT_DETAIL_FIELD.userIds,
        ],
        gatedResources: {
          [CONTACT_DETAIL_FIELD.organizationIds]: Resource.organizations,
          [CONTACT_DETAIL_FIELD.dealIds]: Resource.deals,
          [CONTACT_DETAIL_FIELD.taskIds]: Resource.tasks,
          [CONTACT_DETAIL_FIELD.userIds]: Resource.users,
        },
        customColumns,
        sectionIds: Object.values(CONTACT_DETAIL_SECTION),
        canAccess,
      }),
    identity: (c, _t, fallbackName) => ({
      name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || fallbackName,
      pictureUrl: c.avatarUrl ?? null,
    }),
  },
  [EntityType.organization]: {
    store: (root) => root.organizationDetailStore,
    DetailView: OrganizationDetailView,
    DetailSummary: OrganizationDetailSummary,
    personalization: (customColumns, canAccess) =>
      detailPersonalization({
        p13nId: ORGANIZATION_DETAIL_P13N_ID,
        builtInFieldIds: Object.values(ORGANIZATION_DETAIL_FIELD),
        defaultBuiltInFieldIds: [
          ORGANIZATION_DETAIL_FIELD.contactIds,
          ORGANIZATION_DETAIL_FIELD.dealIds,
          ORGANIZATION_DETAIL_FIELD.userIds,
        ],
        gatedResources: {
          [ORGANIZATION_DETAIL_FIELD.contactIds]: Resource.contacts,
          [ORGANIZATION_DETAIL_FIELD.dealIds]: Resource.deals,
          [ORGANIZATION_DETAIL_FIELD.taskIds]: Resource.tasks,
          [ORGANIZATION_DETAIL_FIELD.userIds]: Resource.users,
        },
        customColumns,
        sectionIds: Object.values(ORGANIZATION_DETAIL_SECTION),
        canAccess,
      }),
    identity: (o, _t, fallbackName) => ({
      name: o.name || fallbackName,
      pictureUrl: null,
    }),
  },
  [EntityType.deal]: {
    store: (root) => root.dealDetailStore,
    DetailView: DealDetailView,
    DetailSummary: DealDetailSummary,
    personalization: (customColumns, canAccess) =>
      detailPersonalization({
        p13nId: DEAL_DETAIL_P13N_ID,
        builtInFieldIds: Object.values(DEAL_DETAIL_FIELD),
        defaultBuiltInFieldIds: [
          DEAL_DETAIL_FIELD.totalValue,
          DEAL_DETAIL_FIELD.totalQuantity,
          DEAL_DETAIL_FIELD.organizationIds,
        ],
        gatedResources: {
          [DEAL_DETAIL_FIELD.contactIds]: Resource.contacts,
          [DEAL_DETAIL_FIELD.organizationIds]: Resource.organizations,
          [DEAL_DETAIL_FIELD.taskIds]: Resource.tasks,
          [DEAL_DETAIL_FIELD.serviceIds]: Resource.services,
          [DEAL_DETAIL_FIELD.userIds]: Resource.users,
        },
        customColumns,
        sectionIds: Object.values(DEAL_DETAIL_SECTION),
        canAccess,
      }),
    identity: (d, _t, fallbackName) => ({ name: d.name || fallbackName }),
  },
  [EntityType.service]: {
    store: (root) => root.serviceDetailStore,
    DetailView: ServiceDetailView,
    DetailSummary: ServiceDetailSummary,
    personalization: (customColumns, canAccess) =>
      detailPersonalization({
        p13nId: SERVICE_DETAIL_P13N_ID,
        builtInFieldIds: Object.values(SERVICE_DETAIL_FIELD),
        defaultBuiltInFieldIds: [
          SERVICE_DETAIL_FIELD.amount,
          SERVICE_DETAIL_FIELD.dealIds,
          SERVICE_DETAIL_FIELD.userIds,
        ],
        gatedResources: {
          [SERVICE_DETAIL_FIELD.dealIds]: Resource.deals,
          [SERVICE_DETAIL_FIELD.taskIds]: Resource.tasks,
          [SERVICE_DETAIL_FIELD.userIds]: Resource.users,
        },
        customColumns,
        sectionIds: Object.values(SERVICE_DETAIL_SECTION),
        canAccess,
      }),
    identity: (s, _t, fallbackName) => ({ name: s.name || fallbackName }),
  },
  [EntityType.task]: {
    store: (root) => root.taskDetailStore,
    DetailView: TaskDetailView,
    DetailSummary: TaskDetailSummary,
    personalization: (customColumns, canAccess) =>
      detailPersonalization({
        p13nId: TASK_DETAIL_P13N_ID,
        builtInFieldIds: Object.values(TASK_DETAIL_FIELD),
        defaultBuiltInFieldIds: [TASK_DETAIL_FIELD.contactIds, TASK_DETAIL_FIELD.userIds, TASK_DETAIL_FIELD.updatedAt],
        gatedResources: {
          [TASK_DETAIL_FIELD.contactIds]: Resource.contacts,
          [TASK_DETAIL_FIELD.organizationIds]: Resource.organizations,
          [TASK_DETAIL_FIELD.dealIds]: Resource.deals,
          [TASK_DETAIL_FIELD.serviceIds]: Resource.services,
          [TASK_DETAIL_FIELD.userIds]: Resource.users,
        },
        customColumns,
        sectionIds: Object.values(TASK_DETAIL_SECTION),
        canAccess,
      }),
    identity: (task, t, fallbackName) => {
      const key = getSystemTaskNameTranslationKey(task.type);
      return { name: key ? t(key) : task.name || fallbackName };
    },
    canDelete: (store) => Boolean((store as { isCustomTask?: boolean }).isCustomTask),
  },
};
