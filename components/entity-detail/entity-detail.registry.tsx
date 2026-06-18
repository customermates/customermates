import type { ComponentType } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";

import { EntityType } from "@/generated/prisma";

import { ContactDetailView } from "@/app/[locale]/(protected)/contacts/components/contact-detail-view";
import { OrganizationDetailView } from "@/app/[locale]/(protected)/organizations/components/organization-detail-view";
import { DealDetailView } from "@/app/[locale]/(protected)/deals/components/deal-detail-view";
import { ServiceDetailView } from "@/app/[locale]/(protected)/services/components/service-detail-view";
import { TaskDetailView } from "@/app/[locale]/(protected)/tasks/components/task-detail-view";
import { getSystemTaskNameTranslationKey } from "@/app/[locale]/(protected)/tasks/components/system-task.config";

type Translate = (key: string) => string;
type AnyDetailStore = BaseCustomColumnEntityModalStore<any, any>;

type EntityIdentity = { name: string; pictureUrl?: string | null };

type EntityDetailConfig = {
  store: (root: RootStore) => AnyDetailStore;
  DetailView: ComponentType<{ layout: "page" | "drawer" }>;
  identity: (entity: any, t: Translate) => EntityIdentity;
  canDelete?: (store: AnyDetailStore) => boolean;
};

export const ENTITY_DETAIL: Record<EntityType, EntityDetailConfig> = {
  [EntityType.contact]: {
    store: (root) => root.contactDetailStore,
    DetailView: ContactDetailView,
    identity: (c, t) => ({
      name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || t("ContactModal.title"),
      pictureUrl: c.avatarUrl ?? null,
    }),
  },
  [EntityType.organization]: {
    store: (root) => root.organizationDetailStore,
    DetailView: OrganizationDetailView,
    identity: (o, t) => ({
      name: o.name ?? t("OrganizationModal.title"),
      pictureUrl: null,
    }),
  },
  [EntityType.deal]: {
    store: (root) => root.dealDetailStore,
    DetailView: DealDetailView,
    identity: (d, t) => ({ name: d.name ?? t("DealModal.title") }),
  },
  [EntityType.service]: {
    store: (root) => root.serviceDetailStore,
    DetailView: ServiceDetailView,
    identity: (s, t) => ({ name: s.name ?? t("ServiceModal.title") }),
  },
  [EntityType.task]: {
    store: (root) => root.taskDetailStore,
    DetailView: TaskDetailView,
    identity: (task, t) => {
      const key = getSystemTaskNameTranslationKey(task.type);
      return { name: key ? t(key) : (task.name ?? t("TaskModal.title")) };
    },
    canDelete: (store) => Boolean((store as { isCustomTask?: boolean }).isCustomTask),
  },
};
