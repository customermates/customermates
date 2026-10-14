import {
  getGetRecordInteractor,
  getGetRecordModelInteractor,
  getManageDataViewsInteractor,
  getQueryTrashInteractor,
} from "@/core/di";
import { AgentActivityContextSchema } from "./agent-activity-context";
import { describeAgentTool, type AgentActivityDescriptor } from "./agent-activity";
import { internalToolIdentity } from "./tool-identity";

export type ResolvedAgentApprovalTarget = {
  activity: AgentActivityDescriptor;
  names: string[];
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function context(labels: string[], total: number) {
  const limited = labels.filter(Boolean).slice(0, 3);
  if (!limited.length) return undefined;
  return AgentActivityContextSchema.parse({
    labels: limited.map((label) => label.slice(0, 80)),
    ...(total > limited.length ? { additionalCount: Math.min(500, total - limited.length) } : {}),
  });
}

export async function resolvedAgentApprovalActivity(
  toolName: string,
  input: unknown,
): Promise<ResolvedAgentApprovalTarget> {
  const activity = describeAgentTool(internalToolIdentity(toolName), input);
  const data = object(input);
  if (toolName === "manage_data_views" && data.action === "delete") {
    if (typeof data.name !== "string" || typeof data.viewKey !== "string" || typeof data.surfaceKey !== "string")
      return { activity: { ...activity, context: undefined }, names: [] };
    const read = await getManageDataViewsInteractor().invoke({
      action: "read",
      surfaceKey: data.surfaceKey as never,
      viewKey: data.viewKey,
    });
    const actual = read.ok ? read.data.items?.[0]?.name : null;
    return actual === data.name
      ? { activity, names: [actual] }
      : { activity: { ...activity, context: undefined }, names: [] };
  }
  if (toolName === "manage_trash" && (data.action === "delete_permanently" || data.action === "empty")) {
    const itemIds = Array.isArray(data.itemIds)
      ? data.itemIds.filter((id): id is string => typeof id === "string")
      : [];
    const labels: string[] = [];
    const names: string[] = [];
    const foundIds: string[] = [];
    let total = 0;
    for (let page = 1; page <= (data.action === "empty" ? 1 : 5); page += 1) {
      const result = await getQueryTrashInteractor().invoke({
        ...(data.action === "delete_permanently" ? { itemIds } : {}),
        page,
        pageSize: data.action === "empty" ? 3 : 100,
      });
      if (!result.ok) return { activity: { ...activity, context: undefined }, names: [] };
      total = result.data.total;
      labels.push(...result.data.items.map((item) => `${item.kind}: ${item.label}`));
      names.push(...result.data.items.map((item) => item.label));
      foundIds.push(...result.data.items.map((item) => item.id));
      if (labels.length >= Math.min(total, itemIds.length) || data.action === "empty") break;
    }
    if (
      total === 0 ||
      (data.action === "delete_permanently" &&
        (total !== new Set(itemIds).size || itemIds.some((id) => !foundIds.includes(id))))
    )
      return { activity: { ...activity, context: undefined }, names: [] };
    const target =
      data.action === "empty"
        ? context([`all ${total} items in Trash`, ...labels], 1)
        : context(labels, itemIds.length);
    return target
      ? { activity: { ...activity, context: target }, names }
      : { activity: { ...activity, context: undefined }, names: [] };
  }
  if (toolName === "mutate_crm_record") {
    const mutation = object(data.mutation);
    if (mutation.action !== "delete" && mutation.action !== "deleteMany") return { activity, names: [] };
    const targets = mutation.action === "deleteMany" ? mutation.targets : [{ ref: mutation.ref }];
    if (!Array.isArray(targets)) return { activity: { ...activity, context: undefined }, names: [] };
    const refs = targets.map((target) => object(object(target).ref));
    const typeIds = [...new Set(refs.map((ref) => ref.typeId).filter((id): id is string => typeof id === "string"))];
    const model = await getGetRecordModelInteractor().invoke({ typeIds });
    if (!model.ok) return { activity: { ...activity, context: undefined }, names: [] };
    const labels: string[] = [];
    const names: string[] = [];
    for (const ref of refs.slice(0, 3)) {
      if (typeof ref.typeId !== "string" || typeof ref.recordId !== "string") continue;
      const type = model.data.types.find((candidate) => candidate.id === ref.typeId);
      const record = await getGetRecordInteractor().invoke({
        typeId: ref.typeId,
        recordId: ref.recordId,
      });
      if (!record.ok || !type) return { activity: { ...activity, context: undefined }, names: [] };
      const value = record.data.fields.find((field) => field.fieldId === type.primaryFieldId)?.result;
      if (value?.state !== "value" || value.value.kind !== "text")
        return { activity: { ...activity, context: undefined }, names: [] };
      labels.push(`${type.label}: ${value.value.value}`);
      names.push(value.value.value);
    }
    const target = context(labels, refs.length);
    return target
      ? { activity: { ...activity, context: target }, names }
      : { activity: { ...activity, context: undefined }, names: [] };
  }
  return { activity, names: [] };
}
