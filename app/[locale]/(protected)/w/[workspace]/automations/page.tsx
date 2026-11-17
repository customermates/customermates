import { redirect } from "next/navigation";

import { Resource } from "@/generated/prisma";

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
import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { appRedirectHref } from "@/features/auth/next/app-redirect";
import { requireAccess } from "@/features/auth/next/require";
import { env } from "@/env";

import { toAutomationBuilderModel } from "./components/automation-builder-model";
import { canonicalAutomationsSearch, showsRoutinesOnly } from "./components/automation-kind-filter";
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

async function webhookOptions(): Promise<{ id: string; label: string }[]> {
  try {
    const webhooks = await getGetWebhooksInteractor().invoke({});
    if (!webhooks.ok) return [];
    return webhooks.data.items
      .filter((hook) => hook.enabled)
      .map((hook) => ({ id: hook.id, label: hook.description ?? hook.url }));
  } catch (error) {
    if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied) return [];
    throw error;
  }
}

export default async function AutomationsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.routines });

  const params = await searchParams;
  const canonical = canonicalAutomationsSearch(params);
  if (canonical !== null) redirect(await appRedirectHref(canonical ? `/automations?${canonical}` : "/automations"));

  const listParams = await readSurfaceParams(SURFACE.routines, searchParams);
  const cloud = env.APP_MODE !== "self-hosted";

  const [list, model, runtimes, webhooks, usage] = await Promise.all([
    unwrapPage(getGetAutomationsListInteractor().invoke(listParams)),
    unwrapPage(getGetRecordModelInteractor().invoke({})),
    unwrapPage(getGetAgentRuntimeAvailabilityInteractor().invoke({})),
    webhookOptions(),
    cloud ? unwrapPage(getGetPlanUsageInteractor().invoke()) : Promise.resolve(null),
  ]);
  const agentChat = cloud && env.APP_MODE !== "demo" && runtimes.mate.available;
  const free = usage?.plan === FREE_PLAN_ID;
  const routinesOnly = showsRoutinesOnly(listParams.filters);

  const view = (
    <AutomationsPageView
      canCreateRoutine={agentChat && !free}
      cloud={agentChat}
      composer={agentChat}
      initial={list}
      model={toAutomationBuilderModel(model)}
      prefill={prefillOf(params)}
      runtimes={runtimes}
      webhooks={webhooks}
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
