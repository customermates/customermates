import {
  getGetRecordInteractor,
  getGetRecordModelInteractor,
  getManageDataViewsInteractor,
  getQueryTrashInteractor,
} from "@/core/di";
import { AgentActivityContextSchema } from "./agent-activity-context";
import {
  describeAgentTool,
  type AgentActivityDescriptor,
} from "./agent-activity";
import { internalToolIdentity } from "./tool-identity";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function context(labels: string[], total: number) {
  const limited = labels.filter(Boolean).slice(0, 3);
  if (!limited.length) return undefined;
  return AgentActivityContextSchema.parse({
    labels: limited.map((label) => label.slice(0, 80)),
    ...(total > limited.length
      ? { additionalCount: Math.min(500, total - limited.length) }
      : {}),
  });
}

export async function resolvedAgentApprovalActivity(
  toolName: string,
  input: unknown,
): Promise<AgentActivityDescriptor> {
  const activity = describeAgentTool(internalToolIdentity(toolName), input);
  const data = object(input);
  if (toolName === "manage_data_views" && data.action === "delete") {
    if (
      typeof data.name !== "string" ||
      typeof data.viewKey !== "string" ||
      typeof data.surfaceKey !== "string"
    )
      return { ...activity, context: undefined };
    const read = await getManageDataViewsInteractor().invoke({
      action: "read",
      surfaceKey: data.surfaceKey as never,
      viewKey: data.viewKey,
    });
    const actual = read.ok ? read.data.items?.[0]?.name : null;
    return actual === data.name
      ? activity
      : { ...activity, context: undefined };
  }
  if (
    toolName === "manage_trash" &&
    (data.action === "delete_permanently" || data.action === "empty")
  ) {
    const itemIds = Array.isArray(data.itemIds)
      ? data.itemIds.filter((id): id is string => typeof id === "string")
      : [];
    const labels: string[] = [];
    const foundIds: string[] = [];
    let total = 0;
    for (let page = 1; page <= (data.action === "empty" ? 1 : 5); page += 1) {
      const result = await getQueryTrashInteractor().invoke({
        ...(data.action === "delete_permanently" ? { itemIds } : {}),
        page,
        pageSize: data.action === "empty" ? 3 : 100,
      });
      if (!result.ok) return { ...activity, context: undefined };
      total = result.data.total;
      labels.push(
        ...result.data.items.map((item) => `${item.kind}: ${item.label}`),
      );
      foundIds.push(...result.data.items.map((item) => item.id));
      if (
        labels.length >= Math.min(total, itemIds.length) ||
        data.action === "empty"
      )
        break;
    }
    if (
      total === 0 ||
      (data.action === "delete_permanently" &&
        (total !== new Set(itemIds).size ||
          itemIds.some((id) => !foundIds.includes(id))))
    )
      return { ...activity, context: undefined };
    const target =
      data.action === "empty"
        ? context([`all ${total} items in Trash`, ...labels], 1)
        : context(labels, itemIds.length);
    return target
      ? { ...activity, context: target }
      : { ...activity, context: undefined };
  }
  if (toolName === "mutate_crm_record") {
    const mutation = object(data.mutation);
    if (mutation.action !== "delete" && mutation.action !== "deleteMany")
      return activity;
    const targets =
      mutation.action === "deleteMany"
        ? mutation.targets
        : [{ ref: mutation.ref }];
    if (!Array.isArray(targets)) return { ...activity, context: undefined };
    const refs = targets.map((target) => object(object(target).ref));
    const typeIds = [
      ...new Set(
        refs
          .map((ref) => ref.typeId)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const model = await getGetRecordModelInteractor().invoke({ typeIds });
    if (!model.ok) return { ...activity, context: undefined };
    const labels: string[] = [];
    for (const ref of refs.slice(0, 3)) {
      if (typeof ref.typeId !== "string" || typeof ref.recordId !== "string")
        continue;
      const type = model.data.types.find(
        (candidate) => candidate.id === ref.typeId,
      );
      const record = await getGetRecordInteractor().invoke({
        typeId: ref.typeId,
        recordId: ref.recordId,
      });
      if (!record.ok || !type) return { ...activity, context: undefined };
      const value = record.data.fields.find(
        (field) => field.fieldId === type.primaryFieldId,
      )?.result;
      if (value?.state !== "value" || value.value.kind !== "text")
        return { ...activity, context: undefined };
      labels.push(`${type.label}: ${value.value.value}`);
    }
    const target = context(labels, refs.length);
    return target
      ? { ...activity, context: target }
      : { ...activity, context: undefined };
  }
  return activity;
}
