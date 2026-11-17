import { Resource } from "@/generated/prisma";

import type { Filter } from "@/core/base/base-get.schema";

import {
  getGetAgentRuntimeAvailabilityInteractor,
  getGetAutomationsListInteractor,
  getGetPlanUsageInteractor,
  getGetRecordModelInteractor,
  getGetWebhooksInteractor,
} from "@/core/di";
import { FreePlanFeatureOverlay } from "@/app/components/upsell/free-plan-feature-overlay";
import { RoutineAllowanceNotice } from "@/app/components/upsell/routine-allowance-notice";
import { RoutinesPausedNotice } from "@/app/components/upsell/routines-paused-notice";
import { PageContainer } from "@/components/shared/page-container";
import { FREE_PLAN_ID } from "@/core/commercial/plan-catalog";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { requireAccess } from "@/features/auth/next/require";
import { AUTOMATION_LIST_KINDS } from "@/features/automation-rules/automations-list.schema";
import { env } from "@/env";

import { toAutomationBuilderModel } from "./components/automation-builder-model";
import { AutomationsPageView, type AutomationsPrefill } from "./components/automations-page-view";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function prefillOf(params: Record<string, string | string[] | undefined>): AutomationsPrefill {
  const [typeId, fieldId] = (single(params.remind) ?? "").split(":");
  if (typeId && fieldId) return { kind: "remind", typeId, fieldId };
  const created = single(params.new);
  return created ? { kind: "new", typeId: created } : null;
}

function kindFilterOf(params: Record<string, string | string[] | undefined>): Filter[] | undefined {
  const kind = single(params.kind);
  const known = AUTOMATION_LIST_KINDS.find((candidate) => candidate === kind);
  if (!known || params.filters !== undefined) return undefined;
  return [{ field: FilterFieldKey.automationKind, operator: FilterOperatorKey.in, value: [known] }];
}

export default async function AutomationsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.routines });

  const params = await searchParams;
  const listParams = await readSurfaceParams(SURFACE.routines, searchParams);
  const kindFilter = kindFilterOf(params);
  const cloud = env.APP_MODE !== "self-hosted";

  const [list, model, runtimes, webhooks, usage] = await Promise.all([
    unwrapPage(
      getGetAutomationsListInteractor().invoke(kindFilter ? { ...listParams, filters: kindFilter } : listParams),
    ),
    unwrapPage(getGetRecordModelInteractor().invoke({})),
    unwrapPage(getGetAgentRuntimeAvailabilityInteractor().invoke({})),
    getGetWebhooksInteractor().invoke({}),
    cloud ? unwrapPage(getGetPlanUsageInteractor().invoke()) : Promise.resolve(null),
  ]);
  const agentChat = cloud && env.APP_MODE !== "demo" && runtimes.mate.available;
  const free = usage?.plan === FREE_PLAN_ID;
  const routinesOnly = single(params.kind) === "routine";

  const view = (
    <AutomationsPageView
      canCreateRoutine={agentChat && !free}
      cloud={agentChat}
      composer={agentChat}
      initial={list}
      model={toAutomationBuilderModel(model)}
      prefill={prefillOf(params)}
      runtimes={runtimes}
      webhooks={
        webhooks.ok
          ? webhooks.data.items
              .filter((hook) => hook.enabled)
              .map((hook) => ({ id: hook.id, label: hook.description ?? hook.url }))
          : []
      }
    />
  );

  if (free && routinesOnly) {
    return (
      <PageContainer padded={false}>
        <FreePlanFeatureOverlay feature="routines">{view}</FreePlanFeatureOverlay>
      </PageContainer>
    );
  }

  return (
    <PageContainer padded={false}>
      {free ? <RoutinesPausedNotice /> : usage && <RoutineAllowanceNotice plan={usage.plan} />}

      {view}
    </PageContainer>
  );
}
