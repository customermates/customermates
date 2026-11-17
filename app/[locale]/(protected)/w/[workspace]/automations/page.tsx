import { Resource } from "@/generated/prisma";

import type { Filter } from "@/core/base/base-get.schema";

import {
  getEntitlementService,
  getGetAgentRuntimeAvailabilityInteractor,
  getGetAutomationsListInteractor,
  getGetPlanUsageInteractor,
  getGetRecordModelInteractor,
  getGetWebhooksInteractor,
} from "@/core/di";
import { RoutineAllowanceNotice } from "@/app/components/upsell/routine-allowance-notice";
import { PageContainer } from "@/components/shared/page-container";
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
  return [{ field: FilterFieldKey.automationKind, operator: "in", value: [known] }];
}

export default async function AutomationsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.routines });

  const params = await searchParams;
  const listParams = await readSurfaceParams(SURFACE.routines, searchParams);
  const kindFilter = kindFilterOf(params);
  const cloud = env.APP_MODE !== "self-hosted";

  const [list, model, runtimes, webhooks, usage, agentDenied] = await Promise.all([
    unwrapPage(
      getGetAutomationsListInteractor().invoke(kindFilter ? { ...listParams, filters: kindFilter } : listParams),
    ),
    unwrapPage(getGetRecordModelInteractor().invoke({})),
    unwrapPage(getGetAgentRuntimeAvailabilityInteractor().invoke({})),
    getGetWebhooksInteractor().invoke({}),
    cloud ? unwrapPage(getGetPlanUsageInteractor().invoke()) : Promise.resolve(null),
    cloud && env.APP_MODE !== "demo" ? getEntitlementService().require("agentChat") : Promise.resolve("demo"),
  ]);
  const agentChat = cloud && agentDenied === null;

  return (
    <PageContainer padded={false}>
      {usage && <RoutineAllowanceNotice plan={usage.plan} />}

      <AutomationsPageView
        canCreateRoutine={agentChat}
        cloud={agentChat}
        composer={agentChat}
        initial={list}
        model={toAutomationBuilderModel(model)}
        prefill={prefillOf(params)}
        runtimes={runtimes}
        webhooks={webhooks.ok ? webhooks.data.items.map((hook) => ({ id: hook.id, label: hook.name ?? hook.url })) : []}
      />
    </PageContainer>
  );
}
