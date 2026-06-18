"use client";

import type { EntityType } from "@/generated/prisma";
import type { ActivitiesResult } from "@/ee/messaging/activities/activities.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { EntityDetailLayout } from "@/components/entity-detail/entity-detail-layout";
import { ENTITY_DETAIL } from "@/components/entity-detail/entity-detail.registry";
import { EntityTimelinePanel } from "@/features/messaging/activities/activities-panel";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  entityType: EntityType;
  id: string;
  timelineInitial: ActivitiesResult;
};

export const EntityDetailPageView = observer(({ entityType, id, timelineInitial }: Props) => {
  const t = useTranslations();
  const root = useRootStore();
  const config = ENTITY_DETAIL[entityType];
  const store = config.store(root);
  const Master = config.DetailView;

  return (
    <EntityDetailLayout
      canDelete={config.canDelete?.(store)}
      entityId={id}
      entityType={entityType}
      historyPanel={<EntityTimelinePanel entityId={id} entityType={entityType} initial={timelineInitial} />}
      identity={config.identity(store.fetchedEntity ?? {}, t)}
      masterData={<Master layout="page" />}
      store={store}
    />
  );
});
