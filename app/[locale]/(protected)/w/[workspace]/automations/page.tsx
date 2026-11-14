import { Resource } from "@/generated/prisma";

import { getGetAutomationRulesInteractor, getGetRecordModelInteractor } from "@/core/di";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { requireAccess } from "@/features/auth/next/require";
import { toAutomationBuilderModel } from "@/features/automation-rules/automation-builder-model";

import { AutomationsView, type AutomationsPrefill } from "./components/automations-view";

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

export default async function AutomationsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.routines });

  const params = await searchParams;
  const [rules, model] = await Promise.all([
    unwrapPage(getGetAutomationRulesInteractor().invoke({ page: 1, pageSize: 100, owner: "all" })),
    unwrapPage(getGetRecordModelInteractor().invoke({})),
  ]);

  return (
    <PageContainer padded={false}>
      <AutomationsView initialRules={rules.items} model={toAutomationBuilderModel(model)} prefill={prefillOf(params)} />
    </PageContainer>
  );
}
