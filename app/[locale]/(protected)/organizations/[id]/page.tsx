import { activityScopeForRecord } from "@/ee/messaging/activities/activity-scope.schema";
import { EntityType, Resource } from "@/generated/prisma";

import { EntityDetailPageView } from "@/components/entity-detail/entity-detail-page-view";

import { getGetActivitiesInteractor, getGetOrganizationByIdInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { ACTIVITIES_P13N_ID } from "@/features/messaging/activities/activities.store";
import { getOptionalP13n } from "@/features/p13n/next/get-optional-p13n";
import { ORGANIZATION_DETAIL_P13N_ID } from "../components/organization-detail-personalization";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function OrganizationDetailPage({ params }: Props) {
  await requireAccess({ resource: Resource.organizations });

  const { id } = await params;

  const [entityResult, timelineResult, personalizationInitial] = await Promise.all([
    getGetOrganizationByIdInteractor().invoke({ id }),
    getGetActivitiesInteractor().invoke({
      scope: activityScopeForRecord(EntityType.organization, id),
      pagination: { page: 1, pageSize: 25 },
      p13nId: ACTIVITIES_P13N_ID,
    }),
    getOptionalP13n(ORGANIZATION_DETAIL_P13N_ID),
  ]);
  const entity = entityResult.ok ? entityResult.data.organization : null;

  return (
    <EntityDetailPageView
      entityInitial={entity && entityResult.ok ? { entity, customColumns: entityResult.data.customColumns } : null}
      entityType={EntityType.organization}
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
