import { activityScopeForRecord } from "@/ee/messaging/activities/activity-scope.schema";
import { EntityType, Resource } from "@/generated/prisma";

import { EntityDetailPageView } from "@/components/entity-detail/entity-detail-page-view";

import { getGetActivitiesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { ACTIVITIES_P13N_ID } from "@/features/messaging/activities/activities.store";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ContactDetailPage({ params }: Props) {
  await requireAccess({ resource: Resource.contacts });

  const { id } = await params;

  const timelineResult = await getGetActivitiesInteractor().invoke({
    scope: activityScopeForRecord(EntityType.contact, id),
    pagination: { page: 1, pageSize: 25 },
    p13nId: ACTIVITIES_P13N_ID,
  });

  return (
    <EntityDetailPageView
      entityType={EntityType.contact}
      id={id}
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
