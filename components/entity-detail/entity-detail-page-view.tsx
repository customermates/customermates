"use client";

import type { EntityType } from "@/generated/prisma";
import type { ActivitiesResult } from "@/ee/messaging/activities/activities.schema";
import type { EntityDetailInitial } from "@/components/entity-detail/entity-detail-layout";
import type { P13nEntry } from "@/features/p13n/prisma-p13n.repository";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { EntityDetailLayout } from "@/components/entity-detail/entity-detail-layout";
import { ENTITY_DETAIL } from "@/components/entity-detail/entity-detail.registry";
import { EntityTimelinePanel } from "@/features/messaging/activities/activities-panel";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { EntityDetailPersonalizationProvider } from "@/components/entity-detail/entity-detail-personalization";
import { useEntityDetailServerSnapshot } from "@/components/entity-detail/use-entity-detail-server-snapshot";

type Props = {
  entityType: EntityType;
  id: string;
  entityInitial?: EntityDetailInitial | null;
  timelineInitial: ActivitiesResult;
  personalizationInitial?: P13nEntry | null;
};

export const EntityDetailPageView = observer(
  ({ entityType, id, entityInitial, timelineInitial, personalizationInitial }: Props) => {
    const t = useTranslations();
    const { singular } = useEntityTerminology();
    const root = useRootStore();
    const config = ENTITY_DETAIL[entityType];
    const store = config.store(root);
    const serverSnapshotApplied = useEntityDetailServerSnapshot(store, id, entityInitial);
    const Master = config.DetailView;
    const Summary = config.DetailSummary;
    const requestHasAuthoritativeColumns =
      store.requestedEntityId === id && (store.entityLoadState === "ready" || store.entityLoadState === "not-found");
    const customColumns =
      entityInitial?.entity.id === id && !serverSnapshotApplied
        ? entityInitial.customColumns
        : entityInitial === null && !requestHasAuthoritativeColumns
          ? undefined
          : store.customColumns;
    const personalization = config.personalization?.(customColumns, (resource) => root.userStore.canAccess(resource));
    const personalizationScope = root.userStore.user?.id ?? "anonymous";

    return (
      <EntityDetailPersonalizationProvider
        key={`${personalizationScope}:${personalization?.p13nId ?? "disabled"}:${id}`}
        config={personalization}
        customColumnIds={customColumns?.map((column) => column.id)}
        initial={personalizationInitial}
        persistenceScope={personalizationScope}
      >
        <EntityDetailLayout
          canDelete={config.canDelete?.(store)}
          entityId={id}
          entityType={entityType}
          fallbackTitle={singular(entityType)}
          historyPanel={<EntityTimelinePanel entityId={id} entityType={entityType} initial={timelineInitial} />}
          identity={config.identity(store.fetchedEntity ?? {}, t, singular(entityType))}
          masterData={<Master layout="page" />}
          serverSnapshotApplied={serverSnapshotApplied}
          showNotesPanel={config.showNotesPanel}
          store={store}
          summary={Summary ? <Summary /> : undefined}
        />
      </EntityDetailPersonalizationProvider>
    );
  },
);
