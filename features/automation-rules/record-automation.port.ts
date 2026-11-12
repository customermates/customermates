import type { GetRecordInteractor } from "@/features/records/get-record.interactor";
import type { GetRecordModelInteractor } from "@/features/records/get-record-model.interactor";
import type { MutateRecordInteractor } from "@/features/records/mutate-record.interactor";
import type { CalculatedValue, RecordDto, RecordModelView, RecordRef } from "@/features/records/record-model.schema";
import type { RecordMutation } from "@/features/records/record-query.schema";
import type {
  AutomationMutationResult,
  AutomationRecordPort,
  AutomationRecordView,
} from "./automation-ports";

function recordName(record: RecordDto, model: RecordModelView): string {
  const primary = model.types.find((type) => type.id === record.ref.typeId)?.primaryFieldId;
  const result = record.fields.find((field) => field.fieldId === primary)?.result;
  return result?.state === "value" && result.value.kind === "text" ? result.value.value : "";
}

export class RecordAutomationPort implements AutomationRecordPort {
  constructor(
    private readonly models: Pick<GetRecordModelInteractor, "invoke">,
    private readonly records: Pick<GetRecordInteractor, "invoke">,
    private readonly mutations: Pick<MutateRecordInteractor, "invoke">,
  ) {}

  async model(): Promise<RecordModelView> {
    const result = await this.models.invoke({});
    if (!result.ok) throw new Error("The record model is not readable for the rule owner");
    return result.data;
  }

  async read(ref: RecordRef): Promise<AutomationRecordView | null> {
    const result = await this.records.invoke({ typeId: ref.typeId, recordId: ref.recordId });
    if (!result.ok) return null;
    const model = await this.model();
    return {
      ref,
      version: result.data.version,
      name: recordName(result.data, model),
      assignedUserIds: result.data.assignedUserIds,
      values: new Map<string, CalculatedValue>(result.data.fields.map((field) => [field.fieldId, field.result])),
    };
  }

  async mutate(input: { idempotencyKey: string; mutation: RecordMutation }): Promise<AutomationMutationResult> {
    const model = await this.model();
    const result = await this.mutations.invoke({
      expectedRevision: model.revision,
      idempotencyKey: input.idempotencyKey,
      mutation: input.mutation,
    });
    if (!result.ok) return { ok: false, message: result.error.issues[0]?.message ?? "mutationFailed" };
    if (result.data.status !== "completed") return { ok: false, message: "mutationPending" };
    return { ok: true, refs: result.data.refs };
  }
}
