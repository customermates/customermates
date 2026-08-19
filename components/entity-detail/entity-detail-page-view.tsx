"use client";

import type { EntityType } from "@/generated/prisma";
import type { ActivitiesResult } from "@/ee/messaging/activities/activities.schema";
import type { EntityDetailInitial } from "@/components/entity-detail/entity-detail-layout";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { EntityDetailLayout } from "@/components/entity-detail/entity-detail-layout";
import { ENTITY_DETAIL } from "@/components/entity-detail/entity-detail.registry";
import { EntityTimelinePanel } from "@/features/messaging/activities/activities-panel";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";

type Props = {
  entityType: EntityType;
  id: string;
  entityInitial?: EntityDetailInitial | null;
  timelineInitial: ActivitiesResult;
};

export const EntityDetailPageView = observer(({ entityType, id, entityInitial, timelineInitial }: Props) => {
  const t = useTranslations();
  const { singular } = useEntityTerminology();
  const root = useRootStore();
  const config = ENTITY_DETAIL[entityType];
  const store = config.store(root);
  const Master = config.DetailView;

  return (
    <EntityDetailLayout
      canDelete={config.canDelete?.(store)}
      entityId={id}
      entityInitial={entityInitial}
      entityType={entityType}
      fallbackTitle={singular(entityType)}
      historyPanel={<EntityTimelinePanel entityId={id} entityType={entityType} initial={timelineInitial} />}
      identity={config.identity(store.fetchedEntity ?? {}, t, singular(entityType))}
      masterData={<Master layout="page" />}
      store={store}
    />
  );
});
