import { activityScopeForRecord } from "@/ee/messaging/activities/activity-scope.schema";
import { EntityType, Resource } from "@/generated/prisma";

import { EntityDetailPageView } from "@/components/entity-detail/entity-detail-page-view";

import { getGetActivitiesInteractor, getGetDealByIdInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { ACTIVITIES_P13N_ID } from "@/features/messaging/activities/activities.store";
import { getOptionalP13n } from "@/features/p13n/next/get-optional-p13n";
import { DEAL_DETAIL_P13N_ID } from "../components/deal-detail-personalization";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function DealDetailPage({ params }: Props) {
  await requireAccess({ resource: Resource.deals });

  const { id } = await params;

  const [entityResult, timelineResult, personalizationInitial] = await Promise.all([
    getGetDealByIdInteractor().invoke({ id }),
    getGetActivitiesInteractor().invoke({
      scope: activityScopeForRecord(EntityType.deal, id),
      pagination: { page: 1, pageSize: 25 },
      p13nId: ACTIVITIES_P13N_ID,
    }),
    getOptionalP13n(DEAL_DETAIL_P13N_ID),
  ]);
  const entity = entityResult.ok ? entityResult.data.deal : null;

  return (
    <EntityDetailPageView
      entityInitial={entity && entityResult.ok ? { entity, customColumns: entityResult.data.customColumns } : null}
      entityType={EntityType.deal}
      id={id}
      personalizationInitial={personalizationInitial}
      timelineInitial={
        timelineResult.ok
          ? timelineResult.data
          : {
              availableSources: [],
              items: [],
              pageLimitReached: false,
              scopeTruncated: false,
            }
      }
    />
  );
}
